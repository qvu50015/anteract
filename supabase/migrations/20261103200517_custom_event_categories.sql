-- Allow user-defined categories while preserving event data and all existing RLS.
begin;
set local lock_timeout = '5s';
alter table public.events drop constraint events_category_check;
alter table public.events add constraint events_category_check check (
  char_length(category) between 2 and 40
  and category = btrim(category)
  and category !~ '[[:cntrl:]]'
  and lower(category) <> 'all'
);
notify pgrst, 'reload schema';
commit;
