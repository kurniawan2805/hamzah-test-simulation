-- Cloud admin access must be granted only through Clerk public metadata.
-- Do not trust generic role or user_metadata claims, which may be user-controlled
-- depending on the JWT template and Clerk configuration.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin', false);
$$;
