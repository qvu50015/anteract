-- Apply after review. Existing events keep an empty tag list.
-- Tags describe interests only; they do not grant or restrict event access.
create function public.event_tags_are_valid(value text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value is not null
    and pg_catalog.cardinality(value) <= 5
    and (pg_catalog.cardinality(value) = 0 or pg_catalog.array_ndims(value) = 1)
    and pg_catalog.cardinality(value) = (select count(distinct tag) from pg_catalog.unnest(value) as tag)
    and not exists (
      select 1 from pg_catalog.unnest(value) as tag
      where tag is null or pg_catalog.char_length(tag) > 24
        or tag !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    );
$$;

alter table public.events
  add column tags text[] not null default '{}',
  add constraint events_tags_valid check (public.event_tags_are_valid(tags));
