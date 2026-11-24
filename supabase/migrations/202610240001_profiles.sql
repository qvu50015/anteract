create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 50),
  major text not null default '' check (char_length(major) <= 100),
  class_year text not null default '' check (char_length(class_year) <= 40),
  interests text[] not null default '{}',
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_interests_limit check (cardinality(interests) <= 10)
);

create index profiles_updated_at_idx on public.profiles (updated_at desc);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

create policy "UCI students can view profiles"
  on public.profiles for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );

create policy "Students can create their own profile"
  on public.profiles for insert
  to authenticated
  with check (
    (select auth.uid()) = id
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );

create policy "Students can update their own profile"
  on public.profiles for update
  to authenticated
  using (
    (select auth.uid()) = id
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  )
  with check (
    (select auth.uid()) = id
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_profile_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "UCI students can view profile photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );

create policy "Students can upload their own profile photo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );

create policy "Students can update their own profile photo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  )
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );

create policy "Students can delete their own profile photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );
