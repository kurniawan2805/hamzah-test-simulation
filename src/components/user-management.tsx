import React, { useState, useMemo } from 'react'
import {
  Users,
  User,
  ShieldCheck,
  Search,
  Download,
  UserPlus,
  X,
  Check,
  Copy,
  Award,
  BarChart3,
  BookOpenCheck,
  Sparkles,
  Info,
  CheckCircle2,
  Mail,
  Lock,
  Send,
} from 'lucide-react'

export interface UserAttemptItem {
  id: string
  examTitle: string
  startedAt: string
  completedAt?: string | null
  state: string
  score: number
  correctCount?: number
  totalQuestions?: number
  cefr: string
  finishReason?: string | null
  sectionScores?: Record<string, number>
}

export interface AvailablePackageItem {
  id: string
  packageId?: string
  title: string
  subtitle?: string
  isPublic?: boolean
}

export interface PackageAssignmentItem {
  id?: string
  packageId: string
  packageTitle?: string
  userId: string
  assignedAt?: string
}

export interface UserAggregateItem {
  id: string
  name: string
  email: string
  role: 'admin' | 'user'
  joinedAt?: string
  lastActive?: string | null
  totalAttempts: number
  completedAttempts: number
  activeAttempts: number
  avgScore: number
  highestScore: number
  bestCefr: string
  strongestSection: string
  sectionAverages: Record<string, number>
  assignedPackages?: string[]
  attempts: UserAttemptItem[]
}

export interface UserManagementProps {
  mode: 'cloud' | 'demo'
  currentAuth: {
    userId: string | null
    displayName: string
    email?: string
    role: 'admin' | 'user'
    setRole?: (role: 'admin' | 'user') => void
  }
  cloudAttempts?: Array<{
    id: string
    userId: string
    examTitle: string
    state: string
    startedAt: string
    endsAt?: string
    completedAt?: string | null
    score?: number | null
    correctCount?: number | null
    totalQuestions?: number | null
    cefr?: string | null
    sectionScores?: Record<string, number> | null
    finishReason?: string | null
  }>
  demoHistory?: Array<{
    id: string
    examId?: string
    examTitle?: string
    startedAt?: string
    submittedAt?: string
    completedAt?: number | string
    score: number
    correctCount: number
    totalQuestions: number
    cefr: string
    sectionScores?: Record<string, number>
  }>
  onInspectAttempt?: (attemptId: string) => void
  availablePackages?: AvailablePackageItem[]
  packageAssignments?: PackageAssignmentItem[]
  onAssignPackages?: (targetUserIdOrEmail: string, packageIds: string[]) => Promise<void>
  onInviteParticipant?: (email: string, packageIds: string[]) => Promise<void>
}

function getCefrFromScore(score: number): string {
  if (score >= 80) return 'C1'
  if (score >= 60) return 'B2'
  if (score >= 40) return 'B1'
  return 'A2'
}

function formatDateTime(isoString?: string | null): string {
  if (!isoString) return '-'
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    return d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

export function UserManagement({
  mode,
  currentAuth,
  cloudAttempts = [],
  demoHistory = [],
  onInspectAttempt,
  availablePackages = [],
  packageAssignments = [],
  onAssignPackages,
  onInviteParticipant,
}: UserManagementProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all')
  const [activityFilter] = useState<'all' | 'has_attempts' | 'no_attempts'>('all')
  const [sortBy, setSortBy] = useState<'attempts' | 'score' | 'name' | 'last_active'>('attempts')
  const [selectedUser, setSelectedUser] = useState<UserAggregateItem | null>(null)
  const [showClerkModal, setShowClerkModal] = useState(false)
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const [customSimulatedUsers, setCustomSimulatedUsers] = useState<UserAggregateItem[]>([])

  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    role: 'user' as 'admin' | 'user',
    initialScore: 75,
  })

  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [selectedInvitePackageIds, setSelectedInvitePackageIds] = useState<string[]>([])
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false)

  const [selectedUserAssignedPackageIds, setSelectedUserAssignedPackageIds] = useState<string[]>([])
  const [isSavingAssignment, setIsSavingAssignment] = useState(false)

  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(text)
    triggerToast(`${label} berhasil disalin!`)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const aggregatedUsers = useMemo<UserAggregateItem[]>(() => {
    const userMap = new Map<string, UserAggregateItem>()

    const currentUserId = currentAuth.userId || 'current-active-user'
    userMap.set(currentUserId, {
      id: currentUserId,
      name: currentAuth.displayName || 'Peserta Aktif',
      email: currentAuth.email || 'peserta@hamza.test',
      role: currentAuth.role,
      joinedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      totalAttempts: 0,
      completedAttempts: 0,
      activeAttempts: 0,
      avgScore: 0,
      highestScore: 0,
      bestCefr: 'A2',
      strongestSection: '-',
      sectionAverages: {},
      attempts: [],
    })

    if (mode === 'cloud' && cloudAttempts.length > 0) {
      cloudAttempts.forEach((att) => {
        const uid = att.userId || 'unknown-user'
        let existing = userMap.get(uid)

        if (!existing) {
          existing = {
            id: uid,
            name: uid === currentAuth.userId ? currentAuth.displayName : `Peserta (${uid.slice(0, 8)})`,
            email: uid === currentAuth.userId && currentAuth.email ? currentAuth.email : `${uid.slice(0, 8)}@cloud.user`,
            role: uid === currentAuth.userId ? currentAuth.role : 'user',
            joinedAt: att.startedAt,
            lastActive: att.completedAt || att.startedAt,
            totalAttempts: 0,
            completedAttempts: 0,
            activeAttempts: 0,
            avgScore: 0,
            highestScore: 0,
            bestCefr: 'A2',
            strongestSection: '-',
            sectionAverages: {},
            attempts: [],
          }
          userMap.set(uid, existing)
        }

       existing.attempts.push({
         id: att.id,
         examTitle: att.examTitle,
         startedAt: att.startedAt,
         completedAt: att.completedAt,
         state: att.state,
         score: att.score || 0,
         correctCount: att.correctCount ?? undefined,
         totalQuestions: att.totalQuestions ?? undefined,
         cefr: att.cefr || getCefrFromScore(att.score || 0),
         finishReason: att.finishReason,
         sectionScores: att.sectionScores ?? undefined,
       })
      })
    }

    if (mode === 'demo') {
      const mockUsers: Array<{ id: string; name: string; email: string; role: 'admin' | 'user'; score: number; cefr: string }> = [
        { id: 'admin-001', name: 'Admin Utama', email: 'admin@hamza.test', role: 'admin', score: 88, cefr: 'C1' },
        { id: 'user-002', name: 'Siti Rahmawati', email: 'siti.rahma@example.com', role: 'user', score: 72, cefr: 'B2' },
        { id: 'user-003', name: 'Ahmad Fauzi', email: 'ahmad.fauzi@example.com', role: 'user', score: 65, cefr: 'B2' },
      ]

      mockUsers.forEach((u) => {
        if (!userMap.has(u.id)) {
          userMap.set(u.id, {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            joinedAt: '2026-07-01T10:00:00Z',
            lastActive: '2026-07-28T14:30:00Z',
            totalAttempts: 2,
            completedAttempts: 2,
            activeAttempts: 0,
            avgScore: u.score,
            highestScore: u.score,
            bestCefr: u.cefr,
            strongestSection: 'Membaca (Reading)',
            sectionAverages: { reading: u.score, listening: u.score - 5, grammar: u.score + 3 },
            attempts: [
              {
                id: `mock-att-${u.id}-1`,
                examTitle: 'Simulasi CBT Bahasa Arab (Demo)',
                startedAt: '2026-07-28T14:00:00Z',
                completedAt: '2026-07-28T14:30:00Z',
                state: 'completed',
                score: u.score,
                correctCount: Math.round((u.score / 100) * 75),
                totalQuestions: 75,
                cefr: u.cefr,
                finishReason: 'submitted',
                sectionScores: { listening: u.score - 5, reading: u.score, grammar: u.score + 3, dictation: u.score - 2 },
              },
            ],
          })
        }
      })

     const currentUserRecord = userMap.get(currentUserId)
     if (currentUserRecord && demoHistory.length > 0) {
       demoHistory.forEach((h) => {
         const compDate = h.submittedAt || (typeof h.completedAt === 'number' ? new Date(h.completedAt).toISOString() : h.completedAt) || new Date().toISOString()
         currentUserRecord.attempts.push({
           id: h.id,
           examTitle: h.examTitle || 'Simulasi Ujian Bahasa Arab',
           startedAt: h.startedAt || compDate,
           completedAt: compDate,
           state: 'completed',
           score: h.score,
            correctCount: h.correctCount,
            totalQuestions: h.totalQuestions,
            cefr: h.cefr,
            finishReason: 'submitted',
            sectionScores: h.sectionScores,
          })
        })
      }
    }

    customSimulatedUsers.forEach((u) => {
      if (!userMap.has(u.id)) {
        userMap.set(u.id, u)
      }
    })

    const list: UserAggregateItem[] = Array.from(userMap.values()).map((user) => {
      const attempts = user.attempts
      const total = attempts.length
      const completed = attempts.filter((a) => a.state === 'completed' || a.state === 'submitted' || a.score != null)
      const active = attempts.filter((a) => a.state === 'active')

      const scores = completed.map((a) => a.score)
      const avg = scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : user.avgScore
      const highest = scores.length > 0 ? Math.max(...scores) : user.highestScore
      const bestCefr = highest > 0 ? getCefrFromScore(highest) : user.bestCefr

      const sectionTotals: Record<string, { sum: number; count: number }> = {}
      completed.forEach((a) => {
        if (a.sectionScores) {
          Object.entries(a.sectionScores).forEach(([sec, val]) => {
            if (typeof val === 'number') {
              if (!sectionTotals[sec]) sectionTotals[sec] = { sum: 0, count: 0 }
              sectionTotals[sec].sum += val
              sectionTotals[sec].count += 1
            }
          })
        }
      })

      const sectionAverages: Record<string, number> = {}
      let bestSectionName = '-'
      let bestSectionVal = -1

      const sectionLabels: Record<string, string> = {
        listening: 'Listening',
        reading: 'Reading',
        grammar: 'Grammar',
        dictation: 'Dictation',
      }

      Object.entries(sectionTotals).forEach(([sec, data]) => {
        if (data.count > 0) {
          const avgSec = Math.round(data.sum / data.count)
          sectionAverages[sec] = avgSec
          if (avgSec > bestSectionVal) {
            bestSectionVal = avgSec
            bestSectionName = sectionLabels[sec] || sec
          }
        }
      })

      attempts.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      const lastActive = attempts.length > 0 ? (attempts[0].completedAt || attempts[0].startedAt) : user.lastActive

      const userAssigned = packageAssignments
        .filter((pa) => pa.userId.toLowerCase() === user.id.toLowerCase() || pa.userId.toLowerCase() === user.email.toLowerCase())
        .map((pa) => pa.packageTitle || availablePackages.find((p) => (p.packageId || p.id) === pa.packageId)?.title || pa.packageId)

      return {
        ...user,
        totalAttempts: total || user.totalAttempts,
        completedAttempts: completed.length || user.completedAttempts,
        activeAttempts: active.length,
        avgScore: avg,
        highestScore: highest,
        bestCefr,
        strongestSection: bestSectionName !== '-' ? bestSectionName : (user.strongestSection || '-'),
        sectionAverages: Object.keys(sectionAverages).length > 0 ? sectionAverages : user.sectionAverages,
        assignedPackages: userAssigned,
        lastActive,
        attempts,
      }
    })

    return list
  }, [currentAuth, cloudAttempts, demoHistory, customSimulatedUsers, mode, packageAssignments, availablePackages])

  const filteredUsers = useMemo(() => {
    return aggregatedUsers
      .filter((user) => {
        const matchSearch =
          user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.id.toLowerCase().includes(searchTerm.toLowerCase())
        if (!matchSearch) return false

        if (roleFilter !== 'all' && user.role !== roleFilter) return false
        if (activityFilter === 'has_attempts' && user.totalAttempts === 0) return false
        if (activityFilter === 'no_attempts' && user.totalAttempts > 0) return false

        return true
      })
      .sort((a, b) => {
        if (sortBy === 'attempts') return b.totalAttempts - a.totalAttempts
        if (sortBy === 'score') return b.avgScore - a.avgScore
        if (sortBy === 'name') return a.name.localeCompare(b.name)
        if (sortBy === 'last_active') {
          const timeA = a.lastActive ? new Date(a.lastActive).getTime() : 0
          const timeB = b.lastActive ? new Date(b.lastActive).getTime() : 0
          return timeB - timeA
        }
        return 0
      })
  }, [aggregatedUsers, searchTerm, roleFilter, activityFilter, sortBy])

  const globalStats = useMemo(() => {
    const totalUsers = aggregatedUsers.length
    const totalAdmins = aggregatedUsers.filter((u) => u.role === 'admin').length
    const totalStudents = totalUsers - totalAdmins
    const totalAttempts = aggregatedUsers.reduce((sum, u) => sum + u.totalAttempts, 0)
    const completedAttempts = aggregatedUsers.reduce((sum, u) => sum + u.completedAttempts, 0)
    const usersWithScores = aggregatedUsers.filter((u) => u.completedAttempts > 0)
    const avgGlobalScore =
      usersWithScores.length > 0
        ? Math.round(usersWithScores.reduce((sum, u) => sum + u.avgScore, 0) / usersWithScores.length)
        : 0

    return {
      totalUsers,
      totalAdmins,
      totalStudents,
      totalAttempts,
      completedAttempts,
      avgGlobalScore,
    }
  }, [aggregatedUsers])

  const handleOpenUserDetail = (user: UserAggregateItem) => {
    setSelectedUser(user)
    const initialPkgIds = packageAssignments
      .filter((pa) => pa.userId.toLowerCase() === user.id.toLowerCase() || pa.userId.toLowerCase() === user.email.toLowerCase())
      .map((pa) => pa.packageId)
    setSelectedUserAssignedPackageIds(initialPkgIds)
  }

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return

    setIsSubmittingInvite(true)
    try {
      if (onInviteParticipant && mode === 'cloud') {
        await onInviteParticipant(inviteEmail.trim(), selectedInvitePackageIds)
        triggerToast(`Undangan email berhasil dikirim ke ${inviteEmail.trim()}!`)
      } else {
        const newId = `sim-invite-${Date.now().toString(36)}`
        const newUserRecord: UserAggregateItem = {
          id: newId,
          name: inviteEmail.split('@')[0],
          email: inviteEmail.trim(),
          role: 'user',
          joinedAt: new Date().toISOString(),
          lastActive: new Date().toISOString(),
          totalAttempts: 0,
          completedAttempts: 0,
          activeAttempts: 0,
          avgScore: 0,
          highestScore: 0,
          bestCefr: 'A2',
          strongestSection: '-',
          sectionAverages: {},
          assignedPackages: availablePackages.filter((p) => selectedInvitePackageIds.includes(p.packageId || p.id)).map((p) => p.title),
          attempts: [],
        }
        setCustomSimulatedUsers((prev) => [newUserRecord, ...prev])
        triggerToast(`User ${inviteEmail.trim()} berhasil diundang (Mode Demo)!`)
      }
      setShowInviteModal(false)
      setInviteEmail('')
      setSelectedInvitePackageIds([])
    } catch (err: unknown) {
      triggerToast(`Gagal: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsSubmittingInvite(false)
    }
  }

  const handleSaveAssignments = async () => {
    if (!selectedUser) return
    setIsSavingAssignment(true)
    try {
      const target = selectedUser.email || selectedUser.id
      if (onAssignPackages && mode === 'cloud') {
        await onAssignPackages(target, selectedUserAssignedPackageIds)
        triggerToast('Penugasan paket berhasil diperbarui di cloud!')
      } else {
        triggerToast('Penugasan paket berhasil disimpan (Mode Demo)!')
      }
    } catch (err: unknown) {
      triggerToast(`Gagal: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsSavingAssignment(false)
    }
  }

  const handleCreateSimulatedUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUserForm.name.trim()) return

        const newId = `sim-invite-${Date.now().toString(36)}`
    const score = Number(newUserForm.initialScore) || 75
    const cefr = getCefrFromScore(score)

    const newUserRecord: UserAggregateItem = {
      id: newId,
      name: newUserForm.name.trim(),
      email: newUserForm.email.trim() || `${newId}@simulation.local`,
      role: newUserForm.role,
      joinedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      totalAttempts: 1,
      completedAttempts: 1,
      activeAttempts: 0,
      avgScore: score,
      highestScore: score,
      bestCefr: cefr,
      strongestSection: 'Membaca (Reading)',
      sectionAverages: { reading: score, listening: score - 4, grammar: score + 2 },
      attempts: [
        {
          id: `sim-att-${Date.now()}`,
          examTitle: 'Simulasi Ujian Bahasa Arab (User Tambahan)',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          state: 'completed',
          score,
          correctCount: Math.round((score / 100) * 75),
          totalQuestions: 75,
          cefr,
          finishReason: 'submitted',
          sectionScores: { listening: score - 4, reading: score, grammar: score + 2, dictation: score - 2 },
        },
      ],
    }

    setCustomSimulatedUsers((prev) => [newUserRecord, ...prev])
    setShowAddUserModal(false)
    setNewUserForm({ name: '', email: '', role: 'user', initialScore: 75 })
    triggerToast(`User "${newUserRecord.name}" berhasil ditambahkan ke daftar simulasi!`)
  }

  const handleExportCSV = () => {
    const headers = ['User ID', 'Nama', 'Email', 'Role', 'Total Sesi', 'Sesi Selesai', 'Rata-Rata Skor', 'Skor Tertinggi', 'CEFR Terbaik', 'Aktivitas Terakhir']
    const rows = aggregatedUsers.map((u) => [
      `"${u.id}"`,
      `"${u.name}"`,
      `"${u.email}"`,
      `"${u.role}"`,
      u.totalAttempts,
      u.completedAttempts,
      u.avgScore,
      u.highestScore,
      `"${u.bestCefr}"`,
      `"${u.lastActive ? new Date(u.lastActive).toLocaleString('id-ID') : '-'}"`,
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `user-management-report-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    triggerToast('Laporan user CSV berhasil diunduh!')
  }

  return (
    <section className="mt-6 rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.05)] border border-amber-100 sm:p-8">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl transition-all">
          <CheckCircle2 size={18} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 mb-1">
            <ShieldCheck size={14} /> Portal Admin &amp; Manajemen Pengguna
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Manajemen User &amp; Hak Akses</h2>
          <p className="mt-1 text-sm text-slate-600">
            Kelola daftar pengguna terdaftar, inspeksi riwayat attempt per user, dan atur peran (role) Admin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${
            mode === 'cloud' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
          }`}>
            <Sparkles size={13} /> {mode === 'cloud' ? 'Runtime Cloud (Supabase & Clerk)' : 'Runtime Demo Local'}
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-amber-50/70 p-5 border border-amber-200/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-950">Status Akun Terhubung:</span>
              <span className="font-bold text-slate-900 bg-white px-2.5 py-0.5 rounded-lg border border-amber-200 text-sm">
                {currentAuth.displayName}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-xs font-extrabold uppercase ${
                currentAuth.role === 'admin' ? 'bg-amber-800 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {currentAuth.role}
              </span>
            </div>
            <p className="mt-1 text-xs text-amber-900">
              User ID: <code className="bg-amber-100 px-1.5 py-0.5 rounded text-amber-950 font-mono">{currentAuth.userId || 'demo-user'}</code> | Status RLS: <strong className="font-semibold text-emerald-800">Aktif &amp; Diverifikasi</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {currentAuth.setRole && (
              <button
                type="button"
                onClick={() => {
                  const nextRole = currentAuth.role === 'admin' ? 'user' : 'admin'
                  currentAuth.setRole!(nextRole)
                  triggerToast(`Role berhasil diganti ke: ${nextRole.toUpperCase()}`)
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-800 px-3.5 py-2 text-xs font-bold text-white transition-transform active:scale-[0.96] shadow-sm hover:bg-amber-900"
              >
                <User size={14} /> Tukar Role (Simulasi UI)
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowClerkModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100/50"
            >
              <Info size={14} /> Petunjuk Role Clerk Cloud
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total User</span>
            <Users size={18} className="text-amber-700" />
          </div>
          <p className="text-2xl font-black text-slate-900 tabular-nums">{globalStats.totalUsers}</p>
          <p className="mt-1 text-xs text-slate-500">
            <strong className="text-amber-800">{globalStats.totalAdmins} Admin</strong> · {globalStats.totalStudents} Peserta
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total Sesi Ujian</span>
            <BarChart3 size={18} className="text-[#006C35]" />
          </div>
          <p className="text-2xl font-black text-slate-900 tabular-nums">{globalStats.totalAttempts}</p>
          <p className="mt-1 text-xs text-slate-500">
            <strong className="text-[#006C35]">{globalStats.completedAttempts} Selesai</strong> dikerjakan
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Rata-Rata Skor</span>
            <Award size={18} className="text-emerald-700" />
          </div>
          <p className="text-2xl font-black text-[#006C35] tabular-nums">{globalStats.avgGlobalScore}</p>
          <p className="mt-1 text-xs text-slate-500">
            Perkiraan CEFR Global: <strong className="text-slate-800">{getCefrFromScore(globalStats.avgGlobalScore)}</strong>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Status Proteksi</span>
            <ShieldCheck size={18} className="text-amber-700" />
          </div>
          <p className="text-base font-bold text-slate-900">RLS &amp; Clerk</p>
          <p className="mt-1 text-xs text-slate-500">
            Kunci jawaban terisolasi di schema <code className="bg-slate-200 px-1 py-0.5 rounded">private</code>
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari berdasarkan nama, email, atau User ID..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-9 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#006C35] focus:bg-white focus:outline-none"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setRoleFilter('all')}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                roleFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua Role
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('admin')}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                roleFilter === 'admin' ? 'bg-amber-800 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('user')}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                roleFilter === 'user' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Peserta
            </button>
          </div>

         <div className="relative">
           <select
             value={sortBy}
             onChange={(e) => setSortBy(e.target.value as 'attempts' | 'score' | 'name' | 'last_active')}
             className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:border-[#006C35] focus:outline-none"
           >
             <option value="attempts">Urutkan: Sesi Terbanyak</option>
             <option value="score">Urutkan: Skor Rata-rata</option>
             <option value="last_active">Urutkan: Terakhir Aktif</option>
             <option value="name">Urutkan: Nama (A-Z)</option>
           </select>
         </div>

          <button
            type="button"
            onClick={() => setShowAddUserModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#006C35] px-3.5 py-2 text-xs font-bold text-white transition-transform active:scale-[0.96] hover:bg-[#005228]"
          >
            <UserPlus size={14} /> Tambah User Simulasi
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
            title="Ekspor CSV"
          >
            <Download size={14} /> Ekspor
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
              <th className="py-3.5 px-4">Pengguna</th>
              <th className="py-3.5 px-4">Role</th>
              <th className="py-3.5 px-4 text-center">Sesi Ujian</th>
              <th className="py-3.5 px-4 text-center">Rata-Rata Skor</th>
              <th className="py-3.5 px-4 text-center">CEFR Terbaik</th>
              <th className="py-3.5 px-4 text-center">Seksi Terkuat</th>
              <th className="py-3.5 px-4 text-right">Aktivitas Terakhir</th>
              <th className="py-3.5 px-4 text-right">Aksi Admin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  <p className="font-semibold text-slate-700">Tidak ada pengguna yang cocok dengan kriteria pencarian.</p>
                  <p className="mt-1 text-xs text-slate-400">Coba ubah kata kunci pencarian atau reset filter role.</p>
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const isCurrent = user.id === (currentAuth.userId || 'current-active-user')
                return (
                  <tr key={user.id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`flex size-9 shrink-0 items-center justify-center rounded-full font-bold text-sm ${
                          user.role === 'admin' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-[#E6F0EB] text-[#006C35]'
                        }`}>
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-bold text-slate-900 truncate">{user.name}</p>
                            {isCurrent && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                                Akun Anda
                              </span>
                            )}
                            {user.assignedPackages && user.assignedPackages.length > 0 && (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-900 border border-amber-300">
                                <Lock size={10} /> {user.assignedPackages.length} Paket Khusus
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold ${
                        user.role === 'admin'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {user.role === 'admin' && <ShieldCheck size={12} />}
                        {user.role === 'admin' ? 'Admin' : 'Peserta'}
                      </span>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span className="font-bold text-slate-900 tabular-nums">{user.totalAttempts} Sesi</span>
                      {user.completedAttempts > 0 && (
                        <p className="text-[11px] text-slate-500">{user.completedAttempts} Selesai</p>
                      )}
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span className={`inline-block rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums ${
                        user.avgScore >= 80 ? 'bg-emerald-100 text-emerald-900' :
                        user.avgScore >= 60 ? 'bg-amber-100 text-amber-900' :
                        user.avgScore > 0 ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-400'
                      }`}>
                        {user.completedAttempts > 0 ? `${user.avgScore}` : '-'}
                      </span>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-800">
                        {user.bestCefr}
                      </span>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span className="text-xs text-slate-700 font-medium">{user.strongestSection}</span>
                    </td>

                    <td className="py-4 px-4 text-right text-xs text-slate-500 tabular-nums">
                      {formatDateTime(user.lastActive)}
                    </td>

                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenUserDetail(user)}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-800 px-2.5 py-1.5 text-xs font-bold text-white transition-transform active:scale-[0.96] hover:bg-amber-900"
                        >
                          <BookOpenCheck size={13} /> Detail &amp; Sesi
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopy(user.id, 'User ID')}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title="Salin User ID"
                        >
                          {copiedId === user.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl max-h-[90dvh] overflow-y-auto sm:p-8">
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
              <div className={`flex size-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold ${
                selectedUser.role === 'admin' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-[#E6F0EB] text-[#006C35]'
              }`}>
                {selectedUser.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-slate-900">{selectedUser.name}</h3>
                  <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-xs font-extrabold uppercase ${
                    selectedUser.role === 'admin' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {selectedUser.role}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{selectedUser.email} · ID: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">{selectedUser.id}</code></p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-[11px] font-bold uppercase text-slate-400">Total Sesi</span>
                <p className="text-xl font-black text-slate-900 tabular-nums">{selectedUser.totalAttempts}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-[11px] font-bold uppercase text-slate-400">Rata-Rata Skor</span>
                <p className="text-xl font-black text-[#006C35] tabular-nums">{selectedUser.avgScore}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-[11px] font-bold uppercase text-slate-400">Skor Tertinggi</span>
                <p className="text-xl font-black text-amber-800 tabular-nums">{selectedUser.highestScore}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-[11px] font-bold uppercase text-slate-400">CEFR Terbaik</span>
                <p className="text-xl font-black text-slate-800">{selectedUser.bestCefr}</p>
              </div>
            </div>

            {Object.keys(selectedUser.sectionAverages).length > 0 && (
              <div className="mt-6 rounded-2xl border border-slate-200 p-4 bg-slate-50/50">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">Estimasi Kemampuan Per Seksi</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(selectedUser.sectionAverages).map(([sec, val]) => (
                    <div key={sec} className="rounded-xl bg-white p-3 border border-slate-200">
                      <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                        <span className="capitalize">{sec}</span>
                        <span className="tabular-nums text-[#006C35]">{val}/100</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-[#006C35] rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, val))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-amber-800" /> Penugasan Paket Soal Ujian (Package Assignment)
                  </h4>
                  <p className="text-[11px] text-slate-600">Tentukan paket soal khusus/private yang diizinkan untuk dikerjakan user ini.</p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveAssignments}
                  disabled={isSavingAssignment}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-900 disabled:opacity-50 self-start sm:self-auto"
                >
                  <Check size={13} /> {isSavingAssignment ? 'Menyimpan...' : 'Simpan Hak Akses'}
                </button>
              </div>

              {availablePackages.length === 0 ? (
                <p className="text-xs text-slate-500 rounded-xl bg-white p-3 border border-amber-200">Belum ada paket soal terbit di sistem.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availablePackages.map((pkg) => {
                    const pkgId = pkg.packageId || pkg.id
                    const isAssigned = selectedUserAssignedPackageIds.includes(pkgId)
                    return (
                      <label key={pkgId} className="flex items-center gap-2.5 rounded-xl bg-white p-3 border border-slate-200 cursor-pointer hover:border-amber-300">
                        <input
                          type="checkbox"
                          checked={isAssigned}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUserAssignedPackageIds((prev) => [...prev, pkgId])
                            } else {
                              setSelectedUserAssignedPackageIds((prev) => prev.filter((id) => id !== pkgId))
                            }
                          }}
                          className="size-4 rounded text-amber-800 focus:ring-amber-700"
                        />
                        <div className="flex-1 text-xs">
                          <span className="font-bold text-slate-900 block">{pkg.title}</span>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mt-0.5 ${pkg.isPublic !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                            {pkg.isPublic !== false ? 'Publik' : 'Khusus (Private)'}
                          </span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="mt-6">
              <h4 className="text-sm font-bold text-slate-900 mb-3">Daftar Sesi Ujian User Ini ({selectedUser.attempts.length})</h4>
              {selectedUser.attempts.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">
                  User ini belum menyelesaikan atau memiliki sesi ujian.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 font-bold uppercase text-slate-500">
                        <th className="py-2.5 px-3">Judul Ujian</th>
                        <th className="py-2.5 px-3">Tanggal Mulai</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-center">Skor</th>
                        <th className="py-2.5 px-3 text-center">CEFR</th>
                        <th className="py-2.5 px-3 text-right">Inspeksi Jawaban</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {selectedUser.attempts.map((att) => (
                        <tr key={att.id} className="hover:bg-slate-50">
                          <td className="py-3 px-3 font-bold text-slate-900">{att.examTitle}</td>
                          <td className="py-3 px-3 text-slate-500 tabular-nums">{formatDateTime(att.startedAt)}</td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-block rounded px-2 py-0.5 font-bold uppercase text-[10px] ${
                              att.state === 'completed' || att.state === 'submitted'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-amber-100 text-amber-900'
                            }`}>
                              {att.state}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-bold tabular-nums text-[#006C35]">{att.score}</td>
                          <td className="py-3 px-3 text-center font-bold text-slate-800">{att.cefr}</td>
                          <td className="py-3 px-3 text-right">
                            {onInspectAttempt && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedUser(null)
                                  onInspectAttempt(att.id)
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-amber-800 px-2.5 py-1 text-xs font-bold text-white transition-transform active:scale-[0.96] hover:bg-amber-900"
                              >
                                <BookOpenCheck size={13} /> Inspeksi
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                Tutup Detail
              </button>
            </div>
          </div>
        </div>
      )}

      
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <button
              type="button"
              onClick={() => setShowInviteModal(false)}
              className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>

            <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 mb-2">
              <Mail size={14} /> Undang Peserta &amp; Assign Paket
            </div>
            <h3 className="text-xl font-bold text-slate-900">Undang Peserta via Email</h3>
            <p className="mt-1 text-xs text-slate-600">
              Kirimkan undangan pendaftaran via Clerk dan tentukan paket soal khusus yang dapat diakses oleh peserta.
            </p>

            <form onSubmit={handleInviteSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Email Peserta</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="misal: peserta@example.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold text-slate-900 focus:border-amber-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Tugaskan Paket Soal</label>
                {availablePackages.length === 0 ? (
                  <p className="text-xs text-slate-500 rounded-xl bg-slate-50 p-3 border border-slate-200">
                    Belum ada paket soal terbit.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                    {availablePackages.map((pkg) => {
                      const pkgId = pkg.packageId || pkg.id
                      const isSelected = selectedInvitePackageIds.includes(pkgId)
                      return (
                        <label
                          key={pkgId}
                          className="flex items-start gap-2.5 rounded-lg bg-white p-2.5 border border-slate-200 cursor-pointer hover:bg-amber-50/40 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedInvitePackageIds((prev) => [...prev, pkgId])
                              } else {
                                setSelectedInvitePackageIds((prev) => prev.filter((id) => id !== pkgId))
                              }
                            }}
                            className="mt-0.5 size-4 rounded text-amber-800 focus:ring-amber-700"
                          />
                          <div className="flex-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">{pkg.title}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pkg.isPublic !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                                {pkg.isPublic !== false ? 'Publik' : 'Khusus (Private)'}
                              </span>
                            </div>
                            {pkg.subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{pkg.subtitle}</p>}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingInvite}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-800 px-4 py-2 text-xs font-bold text-white hover:bg-amber-900 disabled:opacity-50"
                >
                  <Send size={13} /> {isSubmittingInvite ? 'Mengirim...' : 'Kirim Undangan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowAddUserModal(false)}
              className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>

            <h3 className="text-lg font-bold text-slate-900">Tambah User Simulasi</h3>
            <p className="mt-1 text-xs text-slate-500">
              Tambahkan data pengguna simulasi untuk menguji antarmuka dan laporan admin.
            </p>

            <form onSubmit={handleCreateSimulatedUser} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                  placeholder="Misal: Muhammad Rizky"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold text-slate-900 focus:border-[#006C35] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Email Pengguna</label>
                <input
                  type="email"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  placeholder="Misal: rizky@example.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 focus:border-[#006C35] focus:outline-none"
                />
              </div>

             <div>
               <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Peran / Role</label>
               <select
                 value={newUserForm.role}
                 onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value as 'admin' | 'user' })}
                 className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold text-slate-900 focus:border-[#006C35] focus:outline-none"
               >
                  <option value="user">Peserta (User Standar)</option>
                  <option value="admin">Admin Portal</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Skor Ujian Awal Simulasi (0-100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={newUserForm.initialScore}
                  onChange={(e) => setNewUserForm({ ...newUserForm, initialScore: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-bold text-slate-900 focus:border-[#006C35] focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#006C35] px-4 py-2 text-xs font-bold text-white hover:bg-[#005228]"
                >Simpan User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showClerkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <button
              type="button"
              onClick={() => setShowClerkModal(false)}
              className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={20} />
            </button>

            <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 mb-2">
              <ShieldCheck size={14} /> Konfigurasi Akses Admin Cloud
            </div>
            <h3 className="text-xl font-bold text-slate-900">Panduan Assign Role Admin di Clerk &amp; Supabase</h3>
            <p className="mt-1 text-xs text-slate-600">
              Hak akses Admin di mode cloud dikendalikan secara aman lewat <code className="bg-slate-100 px-1 py-0.5 rounded text-amber-950">publicMetadata</code> di Clerk Dashboard, yang dibaca oleh fungsi RPC Supabase <code className="bg-slate-100 px-1 py-0.5 rounded text-amber-950">public.is_admin()</code>.
            </p>

            <div className="mt-4 space-y-3 text-xs text-slate-700">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-bold text-slate-900">Langkah 1: Buka Dashboard Clerk</p>
                <p className="mt-0.5 text-slate-600">Masuk ke Dashboard Clerk aplikasi Anda &gt; menu <strong>Users</strong> &gt; pilih akun pengguna.</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-bold text-slate-900">Langkah 2: Edit Metadata Pengguna</p>
                <p className="mt-0.5 text-slate-600">Scroll ke bagian <strong>Public Metadata</strong>, lalu tambahkan JSON berikut:</p>
                <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-900 p-2.5 text-emerald-400 font-mono text-xs">
                  <span>{`{ "role": "admin" }`}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('{ "role": "admin" }', 'JSON Metadata')}
                    className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-white hover:bg-slate-700"
                  >
                    <Copy size={12} /> Salin
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-bold text-slate-900">Langkah 3: Sinkronisasi Otomatis Supabase RLS</p>
                <p className="mt-0.5 text-slate-600">
                  Saat pengguna me-refresh halaman, JWT Clerk akan membawa claim <code className="bg-slate-200 px-1 rounded font-mono">public_metadata.role = "admin"</code>. RPC Supabase secara otomatis memberikan hak akses admin untuk inspeksi history semua user dan input bank soal.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowClerkModal(false)}
                className="rounded-xl bg-amber-800 px-4 py-2 text-xs font-bold text-white hover:bg-amber-900"
              >
                Paham &amp; Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
