import { examSchema } from '../lib/schema'
import type { ExamSet } from '../types'
import bankSoal from './banksoal1.json'

export const demoExam: ExamSet = examSchema.parse(bankSoal)
