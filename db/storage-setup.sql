-- Kioku media Storage setup. Run this ONCE in the Supabase SQL editor.
-- It creates a PRIVATE bucket named "media" and Row Level Security policies on
-- storage.objects so each user can only read/write/delete objects under their
-- own prefix. Object paths look like "{auth.uid()}/{deck_id}/{filename}", so the
-- first path segment must equal the caller's auth uid.
--
-- The app cannot create buckets or storage policies, so this must be run here.
-- Safe to run more than once (idempotent).

-- 1) Private bucket (id = name = "media", public = false).
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- 2) RLS policies on storage.objects, scoped to the "media" bucket.
--    (storage.foldername(name))[1] is the first folder segment of the object key.

drop policy if exists "kioku media read own" on storage.objects;
create policy "kioku media read own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "kioku media insert own" on storage.objects;
create policy "kioku media insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "kioku media update own" on storage.objects;
create policy "kioku media update own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "kioku media delete own" on storage.objects;
create policy "kioku media delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
