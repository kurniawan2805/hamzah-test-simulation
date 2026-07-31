import { describe, expect, it } from 'vitest'
import { examSchema } from '../lib/schema'
import banksoal1 from './banksoal1.json'
import banksoal2 from './banksoal2.json'
import banksoal3 from './banksoal3.json'
import banksoal4 from './banksoal4.json'
import banksoal5 from './banksoal5.json'
import banksoal6 from './banksoal6.json'
import banksoal7 from './banksoal7.json'
import banksoal8 from './banksoal8.json'
import banksoal9 from './banksoal9.json'
import banksoal10 from './banksoal10.json'
import banksoal11 from './banksoal11.json'

const bundles = [
  banksoal1, banksoal2, banksoal3, banksoal4, banksoal5,
  banksoal6, banksoal7, banksoal8, banksoal9, banksoal10, banksoal11
]

describe('All 11 Banksoal Bundles Validation', () => {
  bundles.forEach((bundle, idx) => {
    it(`should validate bundle ${idx + 1} (${bundle.id}) against examSchema`, () => {
      const parsed = examSchema.safeParse(bundle)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.questions.length).toBe(75)
      }
    })
  })
})
