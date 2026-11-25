import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { ErrorBox, EvidenceToggle, Loading, Section, btnSoft, today, useApi } from '../components/ui'
import { EVENT_TONE } from '../components/MiniCalendar'

export default function Calendar() {
  const { data, error, loading } = useApi<any[]>('/calendar/events')
  const [ym, setYm] = useState<[number, number]>([2026, 2])
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const [y, m] = ym
  const first = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => (i < first || i >= first + days ? null : i - first + 1))
  const iso = (d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const on = (d: number) => (data || []).filter((e) => e.date <= iso(d) && (e.end || e.date) >= iso(d))
  const move = (k: number) => { const n = m + k; setYm([y + Math.floor(n / 12), ((n % 12) + 12) % 12]) }
  const t = today()
  const month = (data || []).filter((e) => e.date.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`))

  return (
    <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => move(-1)} className="rounded-full p-1.5 text-sub hover:bg-white"><ChevronLeft size={18} /></button>
            <h1 className="text-[28px] font-semibold">{y}년 {m + 1}월</h1>
            <button onClick={() => move(1)} className="rounded-full p-1.5 text-sub hover:bg-white"><ChevronRight size={18} /></button>
          </div>
          <a className={btnSoft} href="/api/calendar/export"><Download size={14} />ICS 내보내기</a>
        </div>
        <div className="grid grid-cols-7 text-[12.5px] text-sub">{'일월화수목금토'.split('').map((d) => <div key={d} className="pb-3">{d}</div>)}</div>
        <div className="grid grid-cols-7 border-t border-line">
          {cells.map((d, i) => (
            <div key={i} className="min-h-[104px] border-b border-line py-2 pr-2">
              {d && <>
                <div className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-[13.5px] ${iso(d) === t ? 'bg-accent text-white' : 'text-sub'}`}>{d}</div>
                {on(d).map((e, j) => (
                  <div key={j} className="mb-1 flex items-center gap-1.5 truncate text-[12px]" title={e.title}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${EVENT_TONE[e.type] || 'bg-sub'}`} />{e.title.replace('한국철도공사 ', '')}
                  </div>
                ))}
              </>}
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] text-sub">공식 공고에 명시된 확정 일정만 표시해요. 추정 일정은 등록하지 않아요.</p>
      </div>
      <aside className="space-y-10">
        <Section title="이 달의 공식 일정">
          {month.length === 0 && <p className="text-[13.5px] text-sub">이 달에는 확정된 채용 일정이 없어요.</p>}
          <div className="space-y-5">
            {month.map((e, i) => (
              <div key={i} className="text-[14px]">
                <div className="flex items-center gap-2 text-[12.5px] text-sub"><span className={`h-1.5 w-1.5 rounded-full ${EVENT_TONE[e.type] || 'bg-sub'}`} />{e.date}{e.end ? ` ~ ${e.end}` : ''}{e.date < t && ' · 지난 일정'}</div>
                <div className="mt-0.5">{e.title}</div>
                <EvidenceToggle rid={e.recruitment_id} ev={e.evidence} />
              </div>
            ))}
          </div>
        </Section>
        <div className="space-y-1.5 text-[12.5px] text-sub">
          {Object.entries({ 접수시작: '접수 시작', 접수마감: '접수 마감', 필기: '필기시험', 면접: '면접', 발표: '발표' }).map(([k, v]) => <div key={k} className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${EVENT_TONE[k]}`} />{v}</div>)}
        </div>
      </aside>
    </div>
  )
}
