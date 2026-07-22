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
  scored: z.boolean().optional(),
})

export const examSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  durationMinutes: z.number().positive(),
  questions: z.array(questionSchema).min(1),
})
