import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download, ExternalLink } from 'lucide-react'
import { Card, ErrorBox, EvidenceLink, Loading, PageHeader, Pill, btnPrimary, useApi } from '../components/ui'

const COLOR: Record<string, string> = { 접수시작: 'bg-brand-500', 접수마감: 'bg-rose-500', 필기: 'bg-violet-500', 면접: 'bg-amber-500', 발표: 'bg-emerald-500' }

export default function Calendar() {
  const { data, error, loading } = useApi<any[]>('/calendar/events')
  const [ym, setYm] = useState<[number, number]>([2026, 2])
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const [y, m] = ym
  const first = new Date(y, m, 1)
  const days = new Date(y, m + 1, 0).getDate()
  const cells = Array.from({ length: first.getDay() + days }, (_, i) => (i < first.getDay() ? null : i - first.getDay() + 1))
  const iso = (d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const onDay = (d: number) => (data || []).filter((e) => e.date <= iso(d) && (e.end || e.date) >= iso(d))
  const move = (k: number) => { const nm = m + k; setYm([y + Math.floor(nm / 12), ((nm % 12) + 12) % 12]) }
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = (data || []).filter((e) => e.date >= today)

  return (
    <div>
      <PageHeader title="채용 캘린더" desc="공식 공고에 명시된 확정 일정만 표시합니다. 추정 일정은 등록하지 않습니다."
        action={<a className={btnPrimary} href="/api/calendar/export"><Download size={15} />ICS 다운로드 (Google·Outlook 가져오기)</a>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card title={`${y}년 ${m + 1}월`} action={<div className="flex gap-1"><button className="rounded-lg p-1 hover:bg-slate-100" onClick={() => move(-1)}><ChevronLeft size={18} /></button><button className="rounded-lg p-1 hover:bg-slate-100" onClick={() => move(1)}><ChevronRight size={18} /></button></div>}>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">{'일월화수목금토'.split('').map((d) => <div key={d} className="py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => (
              <div key={i} className={`min-h-20 rounded-lg border p-1 text-left text-xs ${d ? 'border-slate-100' : 'border-transparent'} ${d && iso(d) === today ? 'bg-brand-50' : ''}`}>
                {d && <><div className="text-slate-500">{d}</div>{onDay(d).map((e, j) => <div key={j} className={`mt-0.5 truncate rounded px-1 text-[10px] text-white ${COLOR[e.type] || 'bg-slate-500'}`} title={e.title}>{e.title.replace('한국철도공사 ', '')}</div>)}</>}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">{Object.entries(COLOR).map(([k, c]) => <span key={k} className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded ${c}`} />{k}</span>)}</div>
        </Card>
        <div className="space-y-6">
          <Card title="다가오는 일정">
            {upcoming.length ? upcoming.map((e, i) => <div key={i} className="text-sm">{e.date} {e.title}</div>) : <div className="text-sm text-slate-500">관심 기업의 확정된 향후 채용 일정이 없습니다. (최근 공식 공고는 모두 마감)</div>}
          </Card>
          <Card title="전체 공식 일정">
            <div className="space-y-3">
              {(data || []).map((e, i) => (
                <div key={i} className="border-b border-slate-100 pb-2 text-sm">
                  <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${COLOR[e.type] || 'bg-slate-500'}`} /><span className="font-medium">{e.date}{e.end ? ` ~ ${e.end}` : ''}</span>{e.date < today && <Pill>지난 일정</Pill>}</div>
                  <div className="text-slate-600">{e.title}</div>
                  <div className="mt-1 flex gap-3"><EvidenceLink rid={e.recruitment_id} ev={e.evidence} /><a href={e.official_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">공식 공고 <ExternalLink size={11} /></a></div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
