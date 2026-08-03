revoke insert, update on public.profiles from anon, authenticated;

drop policy if exists "Users can upsert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
