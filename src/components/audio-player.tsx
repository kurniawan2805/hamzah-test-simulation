import { Pause, Play, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

interface AudioPlayerProps {
  questionId: string
  plays: number
  onPlay: () => boolean | Promise<boolean>
  audioUrl?: string
  maxPlays?: number
}

const makePracticeTone = () => {
  const sampleRate = 8_000
  const duration = 0.8
  const frameCount = Math.floor(sampleRate * duration)
  const buffer = new ArrayBuffer(44 + frameCount * 2)
  const view = new DataView(buffer)
  const writeText = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + frameCount * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, frameCount * 2, true)

  for (let index = 0; index < frameCount; index += 1) {
    const fade = Math.min(index / 400, (frameCount - index) / 400, 1)
    const sample = Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 0.11 * fade
    view.setInt16(44 + index * 2, sample * 32_767, true)
  }

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

export function AudioPlayer({ questionId, plays, onPlay, audioUrl, maxPlays = 2 }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const practiceToneUrl = useMemo(() => (audioUrl ? null : makePracticeTone()), [audioUrl])
  const [isPlaying, setIsPlaying] = useState(false)
  const exhausted = plays >= maxPlays

  useEffect(() => () => {
    if (practiceToneUrl) URL.revokeObjectURL(practiceToneUrl)
  }, [practiceToneUrl])

  const play = async () => {
    if (exhausted || isPlaying || !audioRef.current) return
    if (!(await onPlay())) return
    setIsPlaying(true)
    try {
      audioRef.current.currentTime = 0
      await audioRef.current.play()
    } catch {
      setIsPlaying(false)
    }
  }

  return (
    <section className="rounded-2xl bg-slate-100 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]" aria-label="Pemutar audio">
      <audio
        ref={audioRef}
        src={audioUrl ?? practiceToneUrl ?? undefined}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={play}
          disabled={exhausted || isPlaying}
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#006C35] text-white shadow-sm transition-[transform,background-color,opacity] active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
          aria-label={exhausted ? 'Kuota audio habis' : 'Putar audio'}
        >
          {isPlaying ? <Pause size={18} /> : <Play className="translate-x-px" size={19} fill="currentColor" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Volume2 size={16} className="text-[#006C35]" />
            Materi dengar latihan
          </div>
          <p className="mt-0.5 text-sm text-slate-600">Putar sampai {maxPlays} kali sebelum menjawab.</p>
        </div>
        <span className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums text-slate-600 shadow-sm">
          Sisa: {Math.max(0, maxPlays - plays)}/{maxPlays}
        </span>
      </div>
      {exhausted && <p className="mt-3 text-xs font-semibold text-slate-500">Kuota pemutaran audio telah habis.</p>}
      <span className="sr-only">Audio soal {questionId}</span>
    </section>
  )
}
