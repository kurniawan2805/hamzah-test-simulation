// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

const db = new PGlite()
const attempt = '11111111-1111-4111-8111-111111111111'
const version = '22222222-2222-4222-8222-222222222222'
const question = '33333333-3333-4333-8333-333333333333'
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role', true) $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('sub', nullif(current_setting('test.subject', true), '')) $$;
    CREATE TABLE public.attempts (id uuid PRIMARY KEY, user_id text, exam_version_id uuid, state text, score integer, correct_count integer, total_questions integer, cefr text, section_scores jsonb, completed_at timestamptz, finish_reason text, updated_at timestamptz);
    CREATE TABLE public.exam_questions (id uuid PRIMARY KEY, exam_version_id uuid, section text, answer_type text);
    CREATE TABLE private.exam_answer_keys (question_id uuid, correct_index smallint);
    CREATE TABLE public.attempt_answers (attempt_id uuid, question_id uuid, selected_index smallint, writing_score integer, speaking_score integer);
  `)
  const migration = await readFile(new URL('../../supabase/migrations/20261014113000_fix_fractional_exam_scores.sql', import.meta.url), 'utf8')
  await db.exec(migration)
}, 30_000)
afterAll(async () => { await db.close() })
async function seed(type = 'writing', score: number | null = 65) {
  await db.exec(`TRUNCATE public.attempts, public.exam_questions, private.exam_answer_keys, public.attempt_answers;
    SELECT set_config('test.role', 'authenticated', false), set_config('test.subject', 'owner', false);`)
  await db.query("INSERT INTO public.attempts(id,user_id,exam_version_id,state) VALUES ($1,'owner',$2,'submitted')", [attempt, version])
  await db.query('INSERT INTO public.exam_questions VALUES ($1,$2,$3,$3)', [question, version, type])
  await db.query('INSERT INTO public.attempt_answers VALUES ($1,$2,NULL,$3,$3)', [attempt, question, score])
}
const recalculate = () => db.query<{ score: number; correct_count: number; section_scores: Record<string, number> }>('SELECT * FROM public.update_attempt_scores($1)', [attempt])
describe('PostgreSQL fractional score migration', () => {
  it.each(['writing', 'speaking'])('retains partial credit for a single %s answer', async type => {
    await seed(type)
    const result = (await recalculate()).rows[0]
    expect(result.score).toBe(65)
    expect(result.correct_count).toBe(0)
    expect(result.section_scores[type]).toBe(65)
  })
  it('rounds only the final percentage for mixed question types', async () => {
    await seed()
    const mc = '44444444-4444-4444-8444-444444444444'
    await db.query("INSERT INTO public.exam_questions VALUES ($1,$2,'reading','multiple_choice')", [mc, version])
    await db.query('INSERT INTO private.exam_answer_keys VALUES ($1,1)', [mc])
    await db.query('INSERT INTO public.attempt_answers VALUES ($1,$2,1,NULL,NULL)', [attempt, mc])
    const result = (await recalculate()).rows[0]
    expect(result.score).toBe(83)
    expect(result.correct_count).toBe(1)
    expect(result.section_scores).toEqual({ writing: 65, reading: 100 })
  })
  it('rejects another participant and a missing subject', async () => {
    await seed()
    await db.exec("SELECT set_config('test.subject', 'other', false)")
    await expect(recalculate()).rejects.toThrow('Access denied')
    await db.exec("SELECT set_config('test.subject', '', false)")
    await expect(recalculate()).rejects.toThrow('Access denied')
  })
  it('allows service recalculation without a participant subject', async () => {
    await seed()
    await db.exec("SELECT set_config('test.role', 'service_role', false), set_config('test.subject', '', false)")
    expect((await recalculate()).rows[0].score).toBe(65)
  })
  it('rejects active attempts', async () => {
    await seed()
    await db.query("UPDATE public.attempts SET state='active' WHERE id=$1", [attempt])
    await expect(recalculate()).rejects.toThrow('Attempt must be completed')
  })
  it('keeps execution unavailable to anonymous users', async () => {
    const result = await db.query<{ allowed: boolean }>("SELECT has_function_privilege('anon', 'public.update_attempt_scores(uuid)', 'EXECUTE') AS allowed")
    expect(result.rows[0].allowed).toBe(false)
  })
})
