import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Briefcase, CalendarClock, CheckSquare, ExternalLink, FileSearch, Star } from 'lucide-react'
import { api, MAIN_RID } from '../api'
import { AiBadge, Card, ErrorBox, Loading, PageHeader, Pill, Stat, StatusBadge, VerifiedBadge, useApi } from '../components/ui'
import { useEffect, useState } from 'react'
import Mission from '../components/Mission'

export default function Dashboard() {
  const profile = useApi('/profile')
  const companies = useApi<any[]>('/companies')
  const recs = useApi<any[]>('/recruitments')
  const roadmap = useApi('/roadmaps')
  const [analysis, setAnalysis] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api('/analysis', { method: 'POST', json: { recruitment_id: MAIN_RID } }).then(setAnalysis).catch((e) => setErr(e.message))
  }, [])

  if (profile.loading || companies.loading || recs.loading) return <Loading />
  if (profile.error) return <ErrorBox error={`백엔드 서버에 연결할 수 없습니다: ${profile.error}`} />

  const targets = profile.data?.targets || []
  const official = (recs.data || []).filter((r) => r.official_source?.verification_status === 'verified')
  const open = official.filter((r) => r.application_status === '접수 중')
  const eligibleCount = analysis?.eligibility?.overall?.startsWith('지원 자격 충족') ? 1 : 0
  const today = (roadmap.data?.tasks || []).filter((t: any) => !t.done).slice(0, 4)

  return (
    <div>
      <Mission />
      <PageHeader title={`안녕하세요, ${profile.data?.nickname || '사용자'}님`} desc="공식 채용공고 근거로 계산한 오늘의 취업 준비 현황입니다." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="관심 기업" value={targets.length} sub="내 스펙에서 등록" icon={<Star size={18} />} />
        <Stat label="지원 자격 충족(확정)" value={eligibleCount} sub={`분석 가능 기업 ${companies.data?.filter((c) => c.recruitments > 0).length || 0}곳 기준`} icon={<CheckSquare size={18} />} />
        <Stat label="검증된 공식 공고" value={official.length} sub="JOB-ALIO 원문 대조 완료" icon={<FileSearch size={18} />} />
        <Stat label="접수 중 공고" value={open.length} sub={open.length ? '' : '현재 접수 중인 관심 공고 없음'} icon={<CalendarClock size={18} />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {err && <ErrorBox error={err} />}
          {analysis && (
            <Card title={<>한국철도공사 · {analysis.recruitment.job_category}</>} action={<VerifiedBadge status={analysis.recruitment.official_source.verification_status} />}>
              <div className="text-sm text-slate-500">분석 대상: {analysis.recruitment.recruitment_title} <span className="text-slate-400">({analysis.recruitment.published_at} 게시)</span></div>
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{analysis.recruitment.status_note}</div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">지원 자격</div>
                  <div className="mt-1 text-sm font-semibold text-navy">{analysis.eligibility.overall}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">필기 자격증 가점(확정)</div>
                  <div className="mt-1 text-2xl font-bold text-navy">{analysis.bonus.total_confirmed}점</div>
                  <div className="text-xs text-amber-700">해석 필요 항목 포함 시 {analysis.bonus.total_with_interpretation}점</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">경쟁력 판단</div>
                  <div className="mt-1 text-sm font-semibold text-navy">{analysis.competition.judgement}</div>
                  <div className="text-xs text-slate-500">{analysis.competition.derived}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/analysis" className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">상세 분석 <ArrowRight size={15} /></Link>
                <a href={analysis.recruitment.official_source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">공식 채용공고 원문 <ExternalLink size={14} /></a>
              </div>
            </Card>
          )}
          <Card title="관심 기업 현황" icon={<Briefcase size={16} />}>
            <div className="divide-y divide-slate-100">
              {companies.data?.map((c) => {
                const t = targets.find((x: any) => x.company_id === c.id)
                return (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <div className="font-medium text-navy">{c.name} {t && <span className="text-sm font-normal text-slate-500">/ {t.job_category}</span>}</div>
                      <div className="text-xs text-slate-500">{c.data_status}</div>
                    </div>
                    {c.recruitments > 0 ? <Pill tone="green">분석 가능</Pill> : <Pill>공식 데이터 없음 · 분석 불가</Pill>}
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="오늘의 추천 학습" action={<AiBadge />}>
            {today.length ? (
              <ul className="space-y-2">{today.map((t: any) => <li key={t.id} className="flex gap-2 text-sm"><span className="mt-1 h-3.5 w-3.5 shrink-0 rounded border border-slate-300" />{t.title}<span className="ml-auto shrink-0 text-xs text-slate-400">{t.week}주차</span></li>)}</ul>
            ) : <div className="text-sm text-slate-500">아직 로드맵이 없습니다. <Link className="text-brand-600 underline" to="/roadmap">로드맵 생성하기</Link></div>}
            {roadmap.data && <div className="mt-4"><div className="mb-1 flex justify-between text-xs text-slate-500"><span>준비 진척도 (완료 과제 수 기준)</span><span>{roadmap.data.progress.done}/{roadmap.data.progress.total}</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${roadmap.data.progress.percent}%` }} /></div></div>}
          </Card>
          {analysis?.exam?.available && (
            <Card title="필기 준비 상태">
              <div className="space-y-2 text-sm">
                {[...analysis.exam.ncs, ...analysis.exam.major].map((r: any) => (
                  <div key={r.subject} className="flex items-center justify-between"><span>{r.subject}</span><StatusText s={r.my_status} /></div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export function StatusText({ s }: { s: string }) {
  const tone = s === '준비 완료' ? 'green' : s === '취약' || s === '미시작' || s === '미입력' ? 'rose' : 'amber'
  return <Pill tone={tone as any}>{s}</Pill>
}
export { StatusBadge }
