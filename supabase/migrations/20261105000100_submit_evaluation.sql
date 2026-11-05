-- PLAN 작업 15 — 위원 평가 제출·수정을 한 번에(트랜잭션으로) 처리하는 함수
-- PRD 5번 must 2:
--   · 평가는 회의 시작 시각부터 마감 전까지만 제출·수정할 수 있다.
--   · 위원 1명은 안건 1건에 평가 기록 1개만 가진다(다시 내면 덮어씀).
--   · 각 항목 점수는 0부터 그 항목 배점까지의 정수, 빈 항목 없음.
--   · 제척된 위원, 회의에서 제외된 위원은 낼 수 없고, 담당 팀원이 대리 입력한 기록은 위원이 고칠 수 없다.
--   · 첫 평가가 저장되면 그 위원회의 평가 방식은 잠긴다. (잠금 표시는 이 함수가 같은 순간에 남긴다)
-- Design Ref: §7 "평가 제출·수정 | 위원(링크) | 링크 유효, 제척 아님, 회의 시작 후, 마감 전, 대리 입력 기록 아님, 정수·범위·빈칸"
--
-- 왜 함수로 만드나:
--   점수를 검사할 때 쓴 평가 방식(항목·배점)이 저장 직전에 바뀌면 안 된다. 이 함수는 위원회 행을 잠근(FOR UPDATE) 채
--   방식을 읽고, 점수를 검사해 저장하고, 잠금 시각을 남긴다. 같은 순간에 평가 방식을 고치려는 요청은 끝날 때까지 기다렸다가
--   "이미 잠김"으로 거부된다. 마감 처리(작업 21)도 회의 행을 갱신하므로 이 함수가 끝날 때까지 기다린다.
-- 링크(차단·만료)는 앱이 먼저 확인하고, 이 함수는 데이터 규칙만 확인한다.
-- 결과: {"result": "ok", "total": N} 또는
--       {"result": "not-found"|"closed"|"not-started"|"not-participant"|"recused"|"proxy"|"invalid-scores"}

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
  v_n            integer;
  v_i            integer;
  v_el           jsonb;
  v_val          numeric;
  v_max          integer;
  v_total        integer := 0;
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
  -- 회의 시작 시각 "부터" 가능: 시작 시각과 같은 순간은 허용, 1밀리초라도 이르면 거부
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

  -- 점수 검사: 항목 수와 같은 길이의 배열, 각 값은 0 이상 배점 이하의 정수
  v_n := jsonb_array_length(v_criteria);
  if jsonb_typeof(p_scores) <> 'array' or jsonb_array_length(p_scores) <> v_n then
    return jsonb_build_object('result', 'invalid-scores');
  end if;
  for v_i in 0 .. v_n - 1 loop
    v_el := p_scores -> v_i;
    if jsonb_typeof(v_el) <> 'number' then
      return jsonb_build_object('result', 'invalid-scores');
    end if;
    v_val := (v_el #>> '{}')::numeric;
    v_max := (v_criteria -> v_i ->> 'maxScore')::integer;
    if v_val <> trunc(v_val) or v_val < 0 or v_val > v_max then
      return jsonb_build_object('result', 'invalid-scores');
    end if;
    v_total := v_total + v_val::integer;
  end loop;

  insert into evaluations (agenda_id, member_id, scores, total, is_proxy)
  values (p_agenda_id, p_member_id, p_scores, v_total, false)
  on conflict (agenda_id, member_id)
  do update set scores = excluded.scores,
                total = excluded.total,
                updated_at = now()
  where evaluations.is_proxy = false;

  -- 첫 평가: 이 위원회의 평가 방식을 잠근다 (이미 잠겨 있으면 그대로 둔다)
  update committees set locked_at = now() where id = v_committee_id and locked_at is null;

  return jsonb_build_object('result', 'ok', 'total', v_total);
end;
$$;

-- 공개 키(브라우저)로는 부를 수 없고, 서버의 service_role만 부른다
revoke all on function public.submit_evaluation(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_evaluation(uuid, uuid, uuid, jsonb) to service_role;
