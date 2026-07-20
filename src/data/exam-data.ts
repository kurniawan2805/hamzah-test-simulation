import { examSchema } from '../lib/schema'
import type { ExamSet } from '../types'

const rawExam = {
  id: 'simulasi-akbar-1',
  title: 'Simulasi Akbar 1',
  subtitle: 'Latihan lengkap kemahiran bahasa Arab akademik',
  durationMinutes: 10,
  questions: [
    {
      id: 'hamza_q_001',
      section: 'listening',
      audio_url: 'generated-demo-audio',
      question: 'مَا هُوَ المَوْضُوعُ الرَّئِيسِيُّ لِلْحِوَارِ؟',
      options: ['التَّسْجِيلُ فِي الجَامِعَةِ', 'السَّفَرُ إِلَى الرِّيَاضِ', 'شِرَاءُ الكُتُبِ', 'البَحْثُ عَنْ عَمَلٍ'],
      correct_index: 0,
      explanation: 'Pembahasan: dialog latihan ini membahas langkah awal pendaftaran kuliah.',
    },
    {
      id: 'hamza_q_002',
      section: 'listening',
      audio_url: 'generated-demo-audio',
      question: 'مَتَى يَبْدَأُ الدَّرْسُ فِي الإِعْلَانِ؟',
      options: ['السَّاعَةُ السَّادِسَةُ', 'السَّاعَةُ السَّابِعَةُ', 'السَّاعَةُ الثَّامِنَةُ', 'السَّاعَةُ التَّاسِعَةُ'],
      correct_index: 2,
      explanation: 'Pembahasan: informasi waktu pada materi latihan menyebut pukul delapan.',
    },
    {
      id: 'hamza_q_003',
      section: 'reading',
      passage:
        'تَأْسِيسُ مَجْمَعِ المَلِكِ سَلْمَانَ العَالَمِيِّ لِلُّغَةِ العَرَبِيَّةِ جَاءَ لِتَعْزِيزِ دَوْرِ اللُّغَةِ العَرَبِيَّةِ، وَخِدْمَةِ مُتَعَلِّمِيهَا فِي دَاخِلِ المَمْلَكَةِ وَخَارِجِهَا. وَيُقَدِّمُ المَجْمَعُ بَرَامِجَ عِلْمِيَّةً وَثَقَافِيَّةً مُتَنَوِّعَةً.',
      question: 'لِمَاذَا تَأَسَّسَ مَجْمَعُ المَلِكِ سَلْمَانَ؟',
      options: ['لِتَعْزِيزِ دَوْرِ اللُّغَةِ العَرَبِيَّةِ', 'لِتَعْلِيمِ اللُّغَاتِ الأُخْرَى', 'لِلتِّجَارَةِ العَالَمِيَّةِ', 'لِلسِّيَاحَةِ الدِّينِيَّةِ'],
      correct_index: 0,
      explanation: 'Pembahasan: jawaban tersurat dalam kalimat pertama teks bacaan.',
    },
    {
      id: 'hamza_q_004',
      section: 'reading',
      passage:
        'تَأْسِيسُ مَجْمَعِ المَلِكِ سَلْمَانَ العَالَمِيِّ لِلُّغَةِ العَرَبِيَّةِ جَاءَ لِتَعْزِيزِ دَوْرِ اللُّغَةِ العَرَبِيَّةِ، وَخِدْمَةِ مُتَعَلِّمِيهَا فِي دَاخِلِ المَمْلَكَةِ وَخَارِجِهَا. وَيُقَدِّمُ المَجْمَعُ بَرَامِجَ عِلْمِيَّةً وَثَقَافِيَّةً مُتَنَوِّعَةً.',
      question: 'مَنْ الَّذِي يَخْدِمُهُ المَجْمَعُ؟',
      options: ['السُّيَّاحُ فَقَطْ', 'مُتَعَلِّمُو اللُّغَةِ العَرَبِيَّةِ', 'التُّجَّارُ فَقَطْ', 'الأَطِبَّاءُ فَقَطْ'],
      correct_index: 1,
      explanation: 'Pembahasan: teks menyebut خدمة متعلميها, yaitu para pembelajar bahasa Arab.',
    },
    {
      id: 'hamza_q_005',
      section: 'grammar',
      question: 'اِخْتَرِ الكَلِمَةَ الصَّحِيحَةَ: الطَّالِبَاتُ ___ إِلَى القَاعَةِ.',
      options: ['ذَهَبَ', 'ذَهَبْنَ', 'ذَهَبُوا', 'ذَهَبْتَ'],
      correct_index: 1,
      explanation: 'Pembahasan: subjek الطالبات adalah jamak perempuan, sehingga fiil lampau yang tepat ialah ذَهَبْنَ.',
    },
    {
      id: 'hamza_q_006',
      section: 'grammar',
      question: 'اِخْتَرِ الإِجَابَةَ الصَّحِيحَةَ: لَنْ ___ أَحْمَدُ اليَوْمَ.',
      options: ['يَكْتُبُ', 'يَكْتُبَ', 'كَتَبَ', 'يَكْتُبْ'],
      correct_index: 1,
      explanation: 'Pembahasan: لَنْ menashabkan fiil mudhari, sehingga bentuknya يَكْتُبَ.',
    },
    {
      id: 'hamza_q_007',
      section: 'dictation',
      question: 'اِخْتَرِ الكِتَابَةَ الصَّحِيحَةَ لِلكَلِمَةِ الَّتِي تَدُلُّ عَلَى «مَسْؤُولِيَّةٍ».',
      options: ['مَسْوُلِيَّة', 'مَسْؤُولِيَّة', 'مَسْئُولِيَّة', 'مَسُولِيَّة'],
      correct_index: 1,
      explanation: 'Pembahasan: bentuk baku memakai hamzah di atas waw, مَسْؤُولِيَّة.',
    },
    {
      id: 'hamza_q_008',
      section: 'dictation',
      question: 'أَيُّ كَلِمَةٍ تَحْتَوِي عَلَى هَمْزَةٍ مُتَوَسِّطَةٍ عَلَى يَاءٍ؟',
      options: ['سُؤَال', 'بِئْر', 'جُزْء', 'شَيْء'],
      correct_index: 1,
      explanation: 'Pembahasan: kata بِئْر menggunakan hamzah tengah di atas ya.',
    },
  ],
} as const

export const demoExam: ExamSet = examSchema.parse(rawExam)
