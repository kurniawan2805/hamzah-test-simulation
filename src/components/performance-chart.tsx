import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface PerformanceChartProps {
  data: Array<{ name: string; score: number }>
}

export default function PerformanceChart({ data }: PerformanceChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#E2E8F0" />
        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#475569', fontSize: 12 }} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} />
        <Tooltip cursor={{ fill: '#F8FAFC' }} formatter={(value) => [`${value ?? 0}%`, 'Skor']} />
        <Bar dataKey="score" fill="#006C35" radius={[8, 8, 2, 2]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  )
}
