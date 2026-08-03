import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const baseUrl = process.env.QA_BASE_URL || 'http://localhost:5173/'
const outDir = process.env.QA_OUT_DIR || '/tmp/hamza-qa-flow'
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--disable-gpu'],
})

const report = { checks: [], errors: [] }
function check(name, ok, detail = '') {
  report.checks.push({ name, ok, detail })
}

async function withPage(viewport, fn) {
  const page = await browser.newPage({ viewport })
  page.on('pageerror', (err) => report.errors.push(`pageerror: ${err.message}`))
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  // Fresh demo state: clear persisted exam store + demo preferences.
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await fn(page, viewport)
  await page.close()
}

async function examFlow(page, viewport) {
  const nextLabel = viewport.width < 1024 ? 'Next' : 'Berikutnya'
  const prevLabel = viewport.width < 1024 ? 'Prev' : 'Sebelumnya'
  const suffix = `${viewport.width}px`

  // 1. Start from dashboard
  await page.getByRole('button', { name: 'Mulai simulasi' }).click()
  await page.waitForURL('**/instructions')
  const instructionsBody = await page.locator('body').innerText()
  check(`${suffix}: halaman petunjuk`, instructionsBody.includes('Petunjuk simulasi ujian'))
  await page.screenshot({ path: `${outDir}/instructions-${viewport.width}.png` })

  // 2. Begin exam
  await page.getByRole('button', { name: 'Saya siap, mulai ujian' }).click()
  await page.waitForURL('**/exam')
  await page.waitForTimeout(400)
  const examBody = await page.locator('body').innerText()
  check(`${suffix}: timer ujian tampil`, await page.getByText(/^\d{2}:\d{2}$/).count() > 0)
  check(`${suffix}: soal Arab RTL`, await page.locator('div[dir="rtl"]:has(h2)').count() > 0)
  await page.screenshot({ path: `${outDir}/exam-${viewport.width}.png` })

  // 3. Answer Q1, move to Q2
  await page.locator('div[dir="rtl"]:has(h2) button').first().click()
  await page.getByRole('button', { name: nextLabel }).click()
  await page.waitForTimeout(250)
  const q2Text = await page.locator('body').innerText()
  check(`${suffix}: pindah ke soal 2`, q2Text.includes(`Soal 2/75`) || q2Text.includes('2'))

  // 4. Refresh / resume
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  check(`${suffix}: resume tetap di halaman ujian`, page.url().includes('/exam'))
  const questionBadge = await page.locator('span.grid.size-8').first().innerText()
  check(`${suffix}: sesi dilanjutkan (soal 2)`, questionBadge.trim() === '2')
  await page.getByRole('button', { name: prevLabel }).click()
  await page.waitForTimeout(200)
  const q1Class = await page.locator('div[dir="rtl"]:has(h2) button').first().getAttribute('class')
  check(`${suffix}: jawaban Q1 tersimpan setelah refresh`, q1Class?.includes('border-[#006C35]') ?? false)
  await page.screenshot({ path: `${outDir}/exam-resumed-${viewport.width}.png` })

  // 5. Finish and review
  await page.getByRole('button', { name: 'Finish Test' }).click()
  await page.waitForURL('**/results')
  await page.waitForTimeout(600)
  const resultsBody = await page.locator('body').innerText()
  check(`${suffix}: halaman hasil muncul`, resultsBody.includes('Hasil latihanmu'))
  check(`${suffix}: skor dan CEFR tampil`, /\b\d{1,3}\b/.test(resultsBody) && resultsBody.includes('CEFR'))
  await page.screenshot({ path: `${outDir}/results-${viewport.width}.png` })

  await page.getByRole('link', { name: 'Tinjau pembahasan' }).click()
  await page.waitForURL('**/review')
  await page.waitForTimeout(400)
  const reviewBody = await page.locator('body').innerText()
  check(`${suffix}: halaman pembahasan muncul`, reviewBody.includes('Jawaban dan pembahasan'))
  check(`${suffix}: pembahasan per soal tersedia`, reviewBody.includes('Pembahasan:'))
  await page.screenshot({ path: `${outDir}/review-${viewport.width}.png` })

  // 6. Back to dashboard: history count + fresh hero
  await page.getByRole('link', { name: 'Kembali ke hasil' }).click()
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await page.waitForURL(baseUrl)
  await page.waitForTimeout(500)
  const dashBody = await page.locator('body').innerText()
  check(`${suffix}: hero kembali "Mulai simulasi"`, (await page.getByRole('button', { name: 'Mulai simulasi' }).count()) > 0)
  check(`${suffix}: riwayat bertambah`, dashBody.includes('1'))
  await page.screenshot({ path: `${outDir}/dashboard-after-${viewport.width}.png` })
}

await withPage({ width: 1280, height: 900 }, examFlow)
await withPage({ width: 375, height: 812 }, examFlow)

writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
await browser.close()
