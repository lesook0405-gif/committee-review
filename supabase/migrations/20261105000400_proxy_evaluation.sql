-- PLAN 작업 19 — 담당 팀원의 평가 대리 입력·수정
-- PRD 5번 must 2:
--   · 위원이 앱에서 제출하지 못하면 담당 팀원이 종이로 받은 점수를 대신 입력할 수 있다. "대리 입력"으로 표시한다.
--   · 대리 입력은 아직 제출하지 않은 평가 대상 위원에게만 할 수 있다. 위원 제출과 똑같이 "첫 평가"로 본다(평가 방식 잠금, 안건 PDF 교체 금지).
--   · 대리 입력한 기록은 담당 팀원만 마감 전까지 고칠 수 있고, 위원 화면에서는 고칠 수 없다.
--   · 점수 검사와 시간 규칙(회의 시작 후·마감 전)은 위원 제출과 똑같다.
-- Design Ref: §5.2 대리 입력·대리 입력 수정 / §7 "대리 입력 | 담당 팀원 | 평가 대상·미제출, 회의 시작 후·마감 전, 같은 점수 검사"

-- 1) 점수 검사를 한 곳으로: 위원 제출(submit_evaluation)과 대리 입력(save_proxy_evaluation)이 같은 규칙을 쓰게 한다.
--    항목 수와 같은 길이의 배열, 각 값은 0 이상 그 항목 배점 이하의 정수. 맞으면 합계, 하나라도 틀리면 null.
create or replace function public.evaluation_total(p_criteria jsonb, p_scores jsonb)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_n     integer;
  v_i     integer;
  v_el    jsonb;
  v_val   numeric;
  v_max   integer;
  v_total integer := 0;
begin
  v_n := jsonb_array_length(p_criteria);
  if jsonb_typeof(p_scores) <> 'array' or jsonb_array_length(p_scores) <> v_n then
    return null;
  end if;
  for v_i in 0 .. v_n - 1 loop
    v_el := p_scores -> v_i;
    if jsonb_typeof(v_el) <> 'number' then
      return null;
    end if;
    v_val := (v_el #>> '{}')::numeric;
    v_max := (p_criteria -> v_i ->> 'maxScore')::integer;
    if v_val <> trunc(v_val) or v_val < 0 or v_val > v_max then
      return null;
    end if;
    v_total := v_total + v_val::integer;
  end loop;
  return v_total;
end;
$$;

-- 2) 위원 제출 함수가 공용 점수 검사를 쓰도록 바꾼다 (동작은 그대로)
create or replace function public.submit_evaluation(
  p_meeting_id uuid,
  p_agenda_id  uuid,
  p_member_id  uuid,
  p_scores     jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_committee_id uuid;
  v_status       text;
  v_starts_at    timestamptz;
  v_criteria     jsonb;
  v_total        integer;
  v_is_proxy     boolean;
begin
  select m.committee_id, m.status, m.starts_at, c.criteria
    into v_committee_id, v_status, v_starts_at, v_criteria
    from agendas a
    join meetings m on m.id = a.meeting_id
    join committees c on c.id = m.committee_id
   where a.id = p_agenda_id
     and a.meeting_id = p_meeting_id
     for update of c
     for share of m;

  if not found then
    return jsonb_build_object('result', 'not-found');
  end if;
  if v_status <> 'open' then
    return jsonb_build_object('result', 'closed');
  end if;
  if now() < v_starts_at then
    return jsonb_build_object('result', 'not-started');
  end if;
  if not exists (
    select 1 from meeting_members
     where meeting_id = p_meeting_id and member_id = p_member_id and removed_at is null
  ) then
    return jsonb_build_object('result', 'not-participant');
  end if;
  if exists (select 1 from recusals where agenda_id = p_agenda_id and member_id = p_member_id) then
    return jsonb_build_object('result', 'recused');
  end if;
  select is_proxy into v_is_proxy
    from evaluations where agenda_id = p_agenda_id and member_id = p_member_id;
  if found and v_is_proxy then
    return jsonb_build_object('result', 'proxy');
  end if;

  v_total := evaluation_total(v_criteria, p_scores);
  if v_total is null then
    return jsonb_build_object('result', 'invalid-scores');
  end if;

  insert into evaluations (agenda_id, member_id, scores, total, is_proxy)
  values (p_agenda_id, p_member_id, p_scores, v_total, false)
  on conflict (agenda_id, member_id)
  do update set scores = excluded.scores,
                total = excluded.total,
                updated_at = now()
  where evaluations.is_proxy = false;

  update committees set locked_at = now() where id = v_committee_id and locked_at is null;

  return jsonb_build_object('result', 'ok', 'total', v_total);
end;
$$;

-- 3) 대리 입력·수정: 기록이 없으면 새로 "대리 입력"으로 저장, 이미 대리 입력 기록이면 점수를 고친다("대리 입력" 표시 유지).
--    위원이 앱에서 직접 제출한 기록이 있으면 거부(위원의 기록은 담당 팀원도 고치지 않는다).
--    위원회 행을 잠그고(FOR UPDATE) 처리하므로 같은 순간의 위원 제출·평가 방식 수정과 순서가 섞이지 않는다.
-- 결과: {"result": "ok", "total": N, "created": true|false} 또는
--       {"result": "not-found"|"closed"|"not-started"|"not-participant"|"recused"|"submitted"|"invalid-scores"}
create or replace function public.save_proxy_evaluation(
  p_meeting_id uuid,
  p_agenda_id  uuid,
  p_member_id  uuid,
  p_scores     jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_committee_id uuid;
  v_status       text;
  v_starts_at    timestamptz;
  v_criteria     jsonb;
  v_total        integer;
  v_is_proxy     boolean;
  v_existing     boolean;
begin
  select m.committee_id, m.status, m.starts_at, c.criteria
    into v_committee_id, v_status, v_starts_at, v_criteria
    from agendas a
    join meetings m on m.id = a.meeting_id
    join committees c on c.id = m.committee_id
   where a.id = p_agenda_id
     and a.meeting_id = p_meeting_id
     for update of c
     for share of m;

  if not found then
    return jsonb_build_object('result', 'not-found');
  end if;
  if v_status <> 'open' then
    return jsonb_build_object('result', 'closed');
  end if;
  if now() < v_starts_at then
    return jsonb_build_object('result', 'not-started');
  end if;
  if not exists (
    select 1 from meeting_members
     where meeting_id = p_meeting_id and member_id = p_member_id and removed_at is null
  ) then
    return jsonb_build_object('result', 'not-participant');
  end if;
  if exists (select 1 from recusals where agenda_id = p_agenda_id and member_id = p_member_id) then
    return jsonb_build_object('result', 'recused');
  end if;

  select is_proxy into v_is_proxy
    from evaluations where agenda_id = p_agenda_id and member_id = p_member_id;
  v_existing := found;
  if v_existing and not v_is_proxy then
    return jsonb_build_object('result', 'submitted');
  end if;

  v_total := evaluation_total(v_criteria, p_scores);
  if v_total is null then
    return jsonb_build_object('result', 'invalid-scores');
  end if;

  if v_existing then
    update evaluations
       set scores = p_scores, total = v_total, updated_at = now()
     where agenda_id = p_agenda_id and member_id = p_member_id and is_proxy = true;
  else
    insert into evaluations (agenda_id, member_id, scores, total, is_proxy)
    values (p_agenda_id, p_member_id, p_scores, v_total, true);
  end if;

  update committees set locked_at = now() where id = v_committee_id and locked_at is null;

  return jsonb_build_object('result', 'ok', 'total', v_total, 'created', not v_existing);
end;
$$;

-- 공개 키(브라우저)로는 부를 수 없고, 서버의 service_role만 부른다
revoke all on function public.evaluation_total(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.evaluation_total(jsonb, jsonb) to service_role;
revoke all on function public.save_proxy_evaluation(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_proxy_evaluation(uuid, uuid, uuid, jsonb) to service_role;
revoke all on function public.submit_evaluation(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_evaluation(uuid, uuid, uuid, jsonb) to service_role;
