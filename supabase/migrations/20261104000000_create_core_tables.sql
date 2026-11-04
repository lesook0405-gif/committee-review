-- Plan 작업 2 — 데이터 구조 만들기
-- Design Ref: §6 데이터 구조 (위원회 → 회의 → 안건, 위원, 회의 참석 위원, 평가, 열람 기록, 제척)
--
-- 보안 원칙 (Design Ref: §1.1, §8)
--   모든 표에 RLS(행 단위 보안)를 켜고 허용 규칙을 하나도 만들지 않는다.
--   → 브라우저용 공개 키로는 어떤 표도 읽거나 쓸 수 없다.
--   → 앱 서버만 비밀 키(service_role)로 접근하고, 권한 검사는 서버 코드에서 한다.

-- ─────────────────────────────────────────────
-- 0. 평가 방식 검사 함수
--    평가 항목: [{ "name": "적정성", "maxScore": 30 }, ...] 형태, 1~10개
--    배점: 양의 정수 / 가결 기준 점수: 0 ~ 배점 합계 사이 정수
-- ─────────────────────────────────────────────
create function public.scoring_is_valid(criteria jsonb, pass_score integer)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  total integer := 0;
begin
  if criteria is null or jsonb_typeof(criteria) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(criteria) < 1 or jsonb_array_length(criteria) > 10 then
    return false;
  end if;

  for item in select * from jsonb_array_elements(criteria) loop
    -- 항목 이름: 비어 있지 않은 글자
    if jsonb_typeof(item -> 'name') is distinct from 'string'
       or length(btrim(item ->> 'name')) = 0 then
      return false;
    end if;
    -- 배점: 양의 정수
    if jsonb_typeof(item -> 'maxScore') is distinct from 'number'
       or (item ->> 'maxScore')::numeric <= 0
       or (item ->> 'maxScore')::numeric % 1 <> 0 then
      return false;
    end if;
    total := total + (item ->> 'maxScore')::integer;
  end loop;

  return pass_score is not null and pass_score between 0 and total;
end;
$$;

-- ─────────────────────────────────────────────
-- 1. 담당 팀원·팀장 (미리 등록, 가입 화면 없음)
-- ─────────────────────────────────────────────
create table public.staff (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  role        text not null check (role in ('staff', 'lead')),  -- staff = 담당 팀원, lead = 팀장(열람만)
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 2. 위원회 (평가 방식을 함께 저장)
-- ─────────────────────────────────────────────
create table public.committees (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(btrim(name)) > 0),
  criteria          jsonb not null,                       -- 평가 항목과 배점
  pass_score        integer not null,                     -- 가결 기준 점수 (정수)
  exclude_extremes  boolean not null default false,       -- 최고·최저점 제외 옵션
  locked_at         timestamptz,                          -- 첫 평가 후 평가 방식 잠김 시각 (작업 16)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint committees_scoring_valid check (public.scoring_is_valid(criteria, pass_score))
);

-- ─────────────────────────────────────────────
-- 3. 위원 (위원회 소속)
-- ─────────────────────────────────────────────
create table public.members (
  id            uuid primary key default gen_random_uuid(),
  committee_id  uuid not null references public.committees (id) on delete cascade,
  name          text not null check (length(btrim(name)) > 0),
  email         text not null,
  phone         text not null,                            -- 화면에는 서버에서 가운데를 가려 보냄
  created_at    timestamptz not null default now()
);
create index members_committee_id_idx on public.members (committee_id);

-- ─────────────────────────────────────────────
-- 4. 회의 (회차)
--    starts_at: 한국 시간으로 입력받아 시간대 포함 형식으로 저장 (평가 시작 시각)
--    링크 만료 시각 = closed_at + 7일 (따로 저장하지 않고 계산)
-- ─────────────────────────────────────────────
create table public.meetings (
  id            uuid primary key default gen_random_uuid(),
  committee_id  uuid not null references public.committees (id) on delete cascade,
  title         text not null check (length(btrim(title)) > 0),
  starts_at     timestamptz not null,
  status        text not null default 'open' check (status in ('open', 'closed')),  -- open = 진행 중, closed = 마감
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  -- 마감 상태와 마감 시각은 항상 함께 있다
  constraint meetings_closed_consistent check ((status = 'closed') = (closed_at is not null))
);
create index meetings_committee_id_idx on public.meetings (committee_id);

-- ─────────────────────────────────────────────
-- 5. 회의 참석 위원 (위원별 링크)
--    link_ciphertext: MEMBER_LINK_SECRET으로 암호화한 링크값 (담당 팀원이 다시 복사할 수 있게)
--    link_fingerprint: 접속할 때 찾기 위한 지문 값 (HMAC)
--    blocked_at / removed_at 이 있으면 접속 거부
-- ─────────────────────────────────────────────
create table public.meeting_members (
  id                uuid primary key default gen_random_uuid(),
  meeting_id        uuid not null references public.meetings (id) on delete cascade,
  member_id         uuid not null references public.members (id) on delete cascade,
  link_ciphertext   text,
  link_fingerprint  text unique,
  link_issued_at    timestamptz,
  blocked_at        timestamptz,                          -- 링크 차단 시각 (재발급하면 지움)
  removed_at        timestamptz,                          -- 회의에서 제외한 시각 (다시 추가하면 지움)
  created_at        timestamptz not null default now(),
  constraint meeting_members_unique unique (meeting_id, member_id)  -- 회의 + 위원 조합당 1개
);
create index meeting_members_member_id_idx on public.meeting_members (member_id);

-- ─────────────────────────────────────────────
-- 6. 안건 (회의에 올린 PDF)
-- ─────────────────────────────────────────────
create table public.agendas (
  id              uuid primary key default gen_random_uuid(),
  meeting_id      uuid not null references public.meetings (id) on delete cascade,
  position        integer not null check (position >= 1),      -- 안건 순서
  title           text not null check (length(btrim(title)) > 0),
  pdf_path        text not null unique,                         -- 비공개 보관함 안의 위치
  pdf_size_bytes  integer not null check (pdf_size_bytes between 1 and 31457280),  -- 30MB 이하
  uploaded_at     timestamptz not null default now(),
  constraint agendas_position_unique unique (meeting_id, position)
);

-- ─────────────────────────────────────────────
-- 7. 열람 기록 (안건 + 위원 조합당 1개, 처음 연 시각만)
-- ─────────────────────────────────────────────
create table public.agenda_views (
  agenda_id        uuid not null references public.agendas (id) on delete cascade,
  member_id        uuid not null references public.members (id) on delete cascade,
  first_viewed_at  timestamptz not null default now(),
  primary key (agenda_id, member_id)
);
create index agenda_views_member_id_idx on public.agenda_views (member_id);

-- ─────────────────────────────────────────────
-- 8. 제척 (안건 + 위원 조합당 1개, 해제 = 행 삭제)
-- ─────────────────────────────────────────────
create table public.recusals (
  agenda_id   uuid not null references public.agendas (id) on delete cascade,
  member_id   uuid not null references public.members (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (agenda_id, member_id)
);
create index recusals_member_id_idx on public.recusals (member_id);

-- ─────────────────────────────────────────────
-- 9. 평가 (안건 + 위원 조합당 1개)
--    scores: 항목 순서대로 점수 배열 (예: [25, 35, 20])
--    제외·제척돼도 지우지 않는다 (집계에서만 뺌)
-- ─────────────────────────────────────────────
create table public.evaluations (
  id            uuid primary key default gen_random_uuid(),
  agenda_id     uuid not null references public.agendas (id) on delete cascade,
  member_id     uuid not null references public.members (id) on delete cascade,
  scores        jsonb not null check (jsonb_typeof(scores) = 'array'),
  total         integer not null check (total >= 0),
  is_proxy      boolean not null default false,          -- 담당 팀원 대리 입력 여부
  submitted_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint evaluations_unique unique (agenda_id, member_id)
);
create index evaluations_member_id_idx on public.evaluations (member_id);

-- ─────────────────────────────────────────────
-- 10. 행 단위 보안 켜기 (허용 규칙 없음 = 공개 키로는 접근 불가)
-- ─────────────────────────────────────────────
alter table public.staff            enable row level security;
alter table public.committees       enable row level security;
alter table public.members          enable row level security;
alter table public.meetings         enable row level security;
alter table public.meeting_members  enable row level security;
alter table public.agendas          enable row level security;
alter table public.agenda_views     enable row level security;
alter table public.recusals         enable row level security;
alter table public.evaluations      enable row level security;
