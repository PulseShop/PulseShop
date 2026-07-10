-- Shopper accounts + follows
-- Not every auth user is a merchant any more: signups tagged
-- account_type='shopper' get an auth user but NO merchant profile. Existing
-- signups carry no account_type, so they default to merchant.

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Shopper accounts don't own a shop — skip the merchant profile.
  if coalesce(new.raw_user_meta_data->>'account_type', 'merchant') <> 'merchant' then
    return new;
  end if;
  insert into merchants (id, name, handle, location, whatsapp, instagram, facebook)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'shop_name', 'My Shop'),
    coalesce(new.raw_user_meta_data->>'shop_slug', 'shop-' || left(new.id::text, 8)),
    coalesce(new.raw_user_meta_data->>'city', ''),
    coalesce(new.raw_user_meta_data->>'whatsapp', ''),
    coalesce(new.raw_user_meta_data->>'instagram', ''),
    coalesce(new.raw_user_meta_data->>'facebook', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- follows  (a signed-in user following a shop, Instagram-style)
-- ---------------------------------------------------------------------------
create table follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid not null references merchants(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, merchant_id)
);

create index follows_merchant_idx on follows(merchant_id);

alter table follows enable row level security;

-- each user manages only their own follows
create policy "follows owner all" on follows for all
  using (auth.uid() = follower_id) with check (auth.uid() = follower_id);
