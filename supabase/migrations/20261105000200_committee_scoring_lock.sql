-- PLAN 작업 16 — 첫 평가가 저장되면 위원회의 평가 방식을 잠그는 규칙을 데이터베이스 안에 장치로 넣는다
-- PRD 5번 must 2: "그 위원회에 첫 평가(대리 입력 포함)가 제출된 뒤에는 평가 방식(항목, 배점, 가결 기준 점수, 제외 옵션)을 바꿀 수 없다."
-- Design Ref: §6.2 committees "잠김 여부" / §7 "위원회 등록·평가 방식 수정 | 잠김이면 거부"
--
-- 왜 데이터베이스 장치로 만드나:
--   평가를 저장하는 길이 위원 제출(submit_evaluation)과 담당 팀원 대리 입력(작업 19) 두 가지 이상이다.
--   각 길마다 "잠금 표시"를 빠뜨리지 않게 코드로 기억하는 대신, 평가가 저장되는 순간 무조건 잠기게 하고,
--   잠긴 위원회는 앱 코드가 어떻게 부르든 평가 방식을 바꿀 수 없게 한다. (앱 쪽 확인은 그대로 두고, 이 장치가 마지막 방어선이다)

-- 1) 평가 기록이 처음 들어오면 그 위원회를 잠근다 (위원 제출·대리 입력·그 밖의 어떤 경로든)
create or replace function public.lock_committee_on_first_evaluation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update committees c
     set locked_at = now()
    from agendas a
    join meetings m on m.id = a.meeting_id
   where a.id = new.agenda_id
     and c.id = m.committee_id
     and c.locked_at is null;
  return new;
end;
$$;

drop trigger if exists evaluations_lock_committee on public.evaluations;
create trigger evaluations_lock_committee
  after insert on public.evaluations
  for each row execute function public.lock_committee_on_first_evaluation();

-- 2) 잠긴 위원회는 평가 방식을 바꿀 수 없고, 잠금을 풀 수도 없다 (이름만은 바꿀 수 있다)
create or replace function public.protect_locked_committee()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.locked_at is not null then
    if new.locked_at is distinct from old.locked_at then
      raise exception '잠긴 위원회의 잠금은 풀 수 없습니다.' using errcode = 'check_violation';
    end if;
    if new.criteria is distinct from old.criteria
       or new.pass_score is distinct from old.pass_score
       or new.exclude_extremes is distinct from old.exclude_extremes then
      raise exception '첫 평가가 제출되어 평가 방식을 바꿀 수 없습니다.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists committees_protect_locked on public.committees;
create trigger committees_protect_locked
  before update on public.committees
  for each row execute function public.protect_locked_committee();

-- 3) 이미 평가 기록이 있는데 잠기지 않은 위원회가 있으면 지금 잠근다 (보정)
update public.committees c
   set locked_at = now()
 where c.locked_at is null
   and exists (
     select 1 from evaluations e
       join agendas a on a.id = e.agenda_id
       join meetings m on m.id = a.meeting_id
      where m.committee_id = c.id
   );
