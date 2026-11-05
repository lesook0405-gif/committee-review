-- PLAN 작업 18 — 안건별 제척 표시·해제를 한 번에(트랜잭션으로) 처리하는 함수
-- PRD 5번 must 2: 담당 팀원은 안건별로 특정 위원을 "제척(평가 제외)"으로 표시할 수 있고, 마감 전까지 해제할 수 있다.
--   · 제척된 위원은 그 안건의 평가 대상과 집계에서 빠진다 (열람·제출 숫자의 분모도 줄어든다).
--   · 이미 평가를 낸 위원을 제척해도 평가 기록은 지우지 않는다. 해제하면 그 평가가 다시 반영된다.
-- Design Ref: §5.2 제척·제척 해제 / §7 "제척·제척 해제 | 담당 팀원 | 마감 전만"
--
-- 왜 함수로 만드나:
--   "마감 전인지 확인 → 기록 추가/삭제" 사이에 마감이 끼어들면 안 된다. 이 함수는 회의 행을 잠근(FOR SHARE) 채로
--   확인하고 저장하므로, 마감 처리(작업 21)는 이 함수가 끝날 때까지 기다린다. (submit_evaluation과 같은 방식)
-- 결과: {"result": "ok"} 또는 {"result": "not-found" | "closed" | "not-participant"}
--   · 제척은 지금 이 회의에 참석 중인 위원만 할 수 있다 (회의에서 이미 빠진 위원은 평가 대상이 아니므로 제척할 필요가 없다)
--   · 같은 요청을 두 번 보내도 결과는 같다 (이미 제척이면 그대로, 제척이 아니면 해제는 아무 일도 없음)

create or replace function public.set_recusal(
  p_meeting_id uuid,
  p_agenda_id  uuid,
  p_member_id  uuid,
  p_recused    boolean
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
begin
  select m.status
    into v_status
    from agendas a
    join meetings m on m.id = a.meeting_id
   where a.id = p_agenda_id
     and a.meeting_id = p_meeting_id
     for share of m;

  if not found then
    return jsonb_build_object('result', 'not-found');
  end if;
  if v_status <> 'open' then
    return jsonb_build_object('result', 'closed');
  end if;

  if p_recused then
    if not exists (
      select 1 from meeting_members
       where meeting_id = p_meeting_id and member_id = p_member_id and removed_at is null
    ) then
      return jsonb_build_object('result', 'not-participant');
    end if;
    insert into recusals (agenda_id, member_id)
    values (p_agenda_id, p_member_id)
    on conflict (agenda_id, member_id) do nothing;
  else
    delete from recusals where agenda_id = p_agenda_id and member_id = p_member_id;
  end if;

  return jsonb_build_object('result', 'ok');
end;
$$;

-- 공개 키(브라우저)로는 부를 수 없고, 서버의 service_role만 부른다
revoke all on function public.set_recusal(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_recusal(uuid, uuid, uuid, boolean) to service_role;
