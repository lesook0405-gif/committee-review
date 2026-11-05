-- PLAN 작업 14 — 안건 PDF 교체를 한 번에(트랜잭션으로) 처리하는 함수
-- PRD 5번: 안건 PDF는 그 안건에 첫 평가(제외·제척 위원 기록, 대리 입력 포함)가 제출되기 전까지만 교체할 수 있고,
--          교체하면 그 안건의 열람 기록을 초기화한다.
-- Design Ref: §5.2 안건 교체 — "③에서 평가 기록 0건을 다시 확인 → 새 파일로 바꾸고 옛 파일 삭제 → 그 안건의 열람 기록 삭제"
--
-- 왜 함수로 만드나:
--   "평가 0건 확인 → 파일 위치 바꾸기 → 열람 기록 지우기"를 따로따로 하면, 확인한 직후 누군가 평가를 내는 틈이 생긴다.
--   이 함수는 안건 행을 잠근(FOR UPDATE) 상태에서 세 가지를 한 번에 하므로, 그 사이 평가 저장은 끝날 때까지 기다린다.
--   (평가 저장은 안건을 참조하므로 잠긴 안건 행에 막힌다.)
-- 결과: {"result": "ok", "old_path": "..."} 또는 {"result": "not-found" | "closed" | "evaluated"}
-- 옛 파일 삭제는 보관함 일이라 서버 코드(lib/db/agendas.ts)가 이 함수가 성공한 뒤 한다.

create or replace function public.replace_agenda_pdf(
  p_meeting_id uuid,
  p_agenda_id  uuid,
  p_new_path   text,
  p_new_size   integer
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old_path text;
  v_status   text;
begin
  select a.pdf_path, m.status
    into v_old_path, v_status
    from agendas a
    join meetings m on m.id = a.meeting_id
   where a.id = p_agenda_id
     and a.meeting_id = p_meeting_id
     for update of a;

  if not found then
    return jsonb_build_object('result', 'not-found');
  end if;
  if v_status <> 'open' then
    return jsonb_build_object('result', 'closed');
  end if;
  -- 제외·제척된 위원의 기록과 대리 입력도 모두 "평가 기록"이다
  if exists (select 1 from evaluations where agenda_id = p_agenda_id) then
    return jsonb_build_object('result', 'evaluated');
  end if;

  update agendas
     set pdf_path = p_new_path,
         pdf_size_bytes = p_new_size,
         uploaded_at = now()
   where id = p_agenda_id;

  delete from agenda_views where agenda_id = p_agenda_id;

  return jsonb_build_object('result', 'ok', 'old_path', v_old_path);
end;
$$;

-- 공개 키(브라우저)로는 부를 수 없고, 서버의 service_role만 부른다
revoke all on function public.replace_agenda_pdf(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.replace_agenda_pdf(uuid, uuid, text, integer) to service_role;
