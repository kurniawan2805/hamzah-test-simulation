-- Add user profiles table and automatic sync for user email & name from Clerk auth

-- 1. Create profiles table
create table if not exists public.profiles (
  id text primary key, -- Clerk user_id (e.g. user_2p...)
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (lower(email));

-- 2. Enable RLS & Policies
alter table public.profiles enable row level security;

create policy "Admin can read all profiles"
  on public.profiles for select to authenticated
  using (public.is_admin());

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (auth.jwt() ->> 'sub'));

create policy "Users can upsert their own profile"
  on public.profiles for insert to authenticated
  with check (id = (auth.jwt() ->> 'sub'));

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (auth.jwt() ->> 'sub'));

revoke all on table public.profiles from anon, public;
grant select, insert, update on public.profiles to authenticated;

-- 3. RPC to sync current user profile
create or replace function public.sync_user_profile(
  p_display_name text default null,
  p_email text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_email text;
  v_name text;
begin
  if v_user_id is null then
    return;
  end if;

  v_email := lower(trim(coalesce(
    p_email,
    auth.jwt() ->> 'email',
    auth.jwt() -> 'user_metadata' ->> 'email',
    ''
  )));

  v_name := trim(coalesce(
    p_display_name,
    auth.jwt() ->> 'name',
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    ''
  ));

  insert into public.profiles (id, email, display_name, updated_at)
  values (
    v_user_id,
    nullif(v_email, ''),
    nullif(v_name, ''),
    now()
  )
  on conflict (id) do update
  set email = coalesce(nullif(v_email, ''), public.profiles.email),
      display_name = coalesce(nullif(v_name, ''), public.profiles.display_name),
      updated_at = now();
end;
$$;

revoke all on function public.sync_user_profile(text, text) from public, anon;
grant execute on function public.sync_user_profile(text, text) to authenticated;

-- 4. Update get_admin_all_attempts to return user_email & user_name from profiles
drop function if exists public.get_admin_all_attempts();

create or replace function public.get_admin_all_attempts()
returns table (
  id uuid,
  user_id text,
  user_email text,
  user_name text,
  exam_version_id uuid,
  exam_title text,
  state text,
  started_at timestamptz,
  ends_at timestamptz,
  completed_at timestamptz,
  score integer,
  correct_count integer,
  total_questions integer,
  cefr text,
  section_scores jsonb,
  finish_reason text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Access denied: Admin role required';
  end if;

  return query
  select a.id,
         a.user_id,
         coalesce(pr.email, case when a.user_id like '%@%' then a.user_id else null end) as user_email,
         coalesce(pr.display_name, case when pr.email is not null then split_part(pr.email, '@', 1) else null end) as user_name,
         a.exam_version_id,
         coalesce(p.title, 'Simulasi Ujian') as exam_title,
         a.state,
         a.started_at,
         a.ends_at,
         a.completed_at,
         a.score,
         a.correct_count,
         a.total_questions,
         a.cefr,
         a.section_scores,
         a.finish_reason
  from public.attempts a
  join public.exam_versions v on v.id = a.exam_version_id
  join public.exam_packages p on p.id = v.package_id
  left join public.profiles pr on pr.id = a.user_id
  order by a.created_at desc;
end;
$$;

revoke all on function public.get_admin_all_attempts() from public, anon;
grant execute on function public.get_admin_all_attempts() to authenticated;
