import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

import { createClient } from '@supabase/supabase-js'
const [project, audioFile] = process.argv.slice(2)
assert.match(project ?? '', /^[a-z]{20}$/, 'Usage: node scripts/test-live-grading.mjs PROJECT_REF ARABIC_AUDIO.wav')
assert.ok(audioFile, 'An Arabic WAV fixture is required')
const recording = readFileSync(audioFile)
assert.equal(recording.toString('ascii', 0, 4), 'RIFF', 'Expected a PCM WAV fixture')
assert.equal(recording.toString('ascii', 8, 12), 'WAVE', 'Expected a WAV fixture')
let hasAudio = false
for (let offset = 12; offset + 8 <= recording.length;) {
  const size = recording.readUInt32LE(offset + 4)
  if (recording.toString('ascii', offset, offset + 4) === 'data') hasAudio = size > 0 && offset + 8 + size <= recording.length
  offset += 8 + size + (size % 2)
}
assert.ok(hasAudio, 'The WAV fixture has no audio samples')
const url = `https://${project}.supabase.co`
const keys = JSON.parse(execFileSync('supabase', ['projects', 'api-keys', '--project-ref', project, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
const serviceKey = keys.find(key => key.name === 'service_role')?.api_key
const anonKey = keys.find(key => key.name === 'anon')?.api_key
assert.ok(serviceKey && anonKey, 'Project API credentials unavailable')
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const participant = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const ids = Object.fromEntries(['package', 'version', 'writing', 'speaking', 'attempt', 'active', 'other'].map(name => [name, randomUUID()]))
const audioPath = `speaking/${ids.attempt}/${ids.speaking}.wav`
let userId
let createdPackage = false
let uploadedAudio = false
const checked = async promise => { const result = await promise; if (result.error) throw new Error(result.error.message); return result.data }
const report = []
async function invoke(name, token, body) {
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(180_000),
  })
  return { status: response.status, body: await response.json() }
}
try {
  const email = `grading-qa-${randomUUID()}@example.invalid`
  const password = `${randomUUID()}Aa1!`
  const created = await checked(admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Grading integration QA' } }))
  userId = created.user.id
  const session = await checked(participant.auth.signInWithPassword({ email, password }))
  const token = session.session.access_token
  await checked(admin.from('exam_packages').insert({ id: ids.package, slug: `grading-qa-${ids.package}`, title: 'Grading integration QA', subtitle: 'Temporary unpublished fixture', is_public: false }))
  createdPackage = true
  await checked(admin.from('exam_versions').insert({ id: ids.version, package_id: ids.package, version_number: 1, duration_minutes: 5, status: 'draft' }))
  const prompt = 'عرف بنفسك وتحدث عن دراستك وتعلم اللغة العربية.'
  await checked(admin.from('exam_questions').insert([
    { id: ids.writing, exam_version_id: ids.version, position: 1, section: 'writing', answer_type: 'writing', question: prompt },
    { id: ids.speaking, exam_version_id: ids.version, position: 2, section: 'speaking', answer_type: 'speaking', question: prompt },
  ]))
  await checked(admin.from('attempts').insert([
    { id: ids.attempt, user_id: userId, exam_version_id: ids.version, state: 'submitted', ends_at: new Date().toISOString(), completed_at: new Date().toISOString(), finish_reason: 'manual' },
    { id: ids.active, user_id: userId, exam_version_id: ids.version, state: 'active', ends_at: new Date(Date.now() + 300000).toISOString() },
    { id: ids.other, user_id: `qa-other-${randomUUID()}`, exam_version_id: ids.version, state: 'submitted', ends_at: new Date().toISOString(), completed_at: new Date().toISOString(), finish_reason: 'manual' },
  ]))
  await checked(admin.storage.from('exam-audio').upload(audioPath, recording, { contentType: 'audio/wav' }))
  uploadedAudio = true
  await checked(admin.from('attempt_answers').insert([
    { attempt_id: ids.attempt, question_id: ids.writing, answer_text: 'أنا طالب أدرس اللغة العربية كل يوم. أحب القراءة والكتابة وأريد أن أتكلم العربية بطلاقة. أذهب إلى الجامعة في الصباح وأراجع دروسي في المساء.' },
    { attempt_id: ids.attempt, question_id: ids.speaking, audio_storage_path: audioPath },
  ]))
  for (const name of ['evaluate-writing', 'evaluate-speaking']) {
    for (const [label, auth, body, expected] of [
      ['unauthenticated', null, { attempt_id: ids.attempt }, 401],
      ['direct payload', token, { answers: [] }, 403],
      ['active attempt', token, { attempt_id: ids.active }, 403],
      ['other owner', token, { attempt_id: ids.other }, 403],
    ]) {
      const result = await invoke(name, auth, body)
      assert.equal(result.status, expected, `${name} ${label}: ${JSON.stringify(result.body)}`)
      report.push({ test: `${name}: ${label}`, status: result.status, passed: true })
    }
    const result = await invoke(name, token, { attempt_id: ids.attempt })
    report.push({ test: `${name}: live provider`, status: result.status, success: result.body.success ?? false })
    if (result.status !== 200) throw new Error(`${name} returned ${result.status}: ${JSON.stringify(result.body)}; report=${JSON.stringify(report)}`)
    assert.equal(result.body.success, true)
    assert.equal(result.body.data.length, 1)
    const grade = result.body.data[0]
    assert.ok(Number.isInteger(grade.score) && grade.score >= 0 && grade.score <= 100)
    assert.equal(grade.feedback.grading_model, 'gpt-6-luna')
    if (name === 'evaluate-speaking') {
      assert.equal(grade.feedback.transcription_model, 'gpt-transcribe')
      assert.match(grade.feedback.transcript, /[\u0600-\u06ff]/)
      assert.equal(grade.feedback.pronunciation_score, null)
      assert.equal(grade.feedback.fluency_score, null)
      report.push({ test: 'Arabic synthetic recording', transcript: grade.feedback.transcript, score: grade.score })
    } else report.push({ test: 'Arabic synthetic writing', score: grade.score })
  }
  const saved = await checked(admin.from('attempt_answers').select('writing_score,speaking_score').eq('attempt_id', ids.attempt))
  assert.ok(saved.some(row => Number.isInteger(row.writing_score)) && saved.some(row => Number.isInteger(row.speaking_score)))
  const attempt = await checked(admin.from('attempts').select('score,section_scores').eq('id', ids.attempt).single())
  assert.equal(attempt.score, Math.round(saved.reduce((sum, row) => sum + (row.writing_score ?? row.speaking_score ?? 0), 0) / 2))
  report.push({ test: 'database persistence and aggregate', passed: true, score: attempt.score })
  console.log(JSON.stringify({ success: true, report }, null, 2))
} finally {
  const failures = []
  const clean = async (label, promise) => { try { await checked(promise) } catch { failures.push(label) } }
  if (uploadedAudio) await clean('audio', admin.storage.from('exam-audio').remove([audioPath]))
  if (createdPackage) {
    await clean('answers', admin.from('attempt_answers').delete().in('attempt_id', [ids.attempt, ids.active, ids.other]))
    await clean('attempts', admin.from('attempts').delete().in('id', [ids.attempt, ids.active, ids.other]))
    await clean('questions', admin.from('exam_questions').delete().eq('exam_version_id', ids.version))
    await clean('version', admin.from('exam_versions').delete().eq('id', ids.version))
    await clean('package', admin.from('exam_packages').delete().eq('id', ids.package))
  }
  if (userId) {
    await clean('signout', participant.auth.signOut())
    await clean('profile', admin.from('profiles').delete().eq('id', userId))
    await clean('auth-user', admin.auth.admin.deleteUser(userId))
  }
  console.log(JSON.stringify({ cleanup: failures.length ? 'incomplete' : 'complete', failures, ...(failures.length ? { fixtureIds: ids, userId } : {}) }))
}
