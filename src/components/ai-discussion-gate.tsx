import { useState } from 'react'
import { Crown, Lock, MessageSquareText, X } from 'lucide-react'
import type { UserTier } from '../types'

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5A059] focus:outline-none'

export function AiDiscussionGate({ tier }: { tier: UserTier }) {
  const [showUpgradeInfo, setShowUpgradeInfo] = useState(false)
  const isVipPlus = tier === 'vip_plus'

  return (
    <section className="mx-auto mt-8 max-w-2xl">
      {isVipPlus ? (
        <div className="rounded-3xl bg-white p-7 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] sm:p-9">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#FFF7E8] text-[#C5A059]">
            <MessageSquareText size={26} aria-hidden />
          </span>
          <p className="mt-5 text-sm font-bold text-[#006C35]">Diskusi dengan AI</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900 text-balance">Fitur ini segera hadir</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600 text-pretty">
            Akun VIP+ Anda sudah mendukung fitur diskusi. Saat ini tim masih menyiapkan pengalaman tanya-jawab soal,
            jadi pantau terus dashboard ini.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-amber-100 bg-white p-7 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] sm:p-9">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-900">
            <Lock size={24} aria-hidden />
          </span>
          <p className="mt-5 text-sm font-bold text-amber-800">Fitur VIP+</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900 text-balance">Diskusi dengan AI</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600 text-pretty">
            Tanyakan soal, bandingkan jawaban, dan pahami pembahasan dengan bantuan AI. Fitur ini hanya tersedia untuk
            akun VIP+.
          </p>
          <button
            type="button"
            onClick={() => setShowUpgradeInfo(true)}
            className={`mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-800 px-5 py-3 text-sm font-bold text-white transition-transform active:scale-[0.96] hover:bg-amber-900 ${focusRing}`}
          >
            <Crown size={16} aria-hidden /> Lihat ketentuan VIP+
          </button>
        </div>
      )}

      {showUpgradeInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <button
              type="button"
              onClick={() => setShowUpgradeInfo(false)}
              aria-label="Tutup dialog"
              className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} aria-hidden />
            </button>
            <span className="grid size-12 place-items-center rounded-2xl bg-amber-100 text-amber-900">
              <Crown size={22} aria-hidden />
            </span>
            <h3 className="mt-4 text-xl font-bold text-slate-900">Aktifkan VIP+</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 text-pretty">
              Pembelian otomatis belum tersedia. Hubungi admin untuk mengaktifkan paket VIP atau VIP+ pada akun Anda.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowUpgradeInfo(false)}
                className={`inline-flex min-h-11 items-center rounded-xl bg-amber-800 px-4 py-2 text-sm font-bold text-white hover:bg-amber-900 ${focusRing}`}
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
