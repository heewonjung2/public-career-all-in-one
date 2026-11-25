import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { today } from './ui'

export const EVENT_TONE: Record<string, string> = { 접수시작: 'bg-accent', 접수마감: 'bg-rose-ink', 필기: 'bg-butter-ink', 면접: 'bg-sage-ink', 발표: 'bg-[#b0aca3]' }

export default function MiniCalendar({ events, initial }: { events: any[]; initial?: [number, number] }) {
  const now = new Date()
  const [ym, setYm] = useState<[number, number]>(initial || [now.getFullYear(), now.getMonth()])
  const [y, m] = ym
  const first = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const cells = Array.from({ length: first + days }, (_, i) => (i < first ? null : i - first + 1))
  const iso = (d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const on = (d: number) => events.filter((e) => e.date <= iso(d) && (e.end || e.date) >= iso(d))
  const move = (k: number) => { const n = m + k; setYm([y + Math.floor(n / 12), ((n % 12) + 12) % 12]) }
  const t = today()
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => move(-1)} className="rounded-full p-1 text-sub hover:bg-white"><ChevronLeft size={16} /></button>
        <span className="text-[14.5px]">{y}년 {m + 1}월</span>
        <button onClick={() => move(1)} className="rounded-full p-1 text-sub hover:bg-white"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11.5px] text-[#b0aca3]">{'일월화수목금토'.split('').map((d) => <div key={d} className="pb-2">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[13px]">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const ev = on(d)
          const isToday = iso(d) === t
          return (
            <div key={i} className="flex flex-col items-center py-0.5" title={ev.map((e) => e.title).join('\n')}>
              <span className={`flex h-7 w-7 items-center justify-center rounded-full ${isToday ? 'bg-accent text-white' : ev.length ? 'bg-lav' : ''}`}>{d}</span>
              <span className="mt-0.5 flex h-1 gap-0.5">{ev.slice(0, 3).map((e, j) => <span key={j} className={`h-1 w-1 rounded-full ${EVENT_TONE[e.type] || 'bg-sub'}`} />)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
