import React, { useState, useId } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  Upload,
  FileJson,
  Music,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Layers,
} from 'lucide-react'
import { examBundleImportSchema, type ExamBundleImportData } from '../lib/schema'
import { adminImportExamBundle, adminUploadAudioFile, adminCheckAudioExists } from '../lib/exam-api'

export interface AdminBundleUploaderProps {
  client?: SupabaseClient | null
  mode: 'cloud' | 'demo'
  onSuccess?: (packageId: string) => void
}

export interface AudioAssetStatus {
  path: string
  exists: boolean
  isChecking: boolean
  isUploading: boolean
  error?: string
}

export function AdminBundleUploader({ client, mode, onSuccess }: AdminBundleUploaderProps) {
  const jsonFileInputId = useId()
  const audioFileInputId = useId()
  const [jsonText, setJsonText] = useState('')
  const [parsedBundle, setParsedBundle] = useState<ExamBundleImportData | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [audioAssets, setAudioAssets] = useState<AudioAssetStatus[]>([])
  
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    package_id: string
    version_id: string
    slug: string
    question_count: number
  } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setJsonText(text)
      validateAndProcessJson(text)
    }
    reader.readAsText(file)
  }

  const validateAndProcessJson = (rawText: string) => {
    setValidationError(null)
    setImportResult(null)
    setImportError(null)

    try {
      const obj = JSON.parse(rawText)
      const parseResult = examBundleImportSchema.safeParse(obj)

      if (!parseResult.success) {
        const firstErr = parseResult.error.issues[0]
        setValidationError('Validasi Gagal: ' + firstErr.path.join('.') + ' - ' + firstErr.message)
        setParsedBundle(null)
        setAudioAssets([])
        return
      }

      const data = parseResult.data
      setParsedBundle(data)

      // Extract unique audio paths
      const paths = new Set<string>()
      data.questions.forEach((q) => {
        const audio = q.audio_path || q.audio_url || q.shared_asset_id
        if (audio && audio.trim()) {
          paths.add(audio.trim())
        }
      })

      const initialAssets: AudioAssetStatus[] = Array.from(paths).map((p) => ({
        path: p,
        exists: false,
        isChecking: mode === 'cloud' && Boolean(client),
        isUploading: false,
      }))

      setAudioAssets(initialAssets)

      if (mode === 'cloud' && client && initialAssets.length > 0) {
        checkAudioStatusAll(initialAssets)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'File tidak berformat JSON valid'
      setValidationError('Syntax Error: ' + msg)
      setParsedBundle(null)
      setAudioAssets([])
    }
  }

  const checkAudioStatusAll = async (assets: AudioAssetStatus[]) => {
    if (!client) return
    const updated = await Promise.all(
      assets.map(async (asset) => {
        try {
          const exists = await adminCheckAudioExists(client, asset.path)
          return { ...asset, exists, isChecking: false }
        } catch {
          return { ...asset, exists: false, isChecking: false }
        }
      })
    )
    setAudioAssets(updated)
  }

  const handleAudioFileUpload = async (assetPath: string, file: File) => {
    if (mode === 'demo' || !client) {
      setAudioAssets((prev) =>
        prev.map((a) => (a.path === assetPath ? { ...a, exists: true, isUploading: false } : a))
      )
      return
    }

    setAudioAssets((prev) =>
      prev.map((a) => (a.path === assetPath ? { ...a, isUploading: true, error: undefined } : a))
    )

    try {
      await adminUploadAudioFile(client, assetPath, file)
      setAudioAssets((prev) =>
        prev.map((a) => (a.path === assetPath ? { ...a, exists: true, isUploading: false } : a))
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunggah audio'
      setAudioAssets((prev) =>
        prev.map((a) => (a.path === assetPath ? { ...a, isUploading: false, error: msg } : a))
      )
    }
  }

  const handleExecuteImport = async () => {
    if (!parsedBundle) return

    setIsImporting(true)
    setImportError(null)

    try {
      if (mode === 'cloud' && client) {
        const res = await adminImportExamBundle(client, parsedBundle)
        setImportResult(res)
        if (onSuccess) onSuccess(res.package_id)
      } else {
        // Demo mode fallback simulation
        setImportResult({
          package_id: parsedBundle.slug || parsedBundle.id || 'demo-package',
          version_id: 'demo-version-1',
          slug: parsedBundle.slug || parsedBundle.id || 'demo-package',
          question_count: parsedBundle.questions.length,
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal melakukan impor bundle'
      setImportError(msg)
    } finally {
      setIsImporting(false)
    }
  }

  // Section distribution summary
  const sectionCounts = React.useMemo(() => {
    if (!parsedBundle) return {}
    const counts: Record<string, number> = {}
    parsedBundle.questions.forEach((q) => {
      counts[q.section] = (counts[q.section] || 0) + 1
    })
    return counts
  }, [parsedBundle])

  return (
    <div className="rounded-3xl border border-amber-200 bg-white p-6 shadow-xs sm:p-8">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 mb-1">
            <Upload size={14} /> Upload Bundle Soal (JSON &amp; Audio)
          </div>
          <h2 className="text-xl font-bold text-slate-900">Import Bundle Ujian Baru</h2>
          <p className="mt-1 text-xs text-slate-600">
            Unggah file JSON bank soal dan lokasi audio ke Supabase dalam 1 kali langkah praktis.
          </p>
        </div>
        <div>
          <span
            className={'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ' + (mode === 'cloud' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300')}
          >
            <Sparkles size={13} /> {mode === 'cloud' ? 'Supabase Storage Active' : 'Mode Demo Local'}
          </span>
        </div>
      </div>

      {/* Step 1: Input JSON Bundle */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/50 p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <span className="flex size-6 items-center justify-center rounded-full bg-amber-800 text-xs text-white">1</span>
          Pilih atau Paste File JSON Bundle Soal
        </h3>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* File Picker */}
          <div>
            <label
              htmlFor={jsonFileInputId}
              className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-center transition hover:border-amber-600 cursor-pointer"
            >
              <FileJson size={32} className="text-amber-800 mb-2" />
              <span className="text-xs font-bold text-slate-800">Klik untuk memilih file .json</span>
              <span className="mt-1 text-[11px] text-slate-400">Atau drag-and-drop file JSON di sini</span>
              <input
                id={jsonFileInputId}
                type="file"
                accept=".json,application/json"
                onChange={handleJsonUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Direct JSON Textarea */}
          <div className="flex flex-col">
            <textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value)
                if (e.target.value.trim()) {
                  validateAndProcessJson(e.target.value)
                } else {
                  setParsedBundle(null)
                  setValidationError(null)
                }
              }}
              placeholder='Atau paste isi JSON di sini: { "id": "banksoal12", "title": "...", "questions": [...] }'
              className="h-full min-h-32 w-full rounded-2xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800 focus:border-amber-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Validation Errors */}
        {validationError && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
            <AlertCircle size={18} className="shrink-0 text-red-500" />
            <span className="font-medium">{validationError}</span>
          </div>
        )}
      </div>

      {/* Step 2: Bundle Summary & Audio Inspection */}
      {parsedBundle && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
          <div className="flex items-center justify-between border-b border-amber-200/80 pb-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <span className="flex size-6 items-center justify-center rounded-full bg-amber-800 text-xs text-white">2</span>
              Ringkasan Bundle &amp; Verifikasi Audio
            </h3>
            <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
              ✓ JSON Valid
            </span>
          </div>

          {/* Metadata Card */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-amber-100 bg-white p-3 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Judul Paket</span>
              <p className="font-bold text-slate-900 truncate">{parsedBundle.title}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-white p-3 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Slug / ID</span>
              <p className="font-mono text-xs font-bold text-amber-950 truncate">
                {parsedBundle.slug || parsedBundle.id}
              </p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-white p-3 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Durasi</span>
              <p className="font-bold text-slate-900 flex items-center gap-1">
                <Clock size={13} className="text-amber-800" />
                {parsedBundle.durationMinutes || parsedBundle.duration_minutes || 60} Menit
              </p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-white p-3 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Soal</span>
              <p className="font-bold text-slate-900 flex items-center gap-1">
                <Layers size={13} className="text-amber-800" />
                {parsedBundle.questions.length} Nomor
              </p>
            </div>
          </div>

          {/* Section Distribution */}
          <div className="mt-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Distribusi Seksi:</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {Object.entries(sectionCounts).map(([sec, count]) => (
                <span
                  key={sec}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 capitalize shadow-2xs"
                >
                  <span>{sec}</span>
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-900">
                    {count}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Audio Upload List */}
          <div className="mt-5 rounded-xl border border-amber-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Music size={16} className="text-amber-800" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Status File Audio Paket ({audioAssets.length} File)
                </h4>
              </div>
              {mode === 'cloud' && client && audioAssets.length > 0 && (
                <button
                  type="button"
                  onClick={() => checkAudioStatusAll(audioAssets)}
                  className="inline-flex items-center gap-1 rounded-md text-xs font-bold text-amber-900 hover:text-amber-950"
                >
                  <RefreshCw size={12} /> Cek Ulang Status
                </button>
              )}
            </div>

            {audioAssets.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                Paket ini tidak memerlukan file audio tambahan.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {audioAssets.map((asset) => (
                  <div
                    key={asset.path}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Music size={16} className="shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-slate-900 truncate">{asset.path}</p>
                        <p className="text-[11px] text-slate-500">
                          Target Bucket: <code className="bg-slate-200 px-1 rounded font-mono">exam-audio/{asset.path}</code>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {asset.isChecking ? (
                        <span className="inline-flex items-center gap-1 text-slate-400 font-semibold text-[11px]">
                          <RefreshCw size={12} className="animate-spin" /> Checking...
                        </span>
                      ) : asset.exists ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 font-bold text-emerald-800 text-[11px]">
                          <CheckCircle2 size={13} /> Tersedia di Storage
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 font-bold text-amber-900 text-[11px]">
                            <AlertCircle size={12} /> Belum Upload
                          </span>

                          <label
                            htmlFor={audioFileInputId + '-' + asset.path}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-800 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-amber-900 cursor-pointer"
                          >
                            <Upload size={12} />
                            {asset.isUploading ? 'Uploading...' : 'Upload File MP3'}
                            <input
                              id={audioFileInputId + '-' + asset.path}
                              type="file"
                              accept="audio/*,.mp3,.wav"
                              disabled={asset.isUploading}
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) handleAudioFileUpload(asset.path, f)
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Step 3: Execute Import */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-amber-200/80 pt-4">
            <div className="text-xs text-slate-600">
              {mode === 'cloud' ? (
                <span>Fungsi <code className="bg-amber-100 px-1 py-0.5 rounded text-amber-950 font-mono">admin_import_exam_bundle</code> akan membuat/mengganti data paket &amp; soal secara aman.</span>
              ) : (
                <span>Mode Demo: Impor akan mensimulasikan penyimpanan bank soal.</span>
              )}
            </div>

            <button
              type="button"
              disabled={isImporting || !parsedBundle}
              onClick={handleExecuteImport}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-amber-800 px-6 py-2.5 text-xs font-bold text-white shadow-md transition-transform active:scale-[0.98] hover:bg-amber-900 disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Mengimpor Ke Supabase...
                </>
              ) : (
                <>
                  <ArrowRight size={14} /> Eksekusi Impor Bundle
                </>
              )}
            </button>
          </div>

          {importError && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
              <AlertCircle size={18} className="shrink-0 text-red-500" />
              <span>Gagal Impor: {importError}</span>
            </div>
          )}

          {importResult && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-900">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0 text-amber-800" />
                <div>
                  <h4 className="font-bold text-sm">Bundle Soal Berhasil Diimpor!</h4>
                  <p className="text-xs text-emerald-800">
                    Paket <code className="font-mono bg-emerald-100 px-1 rounded">{importResult.slug}</code> dengan {importResult.question_count} nomor telah diterbitkan dan siap diakses peserta.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
