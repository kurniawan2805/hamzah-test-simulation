#!/usr/bin/env node
/**
 * Seed exam data from a JSON file into Supabase.
 *
 * Usage:
 *   node scripts/seed-exam.mjs [path-to-json]
 *
 * Env vars (SUPABASE_URL falls back to VITE_SUPABASE_URL in .env.local):
 *   SUPABASE_URL              — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (required)
 *
 * Audio mapping: shared_asset_id → file name (see AUDIO_MAP below).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const AUDIO_MAP = {
  audio_perpustakaan_01: '1.mp3',
  audio_rutinitas_02: '2.mp3',
  audio_kesehatan_03: '3.mp3',
  audio_pameran_04: '4.mp3',
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const jsonPath = process.argv[2] || 'src/data/banksoal1.json'
const exam = JSON.parse(readFileSync(resolve(jsonPath), 'utf8'))

let supabaseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  try {
    const envLocal = readFileSync(resolve('.env.local'), 'utf8')
    const m = envLocal.match(/^VITE_SUPABASE_URL=(.+)$/m)
    if (m) supabaseUrl = m[1].trim()
  } catch { /* ignore */ }
}

if (!supabaseUrl || !serviceKey) {
  console.error('Missing env vars. Set SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).')
  console.error('  export SUPABASE_URL="https://xxx.supabase.co"')
  console.error('  export SUPABASE_SECRET_KEY="sb_secret_..."')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

// ---------------------------------------------------------------------------
// Execute raw SQL via Supabase Management API (service-role or personal access token)
// ---------------------------------------------------------------------------
async function execSQL(sql) {
  // Method 1: Try Management API (requires personal access token, unlikely with service key)
  const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '')
  let resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ query: sql }),
  })
  if (resp.ok) return

  // Method 2: Try direct PostgREST /pg endpoint
  resp = await fetch(`${supabaseUrl}/pg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ query: sql }),
  })
  if (resp.ok) return

  throw new Error(`Could not execute SQL. Run this manually in the SQL Editor:\n${sql}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function seed() {
  const slug = exam.id
  const versionNumber = 1

  console.log(`\n📦 Seeding: ${exam.title} (${slug})`)
  console.log(`   ${exam.questions.length} questions, ${exam.durationMinutes} min\n`)

  // 1. Upsert package
  const { data: pkg, error: e1 } = await supabase
    .from('exam_packages')
    .upsert({ slug, title: exam.title, subtitle: exam.subtitle }, { onConflict: 'slug' })
    .select('id').single()
  if (e1) { console.error('❌ exam_packages:', e1.message); process.exit(1) }
  console.log(`✅ package ${pkg.id}`)

  // 2. Upsert version
  const { data: ver, error: e2 } = await supabase
    .from('exam_versions')
    .upsert({
      package_id: pkg.id,
      version_number: versionNumber,
      duration_minutes: exam.durationMinutes,
      status: 'published',
      published_at: new Date().toISOString(),
    }, { onConflict: 'package_id,version_number' })
    .select('id').single()
  if (e2) { console.error('❌ exam_versions:', e2.message); process.exit(1) }
  console.log(`✅ version ${ver.id}`)

  // 3. Clear old questions
  const { error: e3 } = await supabase.from('exam_questions').delete().eq('exam_version_id', ver.id)
  if (e3) { console.error('❌ delete questions:', e3.message); process.exit(1) }
  console.log('🧹 Cleared old questions')

  // 4. Insert questions
  const rows = exam.questions.map((q, i) => {
    const isMcq = !q.answer_type || q.answer_type === 'multiple_choice'
    return {
      exam_version_id: ver.id,
      position: i + 1,
      section: q.section,
      question: q.question,
      options: isMcq ? q.options : null,
      passage: q.passage || null,
      audio_path: (q.shared_asset_id && AUDIO_MAP[q.shared_asset_id]) || q.audio_url || null,
      // The database contract keeps this column non-null; speaking items do
      // not use audio playback, but still receive the schema default value.
      max_audio_plays: 1,
      answer_type: q.answer_type || 'multiple_choice',
      prompt_hint: q.prompt_hint || null,
      minimum_words: q.minimum_words || null,
      max_recording_seconds: q.max_recording_seconds || null,
    }
  })

  const { data: inserted, error: e4 } = await supabase
    .from('exam_questions')
    .insert(rows)
    .select('id, position')
  if (e4) { console.error('❌ insert questions:', e4.message); process.exit(1) }
  console.log(`✅ ${inserted.length} questions inserted`)

  // 5. Insert answer keys (private schema — needs raw SQL)
  const keys = inserted.map((q, i) => ({
    question_id: q.id,
    correct_index: exam.questions[q.position - 1].correct_index,
    explanation: exam.questions[q.position - 1].explanation,
  }))

  // Build VALUES clause
  const values = keys.map(
    (k) => `('${k.question_id}', ${k.correct_index}, '${k.explanation.replace(/'/g, "''")}')`
  ).join(',\n  ')

  const seedFn = `
CREATE OR REPLACE FUNCTION public.seed_answer_keys(p_grades jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE v jsonb;
BEGIN
  FOR v IN SELECT * FROM jsonb_array_elements(p_grades)
  LOOP
    INSERT INTO private.exam_answer_keys (question_id, correct_index, explanation)
    VALUES ((v->>'question_id')::uuid, (v->>'correct_index')::smallint, v->>'explanation');
  END LOOP;
END; $$;`

  const dropFn = `DROP FUNCTION IF EXISTS public.seed_answer_keys(jsonb);`

  try {
    const { error: rpcErr } = await supabase.rpc('seed_answer_keys', { p_grades: keys })
    if (rpcErr) throw rpcErr
    console.log(`✅ ${keys.length} answer keys inserted`)
  } catch (err) {
    console.error(`\n⚠️  RPC failed: ${err.message}`)
    console.log('\n📋 Run this SQL in the Supabase SQL Editor:\n')
    console.log(seedFn)
    console.log(`\nINSERT INTO private.exam_answer_keys (question_id, correct_index, explanation) VALUES\n  ${values};`)
    console.log(`\n${dropFn}\n`)
    process.exit(1)
  }

  // Summary
  const sections = {}
  for (const q of exam.questions) sections[q.section] = (sections[q.section] || 0) + 1

  console.log('\n✨ Done!')
  console.log(`   slug: ${slug}`)
  console.log(`   version: ${versionNumber} (published)`)
  for (const [s, c] of Object.entries(sections)) console.log(`   ${s}: ${c}`)
  console.log(`\n   version_id: ${ver.id}`)
  console.log('   Use getPublishedExams() to discover dynamically.\n')
}

seed().catch((err) => { console.error('💥', err); process.exit(1) })
