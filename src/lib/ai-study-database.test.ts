// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

const db = new PGlite()
let sessionId: string
let quizId: string
const rpc = async <T>(name: string, args = '') => (await db.query<T>(`select * from public.${name}(${args})`)).rows
const asService = () => db.exec("select set_config('qa.role','service_role',false)")
const asParticipant = () => db.exec("select set_config('qa.role','authenticated',false)")
const questions = Array.from({ length: 5 }, () => ({ question: 'سؤال', options: ['أ', 'ب', 'ج', 'د'], passage: null }))
const keys = Array.from({ length: 5 }, () => ({ correct_index: 1, explanation: 'شرح' }))
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('sub',current_setting('qa.user',true))$$;
    create function auth.role() returns text language sql as $$select current_setting('qa.role',true)$$;
    create function public.is_admin() returns boolean language sql as $$select false$$;
    create function public.user_tier() returns text language sql as $$select current_setting('qa.tier',true)$$;
    create table public.exam_questions(id uuid primary key,topic text,answer_type text);
    create table private.exam_answer_keys(question_id uuid primary key,correct_index smallint,explanation text);
  `)
  await db.exec(await readFile(new URL('../../supabase/migrations/20260803170000_add_ai_study.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261014123000_fix_ai_study_cloud_integrity.sql', import.meta.url), 'utf8'))
}, 30000)
beforeEach(async () => {
  await db.exec("truncate public.ai_study_sessions,public.ai_study_usage cascade; select set_config('qa.user','qa-owner',false),set_config('qa.tier','vip_plus',false),set_config('qa.role','authenticated',false)")
  sessionId = (await rpc<{ session_id: string }>('ai_study_open_session', "'grammar_huruf_jar','grammar'"))[0].session_id
  quizId = (await rpc<{ ai_study_begin_quiz: string }>('ai_study_begin_quiz', `'${sessionId}'`))[0].ai_study_begin_quiz
})
afterAll(async () => { await db.close() })
async function publish(q: unknown = questions, k: unknown = keys) {
  await asService()
  return db.query('select public.ai_study_publish_quiz($1,$2::jsonb,$3::jsonb)', [quizId, JSON.stringify(q), JSON.stringify(k)])
}
describe('AI study cloud integrity migration', () => {
  it('resumes the same canonical session without ambiguous SQL columns', async () => {
    expect((await rpc<{ session_id: string }>('ai_study_open_session', "'grammar_huruf_jar','grammar'"))[0].session_id).toBe(sessionId)
    await expect(rpc('ai_study_open_session', "'invented','grammar'")).rejects.toThrow('Topik tidak valid')
  })
  it('enforces the 30-call quota before provider work and rolls back a rejected reservation', async () => {
    for (let i=0;i<30;i++) await rpc('ai_study_reserve_message', `'${sessionId}'`)
    await expect(rpc('ai_study_reserve_message', `'${sessionId}'`)).rejects.toThrow('Kuota pesan')
    expect((await db.query<{ messages_used: number }>('select messages_used from public.ai_study_usage')).rows[0].messages_used).toBe(30)
    expect((await db.query<{ count: number }>('select count(*)::integer as count from private.ai_study_message_requests')).rows[0].count).toBe(30)
  })
  it('rejects non-VIP and foreign sessions without spending quota', async () => {
    await db.exec("select set_config('qa.tier','free',false)")
    await expect(rpc('ai_study_reserve_message', `'${sessionId}'`)).rejects.toThrow('Akses ditolak')
    await db.exec("select set_config('qa.tier','vip_plus',false),set_config('qa.user','other',false)")
    await expect(rpc('ai_study_reserve_message', `'${sessionId}'`)).rejects.toThrow('Sesi belajar tidak ditemukan')
    expect((await db.query('select * from private.ai_study_message_requests')).rows).toHaveLength(0)
  })
  it('allows only the service role to complete a reserved message, exactly once', async () => {
    const receipt = (await rpc<{ ai_study_reserve_message: { request_id: string } }>('ai_study_reserve_message', `'${sessionId}'`))[0].ai_study_reserve_message
    await expect(rpc('ai_study_complete_message', `'${receipt.request_id}','materi',null`)).rejects.toThrow('Access denied')
    await asService()
    await rpc('ai_study_complete_message', `'${receipt.request_id}','materi','pertanyaan'`)
    await expect(rpc('ai_study_complete_message', `'${receipt.request_id}','duplikat',null`)).rejects.toThrow('Request sudah selesai')
    expect((await db.query('select * from public.ai_study_messages')).rows).toHaveLength(2)
  })
  it('stores all five public questions and private keys atomically', async () => {
    await publish()
    expect((await db.query<{ questions: unknown[] }>('select questions from public.ai_study_quizzes')).rows[0].questions).toHaveLength(5)
    expect((await db.query('select * from private.ai_study_quiz_keys')).rows).toHaveLength(1)
    await expect(publish()).rejects.toThrow('Kuis tidak dapat diterbitkan')
  })
  it('rejects incomplete or key-leaking publications without partial writes', async () => {
    await expect(publish(questions.slice(0,4))).rejects.toThrow('5 soal')
    await expect(publish([{ ...questions[0], correct_index: 1 }, ...questions.slice(1)])).rejects.toThrow('Soal tidak valid')
    expect((await db.query<{ questions: unknown[] }>('select questions from public.ai_study_quizzes')).rows[0].questions).toEqual([])
    expect((await db.query('select * from private.ai_study_quiz_keys')).rows).toHaveLength(0)
  })
  it('does not reveal results before submission and keeps completed grades immutable', async () => {
    await publish()
    await asParticipant()
    await expect(rpc('ai_study_get_quiz_result', `'${quizId}'`)).rejects.toThrow('Hasil kuis tidak ditemukan')
    const first = await rpc<{ score: number; questions: unknown[] }>('ai_study_submit_quiz', `'${quizId}',array[0,0,0,0,0]`)
    const repeated = await rpc('ai_study_submit_quiz', `'${quizId}',array[1,1,1,1,1]`)
    expect(first[0].score).toBe(0)
    expect(repeated).toEqual(first)
    expect(await rpc('ai_study_get_quiz_result', `'${quizId}'`)).toEqual(first)
  })
  it('rejects grading a pending quiz and another participant quiz', async () => {
    await expect(rpc('ai_study_submit_quiz', `'${quizId}',array[1,1,1,1,1]`)).rejects.toThrow('Kuis belum siap')
    await publish()
    await asParticipant()
    await db.exec("select set_config('qa.user','other',false)")
    await expect(rpc('ai_study_submit_quiz', `'${quizId}',array[1,1,1,1,1]`)).rejects.toThrow('Kuis tidak ditemukan')
  })
  it('keeps private writes and legacy mutation RPCs unavailable to participants', async () => {
    const result = await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','public.ai_study_publish_quiz(uuid,jsonb,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.ai_study_append_message(uuid,text,text)','EXECUTE') or has_function_privilege('authenticated','public.ai_study_grade_quiz(uuid,integer[])','EXECUTE') or has_table_privilege('authenticated','private.ai_study_quiz_keys','SELECT') as allowed")
    expect(result.rows[0].allowed).toBe(false)
  })
})
