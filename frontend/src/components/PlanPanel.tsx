import { Link } from 'react-router-dom'
import { AlarmClock, ArrowRight, CalendarClock } from 'lucide-react'
import { useApi } from './ui'

const ST: Record<string, string> = { '이번 채용 반영 가능': 'bg-sage text-sage-ink', '이번 채용 반영 어려움': 'bg-rose text-rose-ink', '확인 필요': 'bg-butter text-butter-ink' }

function Item({ a }: { a: any }) {
  const ext = a.link?.startsWith('http')
  const body = (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0"><div className="text-[14px] font-semibold">{a.title}</div><div className="text-[12.5px] leading-snug text-sub">{a.why}</div></div>
      {a.due && <span className="shrink-0 rounded-md bg-lav px-2 py-0.5 text-[12px] font-semibold text-accent-ink">{a.due.slice(5).replace('-', '/')}까지</span>}
    </div>
  )
  return ext ? <a href={a.link} target="_blank" rel="noreferrer" className="block">{body}</a> : <Link to={a.link || '#'} className="block">{body}</Link>
}

/** 홈 오른쪽: 지금 해야 할 일 */
export function NowActions() {
  const { data } = useApi<any>('/plan')
  if (!data) return null
  return (
    <section className="card border-[#D9D0FA] px-6 py-5">
      <div className="flex items-center gap-2"><AlarmClock size={18} className="text-accent-ink" /><h2 className="text-[17px] font-bold">지금 해야 할 일</h2></div>
      <div className="mt-1 divide-y divide-line">{data.actions.slice(0, 4).map((a: any, i: number) => <Item key={i} a={a} />)}</div>
      <Link to="/roadmap" className="mt-1 inline-flex items-center gap-1 text-[13px] text-accent-ink">공고 일정 계획 보기 <ArrowRight size={13} /></Link>
    </section>
  )
}

/** 로드맵 상단: 공고 전/후 계획 + 자격증 회차 반영 */
export function PlanSection() {
  const { data, loading } = useApi<any>('/plan')
  if (loading || !data) return null
  const an = data.anchor
  return (
    <section className="card mb-6 px-7 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <CalendarClock size={19} className="text-accent" />
        <h2 className="text-[19px] font-bold">공고 일정에 맞춘 준비 계획</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${an.kind === '공식 일정' ? 'bg-sage text-sage-ink' : 'bg-butter text-butter-ink'}`}>{an.kind}</span>
      </div>
      <p className="mt-1 text-[13.5px] text-sub">
        {an.deadline ? <>접수 마감 {an.deadline}{an.exam ? ` · 필기 ${an.exam}` : ''} · 남은 기간 약 {data.weeks_left}주(주 {data.weekly_hours}시간 → 약 {data.hours_available}시간)</> : an.basis}
      </p>
      {an.deadline && <p className="text-[12px] text-sub">기준: {an.basis}. 공식 공고가 나오면 분석 기준을 확정 공고로 바꾸면 실제 일정으로 다시 계산돼요.</p>}
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl bg-[#F8F6FE] px-5 py-4">
          <div className="mb-2 text-[14.5px] font-bold text-accent-ink">공고 전까지 끝낼 것</div>
          <ul className="space-y-2.5">{data.before_notice.map((b: any, i: number) => <li key={i}><div className="text-[14px] font-medium">{b.title}</div><div className="text-[12.5px] text-sub">{b.detail}</div></li>)}</ul>
        </div>
        <div className="rounded-2xl bg-sage px-5 py-4">
          <div className="mb-2 text-[14.5px] font-bold text-sage-ink">공고 후 바로 할 것</div>
          <ul className="space-y-2.5">{data.after_notice.map((b: any, i: number) => <li key={i}><div className="text-[14px] font-medium">{b.title}</div><div className="text-[12.5px] text-sub">{b.detail}</div></li>)}</ul>
        </div>
      </div>
      {data.certificates.length > 0 && (
        <div className="mt-5">
          <div className="mb-1 text-[14px] font-bold">자격증 — 합격 발표일까지 보고 판단</div>
          <div className="divide-y divide-line">
            {data.certificates.map((c: any) => (
              <div key={c.cert} className="grid items-center gap-1 py-2.5 text-[13.5px] sm:grid-cols-[1.3fr_0.9fr_0.8fr_2fr]">
                <span className="font-medium">{c.cert}</span>
                <span>+{c.gain}점{c.doc_gain ? ` (서류 +${c.doc_gain})` : ''}</span>
                <span className={`w-fit rounded-md px-2 py-0.5 text-[12px] font-medium ${ST[c.status] || 'bg-[#F3F2F7] text-sub'}`}>{c.status}</span>
                <span className="text-[12.5px] text-sub">{c.reason} · 준비 약 {c.prep_hours_estimate}시간(추정)</span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[12px] text-sub">{data.cert_schedule_note} <a className="text-accent-ink underline underline-offset-4" href="https://www.q-net.or.kr" target="_blank" rel="noreferrer">Q-Net 시험일정</a></p>
        </div>
      )}
    </section>
  )
}
