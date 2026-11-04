-- Plan 작업 3 준비 — 안건 PDF 비공개 보관함 만들기
-- Design Ref: §8 보안 설계 — "PDF 보관함은 비공개이고 PDF·30MB 제한을 건다"
--   public = false      → 공개 주소로는 절대 열리지 않는다 (열람은 서버가 발급하는 5분짜리 임시 주소로만)
--   file_size_limit     → 30MB(31,457,280바이트) 초과 파일은 보관함이 직접 거부
--   allowed_mime_types  → PDF만 받는다
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agendas', 'agendas', false, 31457280, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
