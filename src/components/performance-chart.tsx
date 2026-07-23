import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface PerformanceChartProps {
  data: Array<{ name: string; description: string; score: number }>
}

export default function PerformanceChart({ data }: PerformanceChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 20, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 3" />
        <ReferenceLine y={60} stroke="#C5A059" strokeDasharray="5 5" label={{ value: 'Target 60', position: 'insideTopRight', fill: '#8A5A12', fontSize: 11 }} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} />
        <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickLine={false} axisLine={false} tick={{ fill: '#94A3B8', fontSize: 11 }} />
        <Tooltip
          cursor={{ fill: '#F8FAFC' }}
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null
            const item = payload[0].payload as (typeof data)[number]
            return <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"><p className="font-bold text-slate-900">{item.name}</p><p className="mt-0.5 text-slate-500">{item.description}</p><p className="mt-1 font-bold text-[#006C35]">{item.score}% · {item.score >= 60 ? 'Mencapai target' : 'Perlu latihan lagi'}</p></div>
          }}
        />
        <Bar dataKey="score" fill="#006C35" radius={[8, 8, 2, 2]} maxBarSize={48}>
          <LabelList dataKey="score" position="top" formatter={(value) => `${value}%`} fill="#0F172A" fontSize={11} fontWeight={700} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
