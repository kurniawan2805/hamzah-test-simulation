import fs from 'node:fs'

const input = fs.readFileSync('/Users/adi/Downloads/banksoal1.txt', 'utf8')
const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
const answers = [1,2,1,1,2,1,2,2,1,0,1,2,1,1,1,1,2,2,2,2,1,0,1,1,2,0,0,1,1,1,1,3,1,1,2,1,1,1,1,1,1,1,2,1,1,0,0,1,1,1,1,1,1,1,1,1,2,1,1,1,1,0,0,0,0]
const sectionFor = (number) => number <= 10 ? 'listening' : number <= 20 || (number >= 36 && number <= 45) || (number >= 51 && number <= 60) ? 'reading' : number === 35 || number === 64 ? 'dictation' : 'grammar'
const questions = []
for (let i = 0; i < lines.length; i += 1) {
  const match = lines[i].match(/^(\d+)\.\s*(.*)$/)
  if (!match) continue
  const number = Number(match[1])
  const questionLines = [match[2]]
  let j = i + 1
  while (j < lines.length && !/^[A-D]\.\s*/.test(lines[j]) && !/^\d+\.\s*/.test(lines[j])) {
    questionLines.push(lines[j])
    j += 1
  }
  const options = []
  while (j < lines.length && options.length < 4) {
    const option = lines[j].match(/^[A-D]\.\s*(.*)$/)
    if (!option) break
    options.push(option[1])
    j += 1
  }
  if (options.length === 4 && number <= 65) {
    questions.push({ id: `hamza_q_${String(number).padStart(3, '0')}`, section: sectionFor(number), question: questionLines.join(' '), options, correct_index: answers[number - 1], explanation: `Jawaban benar: ${String.fromCharCode(65 + answers[number - 1])}.` })
  }
  i = j - 1
}
fs.writeFileSync('src/data/banksoal1.json', `${JSON.stringify({ id: 'banksoal1', title: 'اختبار همزة التجريبي', subtitle: 'Bank soal latihan bahasa Arab', durationMinutes: 55, questions }, null, 2)}\n`)
console.log(`Converted ${questions.length} questions`)
