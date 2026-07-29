create or replace function public.admin_seed_default_exam()
returns table (
  package_id uuid,
  exam_version_id uuid,
  message text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_pkg_id uuid;
  v_ver_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Access denied: Admin role required';
  end if;

  select id into v_pkg_id
  from public.exam_packages
  where slug = 'hamza-test-full-1';

  if v_pkg_id is null then
    insert into public.exam_packages (slug, title, subtitle, description)
    values (
      'hamza-test-full-1',
      'Hamza Test · Simulation (Full Test)',
      'Simulasi ujian bahasa Arab 6 seksi · 75 nomor',
      'Paket latihan standar Hamza Test dengan timer 60 menit dan analisis 6 seksi.'
    )
    returning id into v_pkg_id;
  end if;

  select id into v_ver_id
  from public.exam_versions
  where package_id = v_pkg_id and version_number = 1;

  if v_ver_id is null then
    insert into public.exam_versions (package_id, version_number, duration_minutes, status, published_at)
    values (v_pkg_id, 1, 60, 'published', now())
    returning id into v_ver_id;
  end if;

  return query select v_pkg_id, v_ver_id, 'Paket ujian default berhasil dibuat'::text;
end;
$$;

revoke all on function public.admin_seed_default_exam() from public, anon;
grant execute on function public.admin_seed_default_exam() to authenticated;
