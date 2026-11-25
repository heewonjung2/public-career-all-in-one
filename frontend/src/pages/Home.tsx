import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown, Info, Lock, Megaphone, Target, TrendingUp, Users } from 'lucide-react'
import { api } from '../api'
import { ErrorBox, Loading, today, useApi } from '../components/ui'
import MiniCalendar, { EVENT_TONE } from '../components/MiniCalendar'

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

function CompanyMark({ name, size = 36 }: { name: string; size?: number }) {
  const short = name.replace(/한국|공사|공단|주식회사/g, '').slice(0, 2) || name.slice(0, 2)
  return <span className="flex shrink-0 items-center justify-center rounded-xl bg-lav text-[12px] font-bold text-accent-ink" style={{ width: size, height: size }}>{short}</span>
}

function dday(d?: string) {
  if (!d) return null
  const diff = Math.round((new Date(d).getTime() - new Date(today()).getTime()) / 86400000)
  return diff === 0 ? 'D-DAY' : diff > 0 ? `D-${diff}` : null
}

/* 분포 그래프: 가상 데이터 히스토그램 → 부드러운 곡선 */
function Distribution({ s }: { s: any }) {
  const W = 420, H = 150, P = 8
  const max = Math.max(...s.histogram, 1)
  const n = s.histogram.length
  const pts = s.histogram.map((v: number, i: number) => [P + (i + 0.5) * ((W - 2 * P) / n), H - 22 - (v / max) * (H - 50)])
  const path = pts.reduce((acc: string, p: number[], i: number) => {
    if (i === 0) return `M ${P} ${H - 22} L ${p[0]} ${p[1]}`
    const prev = pts[i - 1]; const cx = (prev[0] + p[0]) / 2
    return `${acc} C ${cx} ${prev[1]}, ${cx} ${p[1]}, ${p[0]} ${p[1]}`
  }, '') + ` L ${W - P} ${H - 22} Z`
  const myX = P + Math.min(s.my_value / s.max, 1) * (W - 2 * P)
  const idx = Math.min(Math.floor(s.my_value / s.bin_width), n - 1)
  const myY = pts[idx]?.[1] ?? H - 22
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs><linearGradient id="dist" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#A594F0" stopOpacity="0.45" /><stop offset="100%" stopColor="#A594F0" stopOpacity="0.06" /></linearGradient></defs>
      <path d={path} fill="url(#dist)" stroke="#A594F0" strokeWidth="1.5" />
      <line x1={myX} x2={myX} y1={myY} y2={H - 22} stroke="#7862D4" strokeDasharray="3 3" />
      <circle cx={myX} cy={myY} r="5.5" fill="#7862D4" stroke="#fff" strokeWidth="2" />
      <g transform={`translate(${Math.min(Math.max(myX - 46, 0), W - 92)}, ${Math.max(myY - 46, 0)})`}>
        <rect width="92" height="34" rx="9" fill="#A594F0" />
        <text x="46" y="14" textAnchor="middle" fontSize="10" fill="#fff">내 위치</text>
        <text x="46" y="28" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">상위 {s.top_percent}%</text>
      </g>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => <text key={f} x={P + f * (W - 2 * P)} y={H - 4} textAnchor="middle" fontSize="10" fill="#6B6B80">{Math.round(f * s.max)}</text>)}
    </svg>
  )
}

export default function Home() {
  const profile = useApi('/profile')
  const vers = useApi<any>('/rule-versions/korail')
  const recs = useApi<any[]>('/recruitments')
  const events = useApi<any[]>('/calendar/events')
  const notes = useApi<any[]>('/notifications')
  const [a, setA] = useState<any>(null)
  const [st, setSt] = useState<any>(null)
  const [rm, setRm] = useState<any>(null)
  const [rid, setRid] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { api('/active').then((x) => setRid(x.recruitment_id)).catch((e) => setErr(e.message)); api('/roadmaps').then(setRm).catch(() => {}) }, [])
  useEffect(() => {
    if (!rid) return
    setA(null); setSt(null)
    api('/analysis', { method: 'POST', json: { recruitment_id: rid } }).then(setA).catch((e) => setErr(e.message))
    api(`/stats/position?recruitment_id=${rid}`).then(setSt).catch(() => {})
  }, [rid])
  const choose = async (id: string) => { await api('/active', { method: 'PUT', json: { recruitment_id: id } }); setRid(id) }

  if (err) return <ErrorBox error={`서버에 연결할 수 없습니다 · ${err}`} />
  if (profile.loading || !rid) return <Loading />
  const p = profile.data
  const d = new Date()
  const week = rm ? (rm.weeks.find((w: any) => rm.tasks.some((t: any) => t.week === w.week && !t.done)) || rm.weeks[rm.weeks.length - 1]) : null
  const weekTasks = week ? rm.tasks.filter((t: any) => t.week === week.week) : []
  const doneN = weekTasks.filter((t: any) => t.done).length
  const toggle = async (t: any) => setRm(await api(`/tasks/${t.id}`, { method: 'PATCH', json: { done: !t.done } }))
  const upcoming = (events.data || []).filter((e) => e.date >= today()).slice(0, 4)
  const ds = a?.document_screening
  const b = a?.bonus
  const recog = b ? b.rows.filter((r: any) => r.applied > 0).length : 0
  const gaps = a ? a.eligibility.items.filter((i: any) => i.status === '확인 필요' || i.status === '미충족').length : 0
  const eligOk = a?.eligibility.overall.startsWith('지원 자격 충족')
  const preview = a?.rule_version?.type === '사전예고'

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,68fr)_minmax(0,32fr)]">
      {/* ================= 왼쪽 68% ================= */}
      <div className="min-w-0 space-y-6">
        {/* 환영 */}
        <section className="relative flex items-center justify-between overflow-hidden rounded-[20px] bg-white/0 px-1 pt-1">
          <div>
            <div className="text-[14px] text-sub">{d.getMonth() + 1}월 {d.getDate()}일 ({DAYS[d.getDay()]})</div>
            <h1 className="mt-1.5 text-[28px] font-bold leading-tight">{p.nickname || '준비생'}님, 오늘도 한 걸음 더!</h1>
            <p className="mt-1.5 text-[15px] text-sub">목표하는 공기업 합격까지, 오늘도 차근차근 준비해요.</p>
          </div>
          <div className="relative mr-2 hidden h-[104px] w-[104px] shrink-0 sm:block">
            <div className="absolute inset-0 rounded-full bg-lav" />
            <img src="/chick.png" alt="사원증을 멘 병아리" className="relative h-full w-full object-contain p-1" />
          </div>
        </section>

        {/* 목표 기업 */}
        <section className="card flex flex-wrap items-center gap-x-6 gap-y-4 px-7 py-6 xl:flex-nowrap">
          <div className="min-w-0">
            <span className="rounded-full bg-lav px-3 py-1 text-[12.5px] font-medium text-accent-ink">목표 기업</span>
            <div className="mt-3 flex items-center gap-3"><CompanyMark name={a?.recruitment.company || '한국철도공사'} size={40} /><span className="whitespace-nowrap text-[19px] font-bold">{a?.recruitment.company || '-'}</span></div>
          </div>
          <div className="min-w-0 flex-1 basis-[220px]">
            <div className="text-[13px] text-sub">지원 직렬</div>
            <div className="text-[17px] font-bold">{a?.recruitment.job_category || '-'}</div>
            <label className="relative mt-1 block">
              <select value={rid} onChange={(e) => choose(e.target.value)} className="w-full appearance-none bg-transparent pr-7 text-[13.5px] font-medium text-accent-ink outline-none">
                {(vers.data?.versions || []).map((v: any) => <option key={v.recruitment_id} value={v.recruitment_id}>{v.year}년 {v.type === '사전예고' ? '사전예고 기준' : '확정 공고 기준'}</option>)}
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-0 top-1 text-accent-ink" />
            </label>
            <div className="mt-0.5 text-[12.5px] text-sub">{preview ? '공식 사전예고 · 최종 공고 아님' : a?.recruitment.status_note ? '마감된 과거 공고 기준' : '확정 공고'}</div>
          </div>
          <div className="w-full shrink-0 sm:w-[170px] sm:border-l sm:border-line sm:pl-6">
            <div className="flex items-baseline gap-2 text-[13px] text-sub">학습 진척 <span className="text-[20px] font-bold text-ink">{rm ? `${rm.progress.percent}%` : '-'}</span></div>
            <div className="mt-2 h-2 rounded-full bg-lav"><div className="h-2 rounded-full bg-accent" style={{ width: `${rm?.progress.percent || 0}%` }} /></div>
            <div className="mt-1 text-[11.5px] text-sub">완료한 로드맵 과제 비율</div>
          </div>
          <Link to="/spec" className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#D9D0FA] px-4 py-2.5 text-[14px] font-medium text-accent-ink hover:bg-lav">상세 분석 보기 <ArrowRight size={15} /></Link>
        </section>

        {/* 나의 위치 + 한눈에 보는 결과 */}
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <section className="card px-7 py-6">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-accent" />
              <h2 className="text-[17px] font-bold">나의 위치는?</h2>
              <span className="text-[13px] text-sub">(동일 직렬 준비생 대비)</span><span className="ml-auto rounded-full bg-butter px-2.5 py-0.5 text-[11.5px] font-medium text-butter-ink">시연용 가상 데이터</span>
            </div>
            {st?.available ? (
              <div className="mt-3">
                <Distribution s={st} />
                <div className="mt-3 grid grid-cols-3 gap-2.5 text-[13px]">
                  <div className="rounded-xl border border-line px-3 py-2.5"><div className="flex items-center gap-1.5 text-sub"><Users size={14} />비교 대상</div><div className="mt-0.5 text-[16px] font-bold">{st.n.toLocaleString()}명</div></div>
                  <div className="rounded-xl border border-line px-3 py-2.5"><div className="text-sub">내 점수{st.conditional ? ' (조건부)' : ''}</div><div className="mt-0.5 text-[16px] font-bold text-accent-ink">{st.my_value}점 · 상위 {st.top_percent}%</div></div>
                  <div className="rounded-xl border border-line px-3 py-2.5"><div className="text-sub">평균 · 중앙값</div><div className="mt-0.5 text-[16px] font-bold">{st.mean} · {st.median}</div></div>
                </div>
                <p className="mt-2.5 text-[11.5px] leading-snug text-sub">{st.metric} 기준 · 고정 시드로 만든 가상 준비생과의 비교이며 실제 지원자 순위·합격 가능성이 아니에요.</p>
              </div>
            ) : <div className="py-10 text-center text-[14px] text-sub">분석 기준을 불러오는 중이에요</div>}
          </section>

          <section className="rounded-[20px] bg-sage px-6 py-6">
            <h2 className="text-[17px] font-bold">한눈에 보는 결과</h2>
            {a ? (
              <ul className="mt-4 space-y-3 text-[14.5px]">
                <li className="flex items-start gap-2.5">{eligOk ? <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-sage-ink" /> : <AlertCircle size={19} className="mt-0.5 shrink-0 text-butter-ink" />}지원 자격 {eligOk ? '충족' : '확인 필요'}</li>
                <li className="flex items-start gap-2.5"><CheckCircle2 size={19} className="mt-0.5 shrink-0 text-sage-ink" />자격증 {recog}개 인정 · {b.total_confirmed}점</li>
                {ds?.available && <li className="flex items-start gap-2.5"><Target size={19} className="mt-0.5 shrink-0 text-accent-ink" />서류 {ds.total}점{ds.total_if_language_valid != null ? ` (조건부 ${ds.total_if_language_valid}점)` : ''}</li>}
                {gaps > 0 && <li className="flex items-start gap-2.5"><AlertCircle size={19} className="mt-0.5 shrink-0 text-butter-ink" />확인할 조건 {gaps}건</li>}
                {ds?.available && ds.language_points_if_valid != null && <li className="flex items-start gap-2.5"><AlertCircle size={19} className="mt-0.5 shrink-0 text-butter-ink" />어학 응시일 입력 필요</li>}
              </ul>
            ) : <div className="py-6 text-[14px] text-sub">분석 중</div>}
            <Link to="/roadmap" className="mt-5 flex items-center justify-center gap-1.5 rounded-xl border border-[#BFE3CC] bg-white px-4 py-2.5 text-[14px] font-medium text-sage-ink hover:bg-[#f6fbf8]">준비 로드맵 보기 <ArrowRight size={15} /></Link>
          </section>
        </div>

        {/* 관심 기업 최신 공고 */}
        <section className="card px-7 py-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><Megaphone size={18} className="text-accent" /><h2 className="text-[17px] font-bold">관심 기업 공식 공고</h2></div>
            <Link to="/jobs" className="inline-flex items-center gap-1 text-[13.5px] text-accent-ink">전체보기 <ArrowRight size={14} /></Link>
          </div>
          <div className="divide-y divide-line">
            {(recs.data || []).filter((r) => !r.user_document).map((r) => (
              <Link to={`/jobs?id=${r.id}`} key={r.id} className="grid items-center gap-3 py-3.5 sm:grid-cols-[150px_76px_minmax(0,1fr)_auto]">
                <span className="flex items-center gap-2.5 text-[14.5px] font-semibold"><CompanyMark name={r.company} size={30} />{r.company.replace('한국철도공사', '한국철도공사')}</span>
                <span className={`w-fit rounded-md px-2 py-0.5 text-[12px] font-medium ${r.application_status === '접수 중' ? 'bg-lav text-accent-ink' : 'bg-[#F3F2F7] text-sub'}`}>{r.application_status}</span>
                <span className="truncate text-[14.5px]">{r.recruitment_title}<span className="ml-2 rounded-md bg-[#F6F5FA] px-2 py-0.5 text-[12px] text-sub">{r.job_category}</span></span>
                <span className="text-[13px] text-sub">{r.application_period?.start ? `${r.application_period.start} ~ ${r.application_period.end?.slice(5)}` : r.published_at}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* ================= 오른쪽 32% ================= */}
      <aside className="min-w-0 space-y-6">
        <section className="card px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Target size={18} className="text-accent" /><h2 className="text-[17px] font-bold">이번 주 학습 목표</h2></div>
            {week && <span className="text-[14px] font-semibold text-accent-ink">{doneN}/{weekTasks.length} 완료</span>}
          </div>
          {week ? (
            <>
              <div className="mt-3 h-2.5 rounded-full bg-lav"><div className="h-2.5 rounded-full bg-accent" style={{ width: `${weekTasks.length ? (doneN / weekTasks.length) * 100 : 0}%` }} /></div>
              <div className="mt-2 text-[12.5px] text-sub">{week.week}주차 · {week.title}</div>
              <ul className="mt-4 space-y-2.5">
                {weekTasks.slice(0, 6).map((t: any) => (
                  <li key={t.id}><button onClick={() => toggle(t)} className="flex w-full items-start gap-2.5 text-left text-[14px]">
                    <span className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border ${t.done ? 'border-accent bg-accent text-white' : 'border-[#CFC8E8] bg-white'}`}>{t.done && <Check size={12} strokeWidth={3} />}</span>
                    <span className={t.done ? 'text-sub line-through' : ''}>{t.title}</span>
                  </button></li>
                ))}
              </ul>
            </>
          ) : (
            <div className="mt-4 rounded-2xl bg-lav px-4 py-5 text-center text-[14px] text-[#5b4fa8]">아직 학습 로드맵이 없어요<br /><Link to="/roadmap" className="mt-2 inline-block font-semibold underline underline-offset-4">8주 로드맵 만들기</Link></div>
          )}
        </section>

        <section className="card px-6 py-5"><MiniCalendar events={events.data || []} /></section>

        <section className="card px-6 py-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><CalendarDays size={18} className="text-accent" /><h2 className="text-[17px] font-bold">다가오는 일정</h2></div>
            <Link to="/calendar" className="inline-flex items-center gap-1 text-[13px] text-accent-ink">전체보기 <ArrowRight size={13} /></Link>
          </div>
          {upcoming.length ? upcoming.map((e, i) => (
            <div key={i} className="flex items-center justify-between border-b border-line py-2.5 last:border-0">
              <div className="flex items-start gap-2.5"><span className={`mt-2 h-2 w-2 rounded-full ${EVENT_TONE[e.type] || 'bg-accent'}`} /><div><div className="text-[14px] font-medium">{e.title}</div><div className="text-[12.5px] text-sub">{e.date}</div></div></div>
              {dday(e.date) && <span className="rounded-md bg-lav px-2 py-0.5 text-[12px] font-semibold text-accent-ink">{dday(e.date)}</span>}
            </div>
          )) : <p className="text-[13.5px] leading-relaxed text-sub">공식적으로 확정된 다가오는 채용 일정이 없어요. 2027년 공고가 발표되면 이곳에 표시돼요.</p>}
          {(notes.data || []).slice(0, 1).map((n) => <div key={n.id} className="mt-3 flex items-start gap-2 rounded-xl bg-butter px-3 py-2.5 text-[12.5px]"><Info size={14} className="mt-0.5 shrink-0 text-butter-ink" />{n.title}</div>)}
        </section>
      </aside>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-sub lg:col-span-2">
        <span className="flex items-center gap-1.5"><Lock size={13} />개인 스펙은 이 기기의 서버에만 저장되며, 비교 통계는 시연용 가상 데이터를 사용합니다.</span>
        <span className="flex items-center gap-1.5"><Info size={13} />채용 기준은 공식 공고 원문으로만 판단합니다.</span>
      </div>
    </div>
  )
}
