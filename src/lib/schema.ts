import { z } from 'zod'

export const questionSchema = z.object({
  id: z.string().min(1),
  section: z.enum(['listening', 'reading', 'grammar', 'structures', 'writing', 'speaking']),
  question: z.string().min(1),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  correct_index: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
  passage: z.string().optional(),
  audio_url: z.string().optional(),
  shared_asset_id: z.string().optional(),
  answer_type: z.enum(['multiple_choice', 'writing', 'speaking']).optional(),
  prompt_hint: z.string().optional(),
  minimum_words: z.number().int().positive().optional(),
  preparation_seconds: z.number().int().positive().optional(),
  max_recording_seconds: z.number().int().positive().optional(),
  scored: z.boolean().optional(),
})

export const examSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  durationMinutes: z.number().positive(),
  questions: z.array(questionSchema).min(1),
})

export const bundleQuestionSchema = z.object({
  id: z.string().optional(),
  section: z.enum(['listening', 'reading', 'grammar', 'structures', 'writing', 'speaking']),
  question: z.string().min(1, 'Pertanyaan tidak boleh kosong'),
  options: z.array(z.string()).min(4).max(4).nullable().optional(),
  correct_index: z.number().int().min(0).max(3).optional(),
  correctIndex: z.number().int().min(0).max(3).optional(),
  explanation: z.string().optional().default(''),
  passage: z.string().nullable().optional(),
  audio_path: z.string().nullable().optional(),
  audio_url: z.string().nullable().optional(),
  shared_asset_id: z.string().nullable().optional(),
  answer_type: z.enum(['multiple_choice', 'writing', 'speaking']).optional(),
  prompt_hint: z.string().nullable().optional(),
  minimum_words: z.number().int().positive().nullable().optional(),
  preparation_seconds: z.number().int().positive().nullable().optional(),
  max_recording_seconds: z.number().int().positive().nullable().optional(),
})

export const examBundleImportSchema = z.object({
  id: z.string().optional(),
  slug: z.string().optional(),
  title: z.string().min(1, 'Judul paket wajib diisi'),
  subtitle: z.string().optional().default('Simulasi Ujian'),
  durationMinutes: z.number().positive().optional(),
  duration_minutes: z.number().positive().optional(),
  min_tier: z.enum(['free', 'vip', 'vip_plus']).optional(),
  minTier: z.enum(['free', 'vip', 'vip_plus']).optional(),
  isPublic: z.boolean().optional(),
  is_public: z.boolean().optional(),
  questions: z.array(bundleQuestionSchema).min(1, 'Minimal harus terdapat 1 soal dalam bundle'),
}).refine((data) => Boolean(data.id || data.slug), {
  message: 'Bundle wajib memiliki id atau slug paket',
  path: ['slug'],
})

export type ExamBundleImportData = z.infer<typeof examBundleImportSchema>
