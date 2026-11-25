import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { api, MAIN_RID } from '../api'
import { Bar, ErrorBox, Loading, Section, Sheet, Status, today, useApi } from '../components/ui'
import MiniCalendar from '../components/MiniCalendar'

const LEVEL: Record<string, number> = { '준비 완료': 90, '복습 필요': 65, '준비 중': 45, '보완 필요': 35, '취약': 15, '미시작': 5, '미입력': 0 }
const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function Home() {
  const profile = useApi('/profile')
  const companies = useApi<any[]>('/companies')
  const recs = useApi<any[]>('/recruitments')
  const events = useApi<any[]>('/calendar/events')
  const [rm, setRm] = useState<any>(null)
  const [a, setA] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api('/analysis', { method: 'POST', json: { recruitment_id: MAIN_RID } }).then(setA).catch((e) => setErr(e.message))
    api('/roadmaps').then(setRm).catch(() => {})
  }, [])

  if (profile.loading || companies.loading) return <Loading />
  if (profile.error) return <ErrorBox error={`서버에 연결할 수 없습니다 · ${profile.error}`} />

  const p = profile.data
  const d = new Date()
  const week = rm ? (rm.weeks.find((w: any) => rm.tasks.some((t: any) => t.week === w.week && !t.done)) || rm.weeks[rm.weeks.length - 1]) : null
  const weekTasks = week ? rm.tasks.filter((t: any) => t.week === week.week) : []
  const todo = weekTasks.filter((t: any) => !t.done).slice(0, 4)
  const toggle = async (t: any) => setRm(await api(`/tasks/${t.id}`, { method: 'PATCH', json: { done: !t.done } }))
  const upcoming = (events.data || []).filter((e) => e.date >= today())
  const subjects = a?.exam?.available ? [...a.exam.ncs, ...a.exam.major] : []
  const target = (p.targets || []).find((t: any) => t.company_id === 'korail')

  return (
    <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* 왼쪽: 관심 기업 · 준비 현황 */}
      <div className="space-y-14">
        <div className="pt-4">
          <div className="text-[14px] text-sub">{d.getMonth() + 1}월 {d.getDate()}일 {DAYS[d.getDay()]}요일</div>
          <h1 className="mt-2 text-[30px] font-semibold leading-tight">{p.nickname || '오늘'}님, 오늘도 한 걸음.</h1>
        </div>

        {err && <ErrorBox error={err} />}
        {a && (
          <Sheet className="px-8 py-7">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="text-[13px] text-sub">목표 기업</div>
                <div className="mt-1 text-[22px] font-semibold">한국철도공사</div>
                <div className="text-[14px] text-sub">{target?.job_category || a.recruitment.job_category} · {a.recruitment.location} {a.recruitment.headcount}명</div>
              </div>
              <div className="flex flex-wrap gap-x-12 gap-y-4">
                <div>
                  <div className="text-[13px] text-sub">지원 자격</div>
                  <Status s={a.eligibility.overall.startsWith('지원 자격 충족') ? '충족' : a.eligibility.overall.startsWith('지원 불가') ? '미충족' : '확인 필요'} className="mt-1.5 !text-[15px]" />
                </div>
                <div>
                  <div className="text-[13px] text-sub">필기 가점</div>
                  <div className="mt-0.5 text-[22px] font-semibold">{a.bonus.total_confirmed}<span className="ml-0.5 text-[14px] font-normal text-sub">점</span></div>
                </div>
                <div className="w-40">
                  <div className="text-[13px] text-sub">학습 진척 <span className="text-ink">{rm?.progress?.percent ?? 0}%</span></div>
                  <div className="mt-3"><Bar value={rm?.progress?.percent ?? 0} /></div>
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[13px] text-sub">
              <span>{a.recruitment.recruitment_title} 기준 · 근거 원문 {a.recruitment.evidence_check.passed}/{a.recruitment.evidence_check.checked}건 일치</span>
              <Link to="/spec" className="inline-flex items-center gap-1 text-accent-ink">상세 분석 <ArrowRight size={14} /></Link>
            </div>
          </Sheet>
        )}

        <Section title="관심 기업별 분석">
          <div className="divide-y divide-line">
            {companies.data?.map((c) => {
              const t = (p.targets || []).find((x: any) => x.company_id === c.id)
              const ok = c.recruitments > 0
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex items-baseline gap-3">
                    <span className="w-6 text-[13px] text-[#b0aca3]">{t?.priority ?? '-'}</span>
                    <span className="text-[15px]">{c.name}</span>
                    <span className="text-[13.5px] text-sub">{t?.job_category}</span>
                  </div>
                  {ok && a ? (
                    <div className="flex items-center gap-6 text-[13.5px]">
                      <Status s={a.eligibility.overall.startsWith('지원 자격 충족') ? '충족' : '확인 필요'} />
                      <span className="text-sub">가점 <span className="text-ink">{a.bonus.total_confirmed}점</span></span>
                      <Link to="/spec" className="text-accent-ink">분석</Link>
                    </div>
                  ) : <span className="text-[13.5px] text-sub">공식 공고 미등록 · 분석 불가</span>}
                </div>
              )
            })}
          </div>
        </Section>

        {subjects.length > 0 && (
          <Section title="나의 준비 현황" action={<Link to="/roadmap?tab=strategy" className="text-[13.5px] text-accent-ink">전략 보기</Link>}>
            <div className="grid gap-x-12 gap-y-5 sm:grid-cols-2">
              {subjects.map((s: any) => (
                <div key={s.subject}>
                  <div className="mb-2 flex items-baseline justify-between text-[14px]"><span>{s.subject}</span><span className="text-[12.5px] text-sub">{s.my_status}</span></div>
                  <Bar value={LEVEL[s.my_status] ?? 0} tone={(LEVEL[s.my_status] ?? 0) >= 60 ? 'sage' : 'accent'} />
                </div>
              ))}
            </div>
            {a.exam.my_subjects_not_in_scope?.length > 0 && (
              <p className="mt-6 text-[13px] text-sub">{a.exam.my_subjects_not_in_scope.join(', ')}은(는) 한국철도공사 IT 전공 출제범위에 없어요.</p>
            )}
          </Section>
        )}

        <Section title="관심 기업 최신 공고" action={<Link to="/jobs" className="text-[13.5px] text-accent-ink">전체</Link>}>
          <div className="divide-y divide-line">
            {(recs.data || []).filter((r) => !r.user_document).map((r) => (
              <Link to={`/jobs?id=${r.id}`} key={r.id} className="grid gap-1 py-4 sm:grid-cols-[110px_1fr_auto] sm:items-baseline sm:gap-6">
                <span className="text-[13.5px] text-sub">{r.company}</span>
                <span className="text-[15px]">{r.recruitment_title}<span className="ml-2 text-[13px] text-sub">{r.job_category}</span></span>
                <span className="text-[13px] text-sub">{r.application_period?.start?.slice(5)} ~ {r.application_period?.end?.slice(5)} · {r.application_status}</span>
              </Link>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-sub">현재 접수 중인 관심 기업 공고는 확인되지 않았어요.</p>
        </Section>
      </div>

      {/* 오른쪽: 이번 주 · 오늘 · 캘린더 */}
      <aside className="space-y-10 lg:pt-[92px]">
        <Sheet tone="lav" className="px-7 py-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[16px] font-semibold">이번 주 학습 목표</h2>
            {week && <span className="text-[13px] text-accent-ink">{weekTasks.filter((t: any) => t.done).length}/{weekTasks.length}</span>}
          </div>
          {week ? (
            <>
              <div className="mt-1 text-[13px] text-[#6d6696]">{week.week}주차 · {week.title}</div>
              <div className="mt-4"><Bar value={weekTasks.length ? (weekTasks.filter((t: any) => t.done).length / weekTasks.length) * 100 : 0} /></div>
            </>
          ) : <p className="mt-2 text-[13.5px] text-[#6d6696]">아직 로드맵이 없어요. <Link to="/roadmap" className="underline underline-offset-4">만들기</Link></p>}
        </Sheet>

        {week && (
          <Section title="오늘 할 일">
            <ul className="space-y-3">
              {todo.map((t: any) => (
                <li key={t.id}>
                  <button onClick={() => toggle(t)} className="flex w-full items-start gap-3 text-left text-[14px]">
                    <span className={`mt-1 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-md border ${t.done ? 'border-accent bg-accent text-white' : 'border-[#d6d2c9] bg-white'}`}>{t.done && <Check size={12} strokeWidth={3} />}</span>
                    <span className={t.done ? 'text-sub line-through' : ''}>{t.title}</span>
                  </button>
                </li>
              ))}
              {todo.length === 0 && <li className="text-[13.5px] text-sub">이번 주 과제를 모두 끝냈어요.</li>}
            </ul>
          </Section>
        )}

        <MiniCalendar events={events.data || []} />

        <Section title="다가오는 일정" action={<Link to="/calendar" className="text-[13px] text-accent-ink">캘린더</Link>}>
          {upcoming.length ? upcoming.slice(0, 4).map((e, i) => (
            <div key={i} className="flex justify-between py-2 text-[14px]"><span>{e.title}</span><span className="text-sub">{e.date.slice(5)}</span></div>
          )) : <p className="text-[13.5px] leading-relaxed text-sub">공식적으로 확정된 다가오는 채용 일정이 없어요. 추정 일정은 표시하지 않아요.</p>}
        </Section>
      </aside>
    </div>
  )
}
