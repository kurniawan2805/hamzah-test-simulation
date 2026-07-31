import { describe, expect, it } from 'vitest'
import { examBundleImportSchema } from './schema'
import banksoal1 from '../data/banksoal1.json'

describe('examBundleImportSchema', () => {
  it('should successfully validate existing banksoal JSON bundles', () => {
    const result = examBundleImportSchema.safeParse(banksoal1)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe(banksoal1.title)
      expect(result.data.questions.length).toBe(banksoal1.questions.length)
    }
  })

  it('should reject bundle missing both id and slug', () => {
    const invalidBundle = {
      title: 'Ujian Tanpa Slug',
      durationMinutes: 60,
      questions: [
        {
          section: 'reading',
          question: 'ما معنى هذا؟',
          options: ['A', 'B', 'C', 'D'],
          correct_index: 0,
          explanation: 'Penjelasan',
        },
      ],
    }
    const result = examBundleImportSchema.safeParse(invalidBundle)
    expect(result.success).toBe(false)
  })

  it('should accept valid bundle with custom audio_path and writing/speaking sections', () => {
    const customBundle = {
      slug: 'arab-b2-custom',
      title: 'Ujian Arab B2 Kustom',
      durationMinutes: 45,
      questions: [
        {
          section: 'listening',
          question: 'استمع إلى النص التالي ثم أجب',
          options: ['خيار 1', 'خيار 2', 'خيار 3', 'خيار 4'],
          correct_index: 2,
          explanation: 'Penjelasan listening',
          audio_path: 'b2_audio_01.mp3',
        },
        {
          section: 'writing',
          question: 'اكتب مقالاً قصيراً عن أهمية اللغة العربية',
          answer_type: 'writing',
          minimum_words: 50,
          explanation: 'Soal menulis',
        },
        {
          section: 'speaking',
          question: 'تحدث عن هوايتك المفضلة',
          answer_type: 'speaking',
          preparation_seconds: 30,
          max_recording_seconds: 90,
          explanation: 'Soal berbicara',
        },
      ],
    }

    const result = examBundleImportSchema.safeParse(customBundle)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.questions.length).toBe(3)
      expect(result.data.questions[0].audio_path).toBe('b2_audio_01.mp3')
    }
  })
})
