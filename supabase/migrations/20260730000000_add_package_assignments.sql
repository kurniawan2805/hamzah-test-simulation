-- Add package assignment support and public/private package visibility flag

-- 1. Add is_public flag to exam_packages
alter table public.exam_packages add column if not exists is_public boolean not null default true;

-- 2. Create package_assignments table
create table if not exists public.package_assignments (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.exam_packages(id) on delete cascade,
  user_id text not null, -- Clerk user_id or email address (lowercase)
  assigned_by text default (auth.jwt() ->> 'sub'),
  assigned_at timestamptz not null default now(),
  unique (package_id, user_id)
);

create index if not exists package_assignments_user_idx on public.package_assignments (user_id);

-- 3. Enable RLS and Policies for package_assignments
alter table public.package_assignments enable row level security;

create policy "Admin can manage package assignments"
  on public.package_assignments for all to authenticated
  using (public.is_admin());

create policy "Participants can read their package assignments"
  on public.package_assignments for select to authenticated
  using (
    user_id = (auth.jwt() ->> 'sub') or
    user_id = lower(coalesce(auth.jwt() ->> 'email', auth.jwt() -> 'user_metadata' ->> 'email', ''))
  );

revoke all on table public.package_assignments from anon, public;
grant select, insert, update, delete on public.package_assignments to authenticated;

-- 4. Update RLS Policy on exam_packages
drop policy if exists "Participants can read packages with a published version" on public.exam_packages;

create policy "Participants can read accessible packages"
  on public.exam_packages for select to authenticated
  using (
    public.is_admin() or (
      exists (
        select 1 from public.exam_versions ev
        where ev.package_id = exam_packages.id and ev.status = 'published'
      ) and (
        is_public = true or exists (
          select 1 from public.package_assignments pa
          where pa.package_id = exam_packages.id
            and (
              pa.user_id = (auth.jwt() ->> 'sub') or
              pa.user_id = lower(coalesce(auth.jwt() ->> 'email', auth.jwt() -> 'user_metadata' ->> 'email', ''))
            )
        )
      )
    )
  );

-- 5. Update start_attempt RPC to check assignment for non-public packages
create or replace function public.start_attempt(p_exam_version_id uuid)
returns table (
  attempt_id uuid,
  exam_version_id uuid,
  started_at timestamptz,
  ends_at timestamptz,
  state text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_user_email text := lower(coalesce(auth.jwt() ->> 'email', auth.jwt() -> 'user_metadata' ->> 'email', ''));
  v_duration_minutes integer;
  v_attempt public.attempts;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  -- Check published version and package accessibility
  select ev.duration_minutes into v_duration_minutes
  from public.exam_versions as ev
  join public.exam_packages as p on p.id = ev.package_id
  where ev.id = p_exam_version_id
    and ev.status = 'published'
    and (
      p.is_public = true or
      public.is_admin() or
      exists (
        select 1 from public.package_assignments pa
        where pa.package_id = p.id
          and (pa.user_id = v_user_id or (v_user_email <> '' and pa.user_id = v_user_email))
      )
    );

  if v_duration_minutes is null then
    raise exception 'Published exam version not found or package access denied';
  end if;

  select a.* into v_attempt
  from public.attempts as a
  where a.user_id = v_user_id
    and a.exam_version_id = p_exam_version_id
    and a.state = 'active'
  for update;

  if found and v_attempt.ends_at > now() then
    return query select v_attempt.id, v_attempt.exam_version_id,
      v_attempt.started_at, v_attempt.ends_at, v_attempt.state;
    return;
  end if;

  if found then
    perform public.finish_attempt(v_attempt.id);
  end if;

  insert into public.attempts (user_id, exam_version_id, ends_at)
  values (v_user_id, p_exam_version_id,
    now() + make_interval(mins => v_duration_minutes))
  returning * into v_attempt;

  insert into public.attempt_answers (attempt_id, question_id)
  select v_attempt.id, q.id
  from public.exam_questions as q
  where q.exam_version_id = p_exam_version_id;

  return query select v_attempt.id, v_attempt.exam_version_id,
    v_attempt.started_at, v_attempt.ends_at, v_attempt.state;
end;
$$;

-- 6. RPC functions for Admin package assignments
create or replace function public.get_admin_package_assignments()
returns table (
  id uuid,
  package_id uuid,
  package_title text,
  user_id text,
  assigned_at timestamptz
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
  select pa.id, pa.package_id, p.title as package_title, pa.user_id, pa.assigned_at
  from public.package_assignments pa
  join public.exam_packages p on p.id = pa.package_id
  order by pa.assigned_at desc;
end;
$$;

create or replace function public.admin_assign_packages(
  p_user_id text,
  p_package_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target text := lower(trim(p_user_id));
  v_pid uuid;
begin
  if not public.is_admin() then
    raise exception 'Access denied: Admin role required';
  end if;

  if v_target = '' then
    raise exception 'Target user_id or email cannot be empty';
  end if;

  -- Remove existing assignments for this user
  delete from public.package_assignments where lower(user_id) = v_target;

  -- Insert new assignments
  if p_package_ids is not null then
    foreach v_pid in array p_package_ids loop
      insert into public.package_assignments (package_id, user_id, assigned_by)
      values (v_pid, v_target, auth.jwt() ->> 'sub')
      on conflict (package_id, user_id) do nothing;
    end loop;
  end if;
end;
$$;

create or replace function public.admin_toggle_package_public(
  p_package_id uuid,
  p_is_public boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Access denied: Admin role required';
  end if;

  update public.exam_packages
  set is_public = p_is_public,
      updated_at = now()
  where id = p_package_id;
end;
$$;

revoke all on function public.get_admin_package_assignments() from public, anon;
revoke all on function public.admin_assign_packages(text, uuid[]) from public, anon;
revoke all on function public.admin_toggle_package_public(uuid, boolean) from public, anon;

grant execute on function public.get_admin_package_assignments() to authenticated;
grant execute on function public.admin_assign_packages(text, uuid[]) to authenticated;
grant execute on function public.admin_toggle_package_public(uuid, boolean) to authenticated;
