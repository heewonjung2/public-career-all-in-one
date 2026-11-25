import { useState } from 'react'
import { CheckCircle2, Circle, Wand2 } from 'lucide-react'
import { api, MAIN_RID } from '../api'
import { AiBadge, Card, Empty, ErrorBox, Loading, PageHeader, Pill, btnPrimary, useApi } from '../components/ui'

export default function Roadmap() {
  const rm = useApi<any>('/roadmaps')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const create = async () => {
    setBusy(true)
    try { rm.setData(await api('/roadmaps', { method: 'POST', json: { recruitment_id: MAIN_RID, weeks: 8 } })) } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const toggle = async (t: any) => rm.setData(await api(`/tasks/${t.id}`, { method: 'PATCH', json: { done: !t.done } }))

  if (rm.loading) return <Loading />
  const d = rm.data
  return (
    <div>
      <PageHeader title="취업 로드맵" desc="공식 필기 출제범위(코레일 2026 상반기 IT)와 내 준비 상태를 결합한 8주 학습 계획입니다."
        action={<button className={btnPrimary} onClick={create} disabled={busy}><Wand2 size={15} />{d ? '로드맵 다시 생성' : '맞춤 로드맵 생성'}</button>} />
      {err && <ErrorBox error={err} />}
      {rm.error && <ErrorBox error={rm.error} />}
      {!d && <Empty>아직 생성된 로드맵이 없습니다. 내 스펙을 저장한 뒤 ‘맞춤 로드맵 생성’을 눌러 주세요.</Empty>}
      {d && (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><AiBadge /><Pill tone="blue">{d.label}</Pill><span className="text-xs text-slate-500">생성 {d.created_at}</span></div>
              <div className="w-64"><div className="mb-1 flex justify-between text-xs text-slate-500"><span>진척도(완료 과제 수)</span><span>{d.progress.done}/{d.progress.total} · {d.progress.percent}%</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500 transition-all" style={{ width: `${d.progress.percent}%` }} /></div></div>
            </div>
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">가장 취약한 NCS</div><div className="font-semibold text-navy">{d.summary.weakest_ncs.join(', ') || '-'}</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">우선 보완할 전공(출제범위 내)</div><div className="font-semibold text-navy">{d.summary.weakest_major.join(', ')}</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">하루 학습 가능 시간</div><div className="font-semibold text-navy">{d.summary.daily_hours ?? '-'}시간</div></div>
            </div>
            {d.summary.not_in_scope_note?.length > 0 && <div className="mt-3 text-xs text-violet-700">출제범위 밖 과목(우선순위 낮춤): {d.summary.not_in_scope_note.join(', ')}</div>}
            <div className="mt-2 text-xs text-slate-500">근거: {d.summary.basis}</div>
          </Card>
          <div className="relative mt-6 space-y-4 border-l-2 border-brand-100 pl-6">
            {d.weeks.map((w: any) => {
              const tasks = d.tasks.filter((t: any) => t.week === w.week)
              const done = tasks.filter((t: any) => t.done).length
              return (
                <div key={w.week} className="relative">
                  <div className={`absolute -left-[33px] top-4 h-4 w-4 rounded-full border-2 ${done === tasks.length && tasks.length ? 'border-emerald-500 bg-emerald-500' : 'border-brand-500 bg-white'}`} />
                  <Card title={<><span className="text-brand-600">{w.week}주차</span> {w.title}</>} action={<span className="text-xs text-slate-500">{done}/{tasks.length}</span>}>
                    <ul className="space-y-2">
                      {tasks.map((t: any) => (
                        <li key={t.id}><button onClick={() => toggle(t)} className="flex w-full items-start gap-2 text-left text-sm">
                          {t.done ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" /> : <Circle size={18} className="mt-0.5 shrink-0 text-slate-300" />}
                          <span className={t.done ? 'text-slate-400 line-through' : ''}>{t.title}</span><span className="ml-auto shrink-0"><Pill>{t.category}</Pill></span>
                        </button></li>
                      ))}
                    </ul>
                  </Card>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
