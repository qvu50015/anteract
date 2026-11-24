-- Enable this function as the Before User Created hook in Authentication > Hooks.
-- SECURITY INVOKER: no elevated database privileges are needed.
create or replace function public.restrict_uci_signup(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(event->'user'->>'email', '') !~* '^[^[:space:]@]+@uci[.]edu$' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Please sign up with your @uci.edu email address.'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;
revoke execute on function public.restrict_uci_signup(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.restrict_uci_signup(jsonb) to supabase_auth_admin;
