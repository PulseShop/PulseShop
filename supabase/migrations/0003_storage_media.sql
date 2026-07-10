-- Public bucket for merchant/product images (avatars, banners, product photos).
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Anyone can read (public storefront images).
drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects
  for select using (bucket_id = 'media');

-- Signed-in merchants can upload / manage files in the bucket.
drop policy if exists "media auth insert" on storage.objects;
create policy "media auth insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'media');

drop policy if exists "media auth update" on storage.objects;
create policy "media auth update" on storage.objects
  for update to authenticated using (bucket_id = 'media');

drop policy if exists "media auth delete" on storage.objects;
create policy "media auth delete" on storage.objects
  for delete to authenticated using (bucket_id = 'media');
