-- Review and apply before deploying social-link writes to a real Supabase project.
create function public.profile_social_links_are_valid(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when pg_catalog.jsonb_typeof(value) = 'array' then
    pg_catalog.jsonb_array_length(value) <= 5
    and pg_catalog.jsonb_array_length(value) = (
      select count(distinct item ->> 'url') from pg_catalog.jsonb_array_elements(value) as item
    )
    and not exists (
      select 1 from pg_catalog.jsonb_array_elements(value) as item
      where not coalesce(
        pg_catalog.jsonb_typeof(item) = 'object'
        and pg_catalog.jsonb_typeof(item -> 'platform') = 'string'
        and item ->> 'platform' in ('Instagram', 'LinkedIn', 'Discord', 'X', 'TikTok', 'GitHub', 'Website')
        and pg_catalog.jsonb_typeof(item -> 'url') = 'string'
        and pg_catalog.char_length(item ->> 'url') <= 500
        and item ->> 'url' ~ '^https://[^[:space:]/?#@]+[.][^[:space:]/?#@]+([/?#][^[:space:]]*)?$',
        false
      )
    )
  else false end;
$$;

alter table public.profiles
  add column social_links jsonb not null default '[]'::jsonb,
  add constraint profiles_social_links_valid check (public.profile_social_links_are_valid(social_links));
