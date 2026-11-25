import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, RefreshCw } from 'lucide-react'
import { api } from '../api'
import { PlanSection } from '../components/PlanPanel'
import { ErrorBox, EvidenceToggle, Loading, Note, Section, Sheet, Status, Tabs, btnPrimary, useApi } from '../components/ui'

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

function chip(cat: string) {
  const c = cat || ''
  if (c.startsWith('NCS')) return { cls: 'bg-lav text-accent-ink', label: c.replace('NCS·', 'NCS ') }
  if (c.startsWith('전공')) return { cls: 'bg-sage text-sage-ink', label: c.replace('전공·', '전공 ') }
  if (c.includes('법령')) return { cls: 'bg-sky text-[#2f6fb3]', label: c }
  return { cls: 'bg-butter text-butter-ink', label: c }
}

function Plan() {
  const rm = useApi<any>('/roadmaps')
  const sc = useApi<any>('/target/scope')
  const [busy, setBusy] = useState(false)
  const create = async () => { setBusy(true); try { rm.setData(await api('/roadmaps', { method: 'POST', json: { weeks: 8 } })) } finally { setBusy(false) } }
  const toggle = async (t: any) => {
    // 즉시 반영(낙관적 갱신) 후 서버 저장 결과로 교체
    rm.setData((prev: any) => {
      if (!prev) return prev
      const tasks = prev.tasks.map((x: any) => (x.id === t.id ? { ...x, done: x.done ? 0 : 1 } : x))
      const done = tasks.filter((x: any) => x.done).length
      return { ...prev, tasks, progress: { done, total: tasks.length, percent: tasks.length ? Math.round((done * 100) / tasks.length) : 0 } }
    })
    try { rm.setData(await api(`/tasks/${t.id}`, { method: 'PATCH', json: { done: !t.done } })) } catch { rm.reload() }
  }
  if (rm.loading) return <Loading />
  if (rm.error) return <ErrorBox error={rm.error} />
  const d = rm.data
  const s = sc.data
  const hasSubj = !!(s?.subjects?.ncs?.length || s?.subjects?.major?.length)
  if (!d) return (
    <div className="card mx-auto max-w-lg px-8 py-10 text-center">
      <img src="/chick.png" alt="" className="mx-auto h-20 w-20" />
      {s && <p className="mt-2 text-[13px] text-sub">{s.company_name} · {s.job}{s.posting_title ? ` · ${s.posting_title}` : ''}</p>}
      {hasSubj ? (<>
        <p className="mt-3 text-[15px]">아직 만든 로드맵이 없어요</p>
        {s.subject_source && <p className="mt-1 text-[12.5px] text-butter-ink">필기 범위: {s.subject_source}</p>}
        <button className={`${btnPrimary} mt-4`} onClick={create} disabled={busy}>{busy ? '만드는 중…' : '로드맵 만들기'}</button>
      </>) : s?.status === '필기 과목 확인 필요' ? (<>
        <p className="mt-3 text-[15px]">필기 과목 확인 필요</p>
        <p className="mt-1 text-[13px] text-sub">공고의 필기 과목을 원문에서 확인하지 못했어요(이미지·HWP 등).</p>
        {s.posting_url && <a className={`${btnPrimary} mt-4 inline-flex`} href={s.posting_url} target="_blank" rel="noreferrer">공식 공고 보기</a>}
      </>) : (<>
        <p className="mt-3 text-[15px]">아직 만든 로드맵이 없어요</p>
        <p className="mt-1 text-[13px] text-sub">홈의 목표 기업 카드에서 ‘공고 선택’으로 기준 공고와 직렬을 고르면 필기 과목으로 로드맵을 만들 수 있어요.</p>
      </>)}
    </div>
  )
  const pct = d.progress.percent
  const R = 62, C = 2 * Math.PI * R
  return (
    <div className="pb-24">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold">학습 로드맵</h1>
          <p className="mt-1 text-[15px] text-sub">{d.scope ? `${d.scope.company_name} · ${d.scope.job} 필기 준비` : ''}</p>
          {d.scope?.posting_title && <p className="mt-0.5 text-[13px] text-sub">기준 공고: {d.scope.posting_url ? <a className="text-accent-ink underline underline-offset-2" href={d.scope.posting_url} target="_blank" rel="noreferrer">{d.scope.posting_title}</a> : d.scope.posting_title}</p>}
          {d.scope?.subject_source && <span className="mt-1.5 inline-block rounded-full bg-butter px-2.5 py-0.5 text-[12px] text-butter-ink">필기 범위: {d.scope.subject_source}</span>}
        </div>
        <button onClick={create} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-accent bg-white px-5 py-2.5 text-[14.5px] font-semibold text-accent-ink hover:bg-lav"><RefreshCw size={16} className={busy ? 'animate-spin' : ''} />로드맵 다시 만들기</button>
      </div>
      <PlanSection />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="order-2 space-y-5 lg:order-1">
          {d.weeks.map((w: any) => {
            const tasks = d.tasks.filter((t: any) => t.week === w.week)
            const done = tasks.filter((t: any) => t.done).length
            const ratio = tasks.length ? (done / tasks.length) * 100 : 0
            return (
              <section key={w.week} id={`week-${w.week}`} className="card scroll-mt-24 overflow-hidden">
                <div className="flex items-center gap-4 bg-lav px-6 py-3.5">
                  <h2 className="text-[19px] font-bold">{w.week}주차</h2>
                  <div className="ml-auto hidden h-2 w-44 rounded-full bg-white sm:block"><div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${ratio}%` }} /></div>
                  <span className="ml-auto text-[14px] text-sub sm:ml-0">{done}/{tasks.length} 완료</span>
                </div>
                <div className="h-1 bg-white sm:hidden"><div className="h-1 bg-accent transition-all" style={{ width: `${ratio}%` }} /></div>
                <div className="px-6 pb-3 pt-4">
                  <h3 className="mb-1 text-[17px] font-bold">{w.title}</h3>
                  <ul className="divide-y divide-line">
                    {tasks.map((t: any) => {
                      const c = chip(t.category)
                      return (
                        <li key={t.id}>
                          <button onClick={() => toggle(t)} aria-pressed={!!t.done} className="flex w-full flex-col gap-1.5 py-3 text-left sm:flex-row sm:items-center sm:gap-3">
                            <span className="flex flex-1 items-center gap-3">
                              <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] border-2 transition ${t.done ? 'border-accent bg-accent text-white' : 'border-[#CBC4E6] bg-white'}`}>{!!t.done && <Check size={14} strokeWidth={3} />}</span>
                              <span className={`text-[15px] ${t.done ? 'text-sub line-through' : ''}`}>{t.title}</span>
                            </span>
                            <span className={`ml-[34px] w-fit shrink-0 rounded-lg px-2.5 py-1 text-[12.5px] font-medium sm:ml-0 ${c.cls}`}>{c.label}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </section>
            )
          })}
        </div>
        <aside className="order-1 space-y-5 lg:sticky lg:top-24 lg:order-2">
          <section className="card px-6 py-6">
            <h2 className="text-[19px] font-bold">전체 진행률</h2>
            <div className="relative mx-auto mt-4 h-[160px] w-[160px]">
              <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
                <circle cx="80" cy="80" r={R} fill="none" stroke="#F1EDFD" strokeWidth="14" />
                <circle cx="80" cy="80" r={R} fill="none" stroke="#A594F0" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(pct / 100) * C} ${C}`} className="transition-all" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center"><div className="text-[34px] font-bold leading-none">{pct}%</div><div className="mt-1 text-[13px] text-sub">{d.progress.done}/{d.progress.total}개 완료</div></div>
            </div>
            <p className="mt-3 text-center text-[12px] text-sub">완료한 과제 수 기준</p>
            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 text-[14.5px] font-bold">주차별 이동</div>
              <div className="grid grid-cols-4 gap-1.5">
                {d.weeks.map((w: any) => {
                  const tasks = d.tasks.filter((t: any) => t.week === w.week)
                  const all = tasks.length > 0 && tasks.every((t: any) => t.done)
                  return <a key={w.week} href={`#week-${w.week}`} className={`rounded-lg py-1.5 text-center text-[13.5px] ${all ? 'bg-sage text-sage-ink' : 'hover:bg-lav'}`}>{w.week}주차</a>
                })}
              </div>
            </div>
          </section>
          <div className="space-y-1 px-1 text-[12.5px] text-sub">
            <div>{d.label}</div>
            <div className="flex flex-wrap gap-1.5 pt-1"><span className="rounded-md bg-lav px-2 py-0.5 text-accent-ink">NCS</span><span className="rounded-md bg-sage px-2 py-0.5 text-sage-ink">전공</span><span className="rounded-md bg-sky px-2 py-0.5 text-[#2f6fb3]">철도법령</span><span className="rounded-md bg-butter px-2 py-0.5 text-butter-ink">실전·복습</span></div>
          </div>
        </aside>
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
                  <span className="text-[12.5px] text-sub">{e.fee_note}<div><EvidenceToggle rid={res.companies[0]?.recruitment_id} ev={e.evidence} /></div></span>
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
