import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { api, MAIN_RID } from '../api'
import { Bar, Empty, ErrorBox, EvidenceToggle, Loading, Note, Section, Sheet, Status, Tabs, btnPrimary, btnSoft, useApi } from '../components/ui'

export default function Roadmap() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'plan'
  return (
    <div>
      <Tabs tabs={[{ key: 'plan', label: '학습 로드맵' }, { key: 'strategy', label: '통합 취업 전략' }]} value={tab} onChange={(k) => setSp({ tab: k })} />
      {tab === 'plan' ? <Plan /> : <Strategy />}
    </div>
  )
}

function Plan() {
  const rm = useApi<any>('/roadmaps')
  const [busy, setBusy] = useState(false)
  const create = async () => { setBusy(true); try { rm.setData(await api('/roadmaps', { method: 'POST', json: { recruitment_id: MAIN_RID, weeks: 8 } })) } finally { setBusy(false) } }
  const toggle = async (t: any) => rm.setData(await api(`/tasks/${t.id}`, { method: 'PATCH', json: { done: !t.done } }))
  if (rm.loading) return <Loading />
  if (rm.error) return <ErrorBox error={rm.error} />
  const d = rm.data
  if (!d) return <Empty>아직 로드맵이 없어요. <button className="text-accent-ink" onClick={create}>8주 로드맵 만들기</button></Empty>
  return (
    <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-8">
        <div>
          <div className="text-[13px] text-sub">전체 진척</div>
          <div className="mt-1 text-[40px] font-semibold leading-none">{d.progress.percent}<span className="text-[16px] font-normal text-sub">%</span></div>
          <div className="mt-4"><Bar value={d.progress.percent} /></div>
          <div className="mt-2 text-[12.5px] text-sub">완료 과제 {d.progress.done} / {d.progress.total}</div>
        </div>
        <div className="space-y-1 text-[13.5px] text-sub">
          <div>{d.label}</div>
          <div>{d.summary.basis}</div>
          {d.summary.not_in_scope_note?.length > 0 && <div>출제범위 밖(우선순위 낮춤): {d.summary.not_in_scope_note.join(', ')}</div>}
        </div>
        <button className={btnSoft} onClick={create} disabled={busy}>규칙 기반으로 다시 만들기</button>
      </aside>
      <div className="space-y-12">
        {d.weeks.map((w: any) => {
          const tasks = d.tasks.filter((t: any) => t.week === w.week)
          const done = tasks.filter((t: any) => t.done).length
          return (
            <section key={w.week} className="grid gap-4 sm:grid-cols-[70px_1fr]">
              <div className="text-[13px] text-sub">{w.week}주차<div className="text-[12px] text-[#b0aca3]">{done}/{tasks.length}</div></div>
              <div>
                <div className="mb-3 text-[16px]">{w.title}</div>
                <ul className="space-y-2.5">
                  {tasks.map((t: any) => (
                    <li key={t.id}><button onClick={() => toggle(t)} className="flex w-full items-start gap-3 text-left text-[14px]">
                      <span className={`mt-1 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-md border ${t.done ? 'border-accent bg-accent text-white' : 'border-[#d6d2c9] bg-white'}`}>{t.done && <Check size={12} strokeWidth={3} />}</span>
                      <span className={`flex-1 ${t.done ? 'text-sub line-through' : ''}`}>{t.title}</span>
                      <span className="shrink-0 text-[12px] text-[#b0aca3]">{t.category}</span>
                    </button></li>
                  ))}
                </ul>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

const STRATS = [
  { key: 'balanced', label: '균형형' }, { key: 'top_priority', label: '1순위 집중' }, { key: 'bonus', label: '가점 확보' },
  { key: 'exam', label: '필기 집중' }, { key: 'low_cost', label: '최소 비용' },
]

function Strategy() {
  const prof = useApi<any>('/profile')
  const nav = useNavigate()
  const [form, setForm] = useState<any>(null)
  const [res, setRes] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (prof.data && !form) setForm({ weekly_hours: prof.data.weekly_hours || 15, monthly_budget: prof.data.monthly_budget || 0, weeks: 16, strategy: 'balanced', include_interpretation: false,
      targets: (prof.data.targets || []).map((t: any, i: number) => ({ ...t, priority: t.priority || i + 1 })) })
  }, [prof.data, form])
  const run = async (f = form) => { setBusy(true); try { setRes(await api('/strategy/optimize', { method: 'POST', json: f })); setErr(null) } catch (e: any) { setErr(e.message) } finally { setBusy(false) } }
  useEffect(() => { if (form) run(form) }, [form])
  if (!form) return <Loading />
  const set = (k: string, v: any) => setForm({ ...form, [k]: v })
  const apply = async () => { await api('/strategy/apply-roadmap', { method: 'POST', json: form }); nav('/roadmap?tab=plan') }
  const max = res?.weekly_allocation?.[0]?.hours || 1
  const names: Record<string, string> = { korail: '한국철도공사', kepco: '한국전력공사', seoulmetro: '서울교통공사' }

  return (
    <div className="space-y-14">
      {/* 조건 */}
      <div className="grid gap-x-12 gap-y-6 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <div className="mb-2 text-[13px] text-sub">목표 기업 · 우선순위</div>
          {form.targets.map((t: any, i: number) => (
            <div key={i} className="flex items-center gap-3 py-1 text-[14px]">
              <select value={t.priority} onChange={(e) => { const ts = [...form.targets]; ts[i] = { ...t, priority: Number(e.target.value) }; set('targets', ts) }}
                className="rounded-lg bg-white px-2 py-1 text-[13px] outline-none">{form.targets.map((_: any, k: number) => <option key={k} value={k + 1}>{k + 1}순위</option>)}</select>
              <span>{names[t.company_id]}</span><span className="text-sub">{t.job_category}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-2 flex justify-between text-[13px] text-sub"><span>주간 학습 시간</span><span className="text-ink">{form.weekly_hours}시간</span></div>
          <input type="range" min={5} max={40} step={1} value={form.weekly_hours} onChange={(e) => set('weekly_hours', Number(e.target.value))} className="w-full accent-[#A59BE7]" />
          <div className="mb-2 mt-5 flex justify-between text-[13px] text-sub"><span>준비 기간</span><span className="text-ink">{form.weeks}주</span></div>
          <input type="range" min={4} max={30} step={1} value={form.weeks} onChange={(e) => set('weeks', Number(e.target.value))} className="w-full accent-[#A59BE7]" />
        </div>
        <div>
          <div className="mb-2 text-[13px] text-sub">월 예산(원)</div>
          <input type="number" step={10000} value={form.monthly_budget} onChange={(e) => set('monthly_budget', Number(e.target.value))} className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-[14px] outline-none focus:border-accent" />
          <label className="mt-5 flex items-start gap-2 text-[13px] text-sub"><input type="checkbox" className="mt-1" checked={form.include_interpretation} onChange={(e) => set('include_interpretation', e.target.checked)} />‘해석 필요’ 가점(직렬별 직무 자격증)도 포함</label>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {STRATS.map((s) => <button key={s.key} onClick={() => set('strategy', s.key)} className={`rounded-full px-4 py-2 text-[14px] transition ${form.strategy === s.key ? 'bg-accent text-white' : 'bg-white hover:bg-lav'}`}>{s.label}</button>)}
      </div>

      {err && <ErrorBox error={err} />}
      {busy && !res && <Loading text="최적화 계산 중" />}
      {res && !res.available && <Note>{res.message}</Note>}
      {res?.available && (
        <>
          <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Section title={`이번 주 추천 시간 배분 · ${res.study_hours}시간`}>
              <div className="space-y-4">
                {res.weekly_allocation.map((a: any) => (
                  <div key={a.subject} className="grid grid-cols-[120px_1fr_60px] items-center gap-4 text-[14px]">
                    <span>{a.subject}</span>
                    <div className="h-2.5 rounded-full bg-[#EFEDE8]"><div className="h-2.5 rounded-full bg-accent" style={{ width: `${(a.hours / max) * 100}%` }} /></div>
                    <span className="text-right">{a.hours}시간</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-[12.5px] leading-relaxed text-sub">
                {res.algorithm.hours}. 같은 가중치의 단순 비례 배분보다 목적함수 값이 높아요({res.allocation_objective.optimal} vs {res.allocation_objective.proportional}).
              </p>
            </Section>
            <aside className="space-y-8">
              <Sheet tone="lav" className="px-7 py-6">
                <div className="text-[13px] text-[#6d6696]">추천 자격증 조합</div>
                <div className="mt-2 text-[18px]">{res.certificates.chosen.length ? res.certificates.chosen.join(', ') : '추가 취득 없음'}</div>
                <div className="mt-2 text-[12.5px] leading-relaxed text-[#6d6696]">
                  준비 {res.certificates.prep_hours}시간(예상치) · 자격증 배정 한도 {res.inputs.cert_hours_limit}시간<br />
                  부분집합 {res.certificates.subsets_evaluated}개 완전탐색 · 전략 지표 {res.certificates.value} (단순 정렬 방식 {res.certificates.greedy_value})
                </div>
              </Sheet>
              <p className="text-[12.5px] leading-relaxed text-sub">{res.disclaimer}</p>
              {res.missing.length > 0 && (
                <div className="text-[13.5px]">
                  <div className="mb-1 text-[13px] text-sub">분석 제외(데이터 부족)</div>
                  {res.missing.map((m: any) => <div key={m.company_id} className="py-1">{m.company} <span className="text-sub">· {m.reason}</span></div>)}
                </div>
              )}
            </aside>
          </div>

          <Section title="기업별 시험 과목 비교">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[14px]">
                <thead><tr className="text-left text-[12.5px] text-sub"><th className="pb-3 font-normal">과목</th>
                  {['korail', 'kepco', 'seoulmetro'].map((c) => <th key={c} className="pb-3 font-normal">{names[c]}</th>)}<th className="pb-3 font-normal">내 상태</th><th className="pb-3 text-right font-normal">우선순위</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {res.subjects.map((s: any) => (
                    <tr key={s.subject}>
                      <td className="py-3">{s.subject}</td>
                      {['korail', 'kepco', 'seoulmetro'].map((c) => (
                        <td key={c}>{s.companies[c] ? <EvidenceToggle rid={res.companies.find((x: any) => x.company_id === c)?.recruitment_id} ev={s.companies[c].evidence} label="출제" /> : <span className="text-[12.5px] text-[#b0aca3]">{c === 'korail' ? '미출제' : '공식 자료 없음'}</span>}</td>
                      ))}
                      <td><Status s={s.my_status} /></td><td className="text-right text-sub">{s.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12.5px] text-sub">공통 과목은 두 곳 이상 공식 공고에서 확인된 경우에만 표시해요. 현재는 한국철도공사만 확인되어 공통 과목 분석이 불가능해요.</p>
          </Section>

          <Section title="자격증 취득 효율">
            {res.certificates.excluded_note && <p className="mb-4 text-[13px] text-sub">{res.certificates.excluded_note}</p>}
            <div className="divide-y divide-line">
              {res.certificates.efficiency.slice(0, 8).map((e: any) => (
                <div key={e.key} className="grid gap-2 py-3.5 text-[14px] sm:grid-cols-[1.4fr_0.8fr_1fr_1.2fr]">
                  <span>{e.key}{e.selected && <span className="ml-2 text-[12.5px] text-accent-ink">추천</span>}<div className="text-[12px] text-sub">{e.category} · {e.cert_grade}</div></span>
                  <span>+{e.detail[0]?.gain}점<div className="text-[12px] text-sub">{e.companies_benefit}개 기업</div></span>
                  <span>{e.prep_hours}시간<div className="text-[12px] text-sub">{e.prep_hours_is_estimate ? '일반 추정치' : '입력값'}</div></span>
                  <span className="text-[12.5px] text-sub">{e.fee_note}<div><EvidenceToggle rid={MAIN_RID} ev={e.evidence} /></div></span>
                </div>
              ))}
              {res.certificates.efficiency.length === 0 && <p className="py-4 text-[14px] text-sub">현재 설정에서 가점을 늘릴 수 있는 자격증이 없어요.</p>}
            </div>
            <p className="mt-3 text-[12.5px] text-sub">시험 일정·응시료는 시행기관 공식 자료를 아직 수집하지 않아 표시하지 않아요.</p>
          </Section>

          {res.eligibility_gaps.length > 0 && (
            <Section title="확인이 필요한 지원 요건">
              {res.eligibility_gaps.map((g: any, i: number) => <div key={i} className="py-1.5 text-[14px]">{g.company} · {g.item} <span className="text-sub">— {g.reason}</span></div>)}
            </Section>
          )}

          <div className="flex items-center gap-4">
            <button className={btnPrimary} onClick={apply}>이 전략을 로드맵에 적용</button>
            <span className="text-[12.5px] text-sub">기존 로드맵은 보존되고 새 로드맵이 만들어져요.</span>
          </div>
        </>
      )}
    </div>
  )
}
