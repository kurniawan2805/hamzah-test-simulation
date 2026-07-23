import React, { useState, useEffect, useRef } from 'react'
import { Mic, Square, RotateCcw, Play, Pause, AlertCircle, Volume2 } from 'lucide-react'

interface SpeakingRecorderProps {
  questionId: string
  preparationSeconds?: number
  maxRecordingSeconds?: number
  onRecordingComplete: (blob: Blob) => void
  disabled?: boolean
  existingAudioUrl?: string | null
}

type Stage = 'idle' | 'preparing' | 'recording' | 'completed'

export const SpeakingRecorder: React.FC<SpeakingRecorderProps> = ({
  questionId,
  preparationSeconds = 30,
  maxRecordingSeconds = 60,
  onRecordingComplete,
  disabled = false,
  existingAudioUrl = null,
}) => {
  const [stage, setStage] = useState<Stage>(existingAudioUrl ? 'completed' : 'idle')
  const [timer, setTimer] = useState<number>(preparationSeconds)
  const [audioUrl, setAudioUrl] = useState<string | null>(existingAudioUrl)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerIntervalRef = useRef<number | null>(null)

  const stopTimer = () => {
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
  }

  const stopMediaStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }

  // Keep the recorder state aligned with the active question and persisted answer.
  useEffect(() => {
    return () => {
      stopTimer()
      stopMediaStream()
    }
  }, [questionId])

  // Phase 1: Start Preparation Countdown
  const startPreparation = () => {
    setError(null)
    setStage('preparing')
    setTimer(preparationSeconds)

    stopTimer()
    timerIntervalRef.current = window.setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          stopTimer()
          void startRecording()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  // Phase 2: Start Recording automatically or manually
  const startRecording = async () => {
    stopTimer()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream

      let mimeType = 'audio/webm;codecs=opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        // Fallback for Safari/iOS
        mimeType = 'audio/mp4'
      }

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data)
        }
      }

      recorder.onstop = () => {
        const finalBlob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' })
        const url = URL.createObjectURL(finalBlob)
        setAudioUrl(url)
        onRecordingComplete(finalBlob)
        setStage('completed')
      }

      recorder.start()
      setStage('recording')
      setTimer(maxRecordingSeconds)

      timerIntervalRef.current = window.setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            stopTimer()
            stopRecording()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err) {
      console.error('Error accessing microphone:', err)
      setError('Gagal mengakses mikrofon. Pastikan Anda memberikan izin akses mikrofon.')
      setStage('idle')
    }
  }

  const stopRecording = () => {
    stopTimer()
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  const handlePlayPause = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      void audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const handleAudioEnded = () => {
    setIsPlaying(false)
  }

  const handleReset = () => {
    stopTimer()
    stopMediaStream()
    setAudioUrl(null)
    setStage('idle')
    setIsPlaying(false)
  }

  return (
    <div className="mt-6 rounded-2xl border border-dashed border-[#C5A059] bg-[#FFFCF4] p-6 text-center">
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 text-left font-sans">
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {stage === 'idle' && (
        <div className="font-sans">
          <Mic className="mx-auto text-[#006C35]" size={32} />
          <h4 className="mt-3 text-sm font-bold text-slate-900">Mulai Tugas Berbicara</h4>
          <p className="mt-1 text-xs text-slate-600 leading-5">
            Persiapan: {preparationSeconds} detik · Perekaman: {maxRecordingSeconds} detik.
          </p>
          <button
            type="button"
            onClick={startPreparation}
            disabled={disabled}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#006C35] px-5 text-sm font-bold text-white transition-all hover:bg-[#00572B] disabled:opacity-50"
          >
            Mulai Persiapan
          </button>
        </div>
      )}

      {stage === 'preparing' && (
        <div className="font-sans">
          <Volume2 className="mx-auto text-[#C5A059] animate-bounce" size={32} />
          <h4 className="mt-3 text-sm font-bold text-slate-900">Waktu Persiapan Berjalan</h4>
          <p className="mt-1 text-xs text-slate-600">Baca soal dan siapkan jawaban Anda.</p>
          <div className="mt-4 text-3xl font-black text-[#006C35] tabular-nums">
            {timer}s
          </div>
          <button
            type="button"
            onClick={startRecording}
            className="mt-3 text-xs font-semibold text-[#006C35] underline hover:text-[#00572B]"
          >
            Lewati Persiapan (Langsung Rekam)
          </button>
        </div>
      )}

      {stage === 'recording' && (
        <div className="font-sans">
          <div className="relative mx-auto flex size-12 items-center justify-center rounded-full bg-red-100">
            <span className="absolute size-8 animate-ping rounded-full bg-red-400 opacity-75"></span>
            <span className="relative size-4 rounded-full bg-red-600"></span>
          </div>
          <h4 className="mt-3 text-sm font-bold text-slate-900">Sedang Merekam...</h4>
          <p className="mt-1 text-xs text-slate-600">Bicaralah dengan jelas dalam Bahasa Arab.</p>
          <div className="mt-4 text-3xl font-black text-red-600 tabular-nums">
            {timer}s
          </div>
          <button
            type="button"
            onClick={stopRecording}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white transition-all hover:bg-red-700"
          >
            <Square size={16} /> Hentikan Rekaman
          </button>
        </div>
      )}

      {stage === 'completed' && (
        <div className="font-sans">
          <Mic className="mx-auto text-[#C5A059]" size={32} />
          <h4 className="mt-2 text-sm font-bold text-slate-900">Rekaman Selesai Disimpan</h4>
          <p className="mt-1 text-xs text-slate-600">Anda dapat mendengarkan kembali hasil rekaman Anda.</p>
          
          {audioUrl && (
            <div className="mt-4 flex flex-col items-center justify-center gap-3">
              <audio
                ref={audioRef}
                src={audioUrl}
                onEnded={handleAudioEnded}
                className="hidden"
                preload="auto"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePlayPause}
                  className="flex size-10 items-center justify-center rounded-full bg-[#006C35] text-white hover:bg-[#00572B]"
                  aria-label={isPlaying ? 'Pause rekaman' : 'Putar rekaman'}
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={disabled}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50"
                >
                  <RotateCcw size={14} /> Rekam Ulang
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
