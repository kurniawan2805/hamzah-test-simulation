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

const freeDashboard = async (page, viewport) => {
  const body = await page.locator('body').innerText()
  check(`${viewport.width}px: badge Gratis`, body.includes('Gratis'))
  const pkgCard = page.locator('article', { hasText: 'Full Test' }).first()
  check(`${viewport.width}px: badge Gratis di kartu paket`, (await pkgCard.innerText()).includes('Gratis'))
  check(`${viewport.width}px: tab Diskusi AI`, await page.getByRole('button', { name: 'Diskusi AI' }).count() > 0)
  check(`${viewport.width}px: selector tier demo`, await page.getByLabel('Tier demo').count() > 0)
  await page.screenshot({ path: `${outDir}/dashboard-${viewport.width}.png` })
  await pkgCard.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${outDir}/dashboard-packages-${viewport.width}.png` })

  await page.getByRole('button', { name: 'Diskusi AI' }).click()
  await page.waitForTimeout(250)
  const aiBody = await page.locator('body').innerText()
  check(`${viewport.width}px: gerbang AI terkunci (free)`, aiBody.includes('Fitur VIP+') && aiBody.includes('Lihat ketentuan VIP+'))
  await page.screenshot({ path: `${outDir}/ai-gate-free-${viewport.width}.png` })
  await page.getByRole('button', { name: 'Lihat ketentuan VIP+' }).click()
  await page.waitForTimeout(250)
  const dialogBody = await page.locator('body').innerText()
  check(`${viewport.width}px: dialog ketentuan VIP+ terbuka`, dialogBody.includes('Aktifkan VIP+') && dialogBody.includes('Hubungi admin'))
  await page.screenshot({ path: `${outDir}/ai-dialog-${viewport.width}.png` })
  await page.getByRole('button', { name: 'Mengerti' }).click()
  await page.waitForTimeout(150)

  await page.evaluate(() => localStorage.setItem('hamza_demo_tier', 'vip_plus'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Diskusi AI' }).click()
  await page.waitForTimeout(250)
  const vipBody = await page.locator('body').innerText()
  check(
    `${viewport.width}px: VIP+ melihat tab Belajar Topik`,
    vipBody.includes('Belajar Topik dengan AI') && vipBody.includes('Materi, kuis, dan diskusi'),
  )
  await page.screenshot({ path: `${outDir}/ai-study-tab-${viewport.width}.png` })
}

const adminFlow = async (page, viewport) => {
  await page.evaluate(() => {
    localStorage.setItem('hamza_demo_tier', 'free')
    localStorage.setItem('hamza_demo_role', 'admin')
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const body = await page.locator('body').innerText()
  check(`${viewport.width}px: tab Manajemen User muncul (admin)`, body.includes('Manajemen User'))

  await page.getByRole('button', { name: /Manajemen User/ }).click()
  await page.waitForTimeout(400)
  const mgmtBody = await page.locator('body').innerText()
  check(`${viewport.width}px: kolom Tier di tabel user`, mgmtBody.includes('Gratis') && mgmtBody.includes('VIP+'))
  await page.screenshot({ path: `${outDir}/user-mgmt-${viewport.width}.png` })
  await page.screenshot({ path: `${outDir}/user-mgmt-full-${viewport.width}.png`, fullPage: true })

  const detailButtons = page.getByRole('button', { name: /Detail & Sesi/ })
  if (await detailButtons.count() > 0) {
    await detailButtons.first().click()
    await page.waitForTimeout(300)
    const drawer = await page.locator('body').innerText()
    check(`${viewport.width}px: kontrol tier di detail user`, /tingkatan akun/i.test(drawer))
    await page.screenshot({ path: `${outDir}/user-detail-${viewport.width}.png` })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Tutup Detail' }).click().catch(() => {})
  }

  await page.getByRole('button', { name: 'Format Ujian' }).click()
  await page.waitForTimeout(300)
  const pkgBody = await page.locator('body').innerText()
  const pkgTierSelect = await page.getByLabel(/Ubah tier paket/).count()
  if (pkgTierSelect > 0) {
    check(`${viewport.width}px: pemilih tier paket admin`, true)
  } else {
    report.skipped.push(`${viewport.width}px: pemilih tier paket admin (cloud-only, demo memakai satu paket lokal)`)
  }
  await page.screenshot({ path: `${outDir}/packages-admin-${viewport.width}.png` })

  await page.getByRole('button', { name: 'Input & Revisi Soal' }).click()
  await page.waitForTimeout(400)
  check(`${viewport.width}px: tab Input & Revisi Soal terbuka`, (await page.locator('body').innerText()).includes('Input & Revisi Soal Bahasa Arab'))
  await page.screenshot({ path: `${outDir}/question-bank-${viewport.width}.png` })

  await page.getByRole('button', { name: /Upload Bundle Soal/ }).click()
  await page.waitForTimeout(400)
  check(`${viewport.width}px: tab Upload Bundle terbuka`, (await page.locator('body').innerText()).includes('Upload Bundle'))
  await page.screenshot({ path: `${outDir}/bundle-upload-${viewport.width}.png` })
}

await withPage({ width: 1280, height: 900 }, freeDashboard)
await withPage({ width: 375, height: 812 }, freeDashboard)
await withPage({ width: 1280, height: 900 }, adminFlow)
await withPage({ width: 768, height: 1024 }, adminFlow)
await withPage({ width: 375, height: 812 }, adminFlow)

writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
await browser.close()
