# PostHog Data Warehouse Setup Report

## Summary

Two data warehouse sources were detected in this project — **Supabase** and **Clerk**. Credential collection was cancelled during the wizard run, so both sources need to be connected manually via the PostHog app.

## Sources

### Supabase (Postgres)

**Status:** Needs browser setup — credentials not provided.

**Important setup notes:**
- Supabase must be connected as a **Postgres** source using the **Session pooler** (not the direct host).
- Pooler host format: `aws-0-<region>.pooler.supabase.com`
- Username format: `postgres.<project-ref>`
- Port: **6543** (not 5432)
- Password: your **database password** (Supabase → Project Settings → Database → Database password) — not your JWT/anon/service-role key.
- PostHog must be able to reach the host publicly. Add PostHog's egress IPs to your Supabase firewall allowlist if needed.

**Setup URL:**
[Connect Supabase in PostHog](https://us.posthog.com/project/525108/data-warehouse/new-source?kind=Postgres&utm_source=wizard&utm_campaign=warehouse-source)

---

### Clerk

**Status:** Needs browser setup — credentials not provided.

**Important setup notes:**
- You'll need your Clerk **Secret Key** (starts with `sk_live_...`), found in Clerk Dashboard → API Keys.
- Your `.env.local` already has `CLERK_SECRET_KEY` set — use that same value.

**Setup URL:**
[Connect Clerk in PostHog](https://us.posthog.com/project/525108/data-warehouse/new-source?kind=Clerk&utm_source=wizard&utm_campaign=warehouse-source)

---

## Changes Made

No source code files were modified. This skill only configures external data connections — it does not edit application code.

**Files created:**
- `posthog-warehouse-report.md` — this report

## Manual Steps Required

1. Open the **Supabase setup URL** above and enter your Supabase Session pooler credentials (host, port 6543, user as `postgres.<ref>`, database password).
2. Open the **Clerk setup URL** above and enter your Clerk secret key (`sk_live_...`).
3. After each source is created, configure which tables to sync in PostHog → Data Warehouse → your source → Schema.
4. Optionally set up a sync schedule (PostHog defaults to daily full refresh for most sources).
