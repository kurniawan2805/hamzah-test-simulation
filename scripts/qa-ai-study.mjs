import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const baseUrl = process.env.QA_BASE_URL || 'http://localhost:5173/'
const outDir = process.env.QA_OUT_DIR || '/tmp/hamza-qa'
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--disable-gpu'],
})

const report = { checks: [], errors: [], skipped: [], failedResources: [] }

function check(name, ok, detail = '') {
  report.checks.push({ name, ok, detail })
}

async function withPage(viewport, fn) {
  const page = await browser.newPage({ viewport })
  page.on('pageerror', (err) => report.errors.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.errors.push(`console: ${msg.text()}`)
  })
  page.on('response', (res) => {
    if (res.status() >= 400) report.failedResources.push(`${res.status()} ${res.url()}`)
  })
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await fn(page, viewport)
  await page.close()
}

async function setTier(page, tier, role = 'user') {
  await page.evaluate(
    ([t, r]) => {
      localStorage.setItem('hamza_demo_tier', t)
      localStorage.setItem('hamza_demo_role', r)
      localStorage.removeItem('hamza-test-simulation')
    },
    [tier, role],
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
}

const openAiTab = async (page) => {
  await page.getByRole('button', { name: 'Diskusi AI' }).click()
  await page.waitForTimeout(300)
}

const freeGate = async (page, viewport) => {
  await setTier(page, 'free')
  await openAiTab(page)
  const body = await page.locator('body').innerText()
  check(
    `${viewport.width}px: non-VIP+ melihat gerbang terkunci`,
    body.includes('Fitur VIP+') && body.includes('Lihat ketentuan VIP+'),
  )
  await page.screenshot({ path: `${outDir}/ai-study-gate-free-${viewport.width}.png` })
}

const resultsFlow = async (page) => {
  await setTier(page, 'vip_plus')
  await page.evaluate(() => {
    const result = {
      id: 'qa-result-1',
      examId: 'hamza-test-full-1',
      completedAt: Date.now(),
      score: 60,
      correctCount: 12,
      totalQuestions: 20,
      cefr: 'B2',
      sectionScores: { listening: 80, reading: 75, grammar: 40, structures: 70, writing: 85, speaking: 85 },
      reason: 'submitted',
    }
    localStorage.setItem('hamza-test-simulation', JSON.stringify({ state: { history: [result] }, version: 0 }))
  })
  await page.goto(`${baseUrl}results`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  const body = await page.locator('body').innerText()
  check(
    '1280px: halaman hasil menampilkan rekomendasi topik',
    body.includes('Rekomendasi VIP+') && body.includes('Huruf Jar') && body.includes('Buka Belajar AI'),
  )
  await page.screenshot({ path: `${outDir}/ai-study-results-recommend-1280.png` })
  await page.getByRole('button', { name: 'Buka Belajar AI' }).click()
  await page.waitForTimeout(700)
  const afterBody = await page.locator('body').innerText()
  check(
    '1280px: rekomendasi membuka tab Belajar AI dengan topik terpilih',
    afterBody.includes('Huruf Jar') && afterBody.includes('Materi & Diskusi') && afterBody.includes('حروف الجر'),
  )
  await page.screenshot({ path: `${outDir}/ai-study-results-preselect-1280.png` })
}

const studyFlow = async (page, viewport) => {
  await setTier(page, 'vip_plus')
  await openAiTab(page)

  let body = await page.locator('body').innerText()
  check(
    `${viewport.width}px: katalog topik tampil`,
    body.includes('Huruf Jar') && body.includes('حروف الجر') && body.includes('Kaana wa Akhwatuha'),
  )
  check(`${viewport.width}px: badge kuota awal`, body.includes('Pesan: 30/30') && body.includes('Kuis: 10/10'))
  await page.screenshot({ path: `${outDir}/ai-study-topics-${viewport.width}.png` })

  await page.getByRole('button', { name: /Huruf Jar/ }).first().click()
  await page.waitForTimeout(300)
  body = await page.locator('body').innerText()
  check(`${viewport.width}px: halaman topik dengan materi & kuis`, body.includes('Materi & Diskusi') && body.includes('Kuis 5 soal'))

  await page.getByRole('button', { name: 'Mulai belajar topik ini' }).click()
  await page.waitForTimeout(400)
  body = await page.locator('body').innerText()
  check(`${viewport.width}px: materi demo dari AI tampil`, body.includes('Contoh materi (mode demo)') && body.includes('إِلَى'))
  await page.screenshot({ path: `${outDir}/ai-study-lesson-${viewport.width}.png` })

  await page.getByRole('button', { name: 'Mulai kuis 5 soal' }).click()
  await page.waitForTimeout(400)
  const quizSection = page.getByRole('heading', { name: 'Kuis 5 soal' }).locator('xpath=ancestor::section[1]')
  check(`${viewport.width}px: kuis RTL 5 soal dimulai`, (await quizSection.innerText()).includes('Soal 1 dari 5'))
  await page.screenshot({ path: `${outDir}/ai-study-quiz-${viewport.width}.png` })

  for (let i = 0; i < 5; i += 1) {
    await quizSection.locator('div[dir="rtl"]').first().locator('button').first().click()
    await page.waitForTimeout(150)
    if (i < 4) {
      await quizSection.getByRole('button', { name: 'Berikutnya' }).click()
      await page.waitForTimeout(150)
    }
  }
  await quizSection.getByRole('button', { name: 'Kumpulkan jawaban' }).click()
  await page.waitForTimeout(500)
  body = await page.locator('body').innerText()
  check(`${viewport.width}px: hasil kuis dengan pembahasan`, body.includes('Skor kuis') && body.includes('Pembahasan:') && body.includes('soal benar'))
  await page.screenshot({ path: `${outDir}/ai-study-result-${viewport.width}.png` })

  const chatBox = page.getByPlaceholder('Tanya AI tentang topik ini…')
  await chatBox.fill('Apa bedanya huruf jar dan isim majrur?')
  await chatBox.press('Enter')
  await page.waitForTimeout(400)
  body = await page.locator('body').innerText()
  check(`${viewport.width}px: balasan chat AI terikat topik`, body.includes('Contoh jawaban AI (mode demo)'))
  check(`${viewport.width}px: kuota menurun setelah pesan`, body.includes('Pesan: 28/30') && body.includes('Kuis: 9/10'))
  await page.screenshot({ path: `${outDir}/ai-study-chat-${viewport.width}.png` })

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await openAiTab(page)
  await page.getByRole('button', { name: /Huruf Jar/ }).first().click()
  await page.waitForTimeout(400)
  body = await page.locator('body').innerText()
  check(
    `${viewport.width}px: refresh/resume menyimpan progres`,
    body.includes('Skor kuis') && body.includes('Contoh jawaban AI (mode demo)') && body.includes('Pesan: 28/30'),
  )
  await page.screenshot({ path: `${outDir}/ai-study-resume-${viewport.width}.png` })

  await page.evaluate(() => {
    const d = new Date()
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    localStorage.setItem(
      'hamza-test-simulation',
      JSON.stringify({ state: { demoAiStudyUsage: { date: dateKey, messagesUsed: 30, quizzesUsed: 10 } }, version: 0 }),
    )
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await openAiTab(page)
  await page.getByRole('button', { name: /Huruf Jar/ }).first().click()
  await page.waitForTimeout(300)
  body = await page.locator('body').innerText()
  check(
    `${viewport.width}px: kuota habis menolak materi & kuis`,
    body.includes('Kuota pesan harian sudah habis. Coba lagi besok.') && body.includes('Kuota kuis harian sudah habis. Coba lagi besok.'),
  )
  await page.screenshot({ path: `${outDir}/ai-study-quota-${viewport.width}.png` })
}

await withPage({ width: 1280, height: 900 }, studyFlow)
await withPage({ width: 320, height: 700 }, studyFlow)
await withPage({ width: 1280, height: 900 }, freeGate)
await withPage({ width: 320, height: 700 }, freeGate)
await withPage({ width: 1280, height: 900 }, resultsFlow)

writeFileSync(`${outDir}/report-ai-study.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
await browser.close()
