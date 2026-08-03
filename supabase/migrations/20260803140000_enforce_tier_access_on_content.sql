drop policy if exists "Participants can read accessible exam versions" on public.exam_versions;
drop policy if exists "Participants can read published exam versions" on public.exam_versions;
drop policy if exists "Participants can read questions for accessible packages or owned attempts" on public.exam_questions;
drop policy if exists "Participants can read published questions" on public.exam_questions;

create or replace function public.can_access_exam_version(p_exam_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.exam_versions ev
    join public.exam_packages p on p.id = ev.package_id
    where ev.id = p_exam_version_id
      and ev.status = 'published'
      and (
        public.user_tier_rank() >= public.package_tier_rank(p.min_tier) or
        exists (
          select 1 from public.package_assignments pa
          where pa.package_id = p.id
            and (
              pa.user_id = (auth.jwt() ->> 'sub') or
              pa.user_id = lower(coalesce(auth.jwt() ->> 'email', auth.jwt() -> 'user_metadata' ->> 'email', ''))
            )
        )
      )
  );
$$;

revoke all on function public.can_access_exam_version(uuid) from public, anon;
grant execute on function public.can_access_exam_version(uuid) to authenticated;

create policy "Participants can read accessible exam versions"
  on public.exam_versions for select to authenticated
  using (public.can_access_exam_version(exam_versions.id));

create policy "Participants can read questions for accessible packages or owned attempts"
  on public.exam_questions for select to authenticated
  using (
    public.can_access_exam_version(exam_questions.exam_version_id) or
    exists (
      select 1 from public.attempts a
      where a.exam_version_id = exam_questions.exam_version_id
        and a.user_id = (auth.jwt() ->> 'sub')
    )
  );

update public.exam_packages
set min_tier = 'free',
    is_public = true
where slug = 'hamza-test-full-1'
  and (min_tier is distinct from 'free' or is_public is distinct from true);
