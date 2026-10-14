import type { Section } from '../types'

export type AiTopic = {
  id: string
  section: 'grammar' | 'structures'
  title: string
  arabicTitle: string
  description: string
}

export const AI_STUDY_TOPIC_STORAGE_KEY = 'hamza_ai_topic'

export const aiTopics = [
  {
    id: 'grammar_huruf_jar',
    section: 'grammar',
    title: 'Huruf Jar',
    arabicTitle: 'حروف الجر',
    description: 'Preposisi Arab seperti إِلَى dan مِن serta pengaruhnya pada kata setelahnya.',
  },
  {
    id: 'grammar_fiil_madhi_mudhari',
    section: 'grammar',
    title: "Fi'il Madhi & Mudhari'",
    arabicTitle: 'الفعل الماضي والمضارع',
    description: 'Bentuk kata kerja lampau dan sekarang beserta pelaku dan konjugasinya.',
  },
  {
    id: 'grammar_mubtada_khabar',
    section: 'grammar',
    title: "Mubtada' & Khabar",
    arabicTitle: 'المبتدأ والخبر',
    description: 'Susunan kalimat nominal: subjek, predikat, dan kesesuaiannya.',
  },
  {
    id: 'structures_kaana',
    section: 'structures',
    title: 'Kaana wa Akhwatuha',
    arabicTitle: 'كان وأخواتها',
    description: 'Verba penyalin seperti كَانَ dan perubahan fungsi kalimat setelahnya.',
  },
  {
    id: 'structures_isim_majrur',
    section: 'structures',
    title: 'Isim Majrur',
    arabicTitle: 'الاسم المجرور',
    description: 'Kata benda berharakat kasrah karena didahului huruf jar atau idhafah.',
  },
] as const satisfies readonly AiTopic[]

export type TopicRecommendation = {
  topicId: string | null
  section: Section
  label: string
  reason: string
}

const orderedSections: readonly Section[] = ['listening', 'reading', 'grammar', 'structures']

const sectionLabels: Record<'listening' | 'reading', string> = {
  listening: 'Listening',
  reading: 'Reading',
}

export function aiTopicById(id: string): AiTopic | undefined {
  return aiTopics.find((topic) => topic.id === id)
}

export function recommendTopics(sectionScores: Partial<Record<Section, number>>): TopicRecommendation[] {
  const scoredSections = orderedSections.filter((section) => typeof sectionScores[section] === 'number')
  if (scoredSections.length === 0) return []

  const weakestScore = Math.min(...scoredSections.map((section) => sectionScores[section] as number))
  return scoredSections
    .filter((section) => sectionScores[section] === weakestScore)
    .slice(0, 2)
    .map((section): TopicRecommendation => {
      if (section === 'grammar' || section === 'structures') {
        const topic = aiTopics.find((item) => item.section === section)
        return {
          topicId: topic?.id ?? null,
          section,
          label: topic?.title ?? section,
          reason: `Skor ${section} adalah yang terendah (${sectionScores[section]}). Mulai dari topik prioritas.`,
        }
      }
      if (section === 'listening' || section === 'reading') {
        return {
          topicId: null,
          section,
          label: `Latihan ${sectionLabels[section]}`,
          reason: `Skor ${sectionLabels[section]} adalah yang terendah (${sectionScores[section]}). Ulangi latihan seksi ini dulu.`,
        }
      }
      return {
        topicId: null,
        section,
        label: section,
        reason: `Skor ${section} adalah yang terendah (${sectionScores[section]}).`,
      }
    })
}
