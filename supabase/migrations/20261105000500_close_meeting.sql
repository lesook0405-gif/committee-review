-- PLAN 작업 20 — 평가 마감: 평가 대상 전원이 제출했을 때만 마감하고, 마감하면 되돌릴 수 없다
-- PRD 5번 must 2: "평가 대상 위원 전원이 제출해야 평가를 마감할 수 있다. 미제출 위원이 있으면 마감할 수 없고 '미제출 N명'을 표시한다.
--   N은 한 안건이라도 제출하지 않은 평가 대상 위원 수다." / "마감 후에는 평가를 수정할 수 없다."
-- Design Ref: §5.2 마감 / §5.3 현황 계산 — 평가 대상(안건별) = 회의 참석 위원 − 회의에서 제외된 위원 − 그 안건에서 제척된 위원
--
-- 왜 데이터베이스 함수로 만드나:
--   "전원 제출했는지 확인 → 마감 표시" 사이에 위원의 제출·제척·대리 입력이 끼어들면 안 된다.
--   이 함수는 회의 행을 잠그고(FOR UPDATE) 확인하며, 위원 제출·대리 입력·제척 함수는 회의 행을 FOR SHARE로 잡고 있어서
--   서로 끝날 때까지 기다린다. 그래서 "제출 직전에 마감" 또는 "마감 직후에 제출"이 섞여 들어가지 않는다.
--
-- 마감하지 않는 경우(앱이 이유를 한국어로 안내한다):
--   · 이미 마감됨 / 회의 시작 전 / 안건이 하나도 없음 / 미제출 위원이 있음(몇 명인지 함께 돌려준다)
-- 결과: {"result": "ok", "closed_at": "..."} 또는
--       {"result": "not-found"|"closed"|"not-started"|"no-agendas"} 또는 {"result": "missing", "count": N}

create or replace function public.close_meeting(p_meeting_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status    text;
  v_starts_at timestamptz;
  v_missing   integer;
  v_closed_at timestamptz;
begin
  select status, starts_at
    into v_status, v_starts_at
    from meetings
   where id = p_meeting_id
     for update;

  if not found then
    return jsonb_build_object('result', 'not-found');
  end if;
  if v_status <> 'open' then
    return jsonb_build_object('result', 'closed');
  end if;
  if now() < v_starts_at then
    return jsonb_build_object('result', 'not-started');
  end if;
  if not exists (select 1 from agendas where meeting_id = p_meeting_id) then
    return jsonb_build_object('result', 'no-agendas');
  end if;

  -- 미제출 위원: 한 안건이라도 "평가 대상인데 평가 기록이 없는" 위원의 수
  select count(distinct mm.member_id)
    into v_missing
    from meeting_members mm
    join agendas a on a.meeting_id = mm.meeting_id
   where mm.meeting_id = p_meeting_id
     and mm.removed_at is null
     and not exists (select 1 from recusals r where r.agenda_id = a.id and r.member_id = mm.member_id)
     and not exists (select 1 from evaluations e where e.agenda_id = a.id and e.member_id = mm.member_id);

  if v_missing > 0 then
    return jsonb_build_object('result', 'missing', 'count', v_missing);
  end if;

  v_closed_at := now();
  update meetings set status = 'closed', closed_at = v_closed_at where id = p_meeting_id;
  return jsonb_build_object('result', 'ok', 'closed_at', v_closed_at);
end;
$$;

-- 공개 키(브라우저)로는 부를 수 없고, 서버의 service_role만 부른다
revoke all on function public.close_meeting(uuid) from public, anon, authenticated;
grant execute on function public.close_meeting(uuid) to service_role;
