-- PLAN 작업 21 점검 중 발견한 보완 — 마감 시각을 "실제로 마감한 순간"으로 남긴다
-- 문제: close_meeting은 now()로 마감 시각을 남겼는데, now()는 "이 처리가 시작된 시각"이다.
--   마감 처리가 먼저 시작되었더라도 다른 제출·제척 처리가 끝나길 기다렸다가(회의 행 잠금) 마감하면,
--   그 제출·제척 기록보다 더 이른 시각이 마감 시각으로 남아 "마감 뒤에 제출된 것처럼" 보인다.
--   (동작 순서는 올바르지만 기록된 시각이 실제 순서와 어긋난다 — 나중에 감사·확인할 때 혼란을 준다.)
-- 해결: 잠금을 얻고 모든 확인을 마친 뒤 clock_timestamp()(호출한 그 순간의 시각)를 마감 시각으로 쓴다.
-- 그 밖의 동작은 20261105000500_close_meeting.sql과 같다.

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

  v_closed_at := clock_timestamp();
  update meetings set status = 'closed', closed_at = v_closed_at where id = p_meeting_id;
  return jsonb_build_object('result', 'ok', 'closed_at', v_closed_at);
end;
$$;

revoke all on function public.close_meeting(uuid) from public, anon, authenticated;
grant execute on function public.close_meeting(uuid) to service_role;
