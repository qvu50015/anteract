-- Optional profile introduction. Existing rows receive an empty bio.
-- The existing ownership/UCI RLS policies and grants continue to apply.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table public.profiles
  add column bio text not null default ''
  constraint profiles_bio_length check (char_length(bio) <= 500);
commit;
