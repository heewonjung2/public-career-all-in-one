import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BarChart3, BookOpenCheck, Calculator, ClipboardCheck, ExternalLink, FileWarning, Map, RefreshCw } from 'lucide-react'
import { api, MAIN_RID } from '../api'
import { Card, ErrorBox, EvidenceLink, Loading, PageHeader, Pill, StatusBadge, VerifiedBadge, btnGhost, btnPrimary } from '../components/ui'
import { StatusText } from './Dashboard'

export default function Analysis() {
  const [a, setA] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const run = () => {
    setLoading(true)
    api('/analysis', { method: 'POST', json: { recruitment_id: MAIN_RID } }).then((d) => { setA(d); setErr(null) }).catch((e) => setErr(e.message)).finally(() => setLoading(false))
  }
  useEffect(run, [])
  if (loading && !a) return <Loading text="공식 공고 기준으로 분석 중…" />
  if (err) return <ErrorBox error={err} />
  if (!a) return null
  const r = a.recruitment, b = a.bonus, rid = r.id

  return (
    <div>
      <PageHeader title={`${r.company} / ${r.job_category}`} desc={`분석 시각 ${a.analyzed_at} · 프로필 수정 ${a.profile_updated_at}`}
        action={<button className={btnGhost} onClick={run}><RefreshCw size={15} />다시 분석</button>} />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">분석 대상 공식 공고 {r.notice_no}</div>
            <div className="text-lg font-semibold text-navy">{r.recruitment_title}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>출처 {r.official_source.site}</span><span>게시일 {r.published_at}</span><span>채용유형 {r.recruitment_type}</span>
              <span>모집 {r.job_category} {r.headcount}명({r.location})</span><span>마지막 확인 {r.official_source.checked_at}</span>
              <span>근거 원문 코드 검증 {r.evidence_check.passed}/{r.evidence_check.checked}건 일치</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2"><VerifiedBadge status={r.official_source.verification_status} />
            <a href={r.official_source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">JOB-ALIO 공식 공고 원문 <ExternalLink size={12} /></a></div>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{r.status_note}</div>
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-sm text-slate-500">지원 자격</div><div className="mt-2 text-lg font-bold text-navy">{a.eligibility.overall}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-sm text-slate-500">필기 우대 가점 (확정)</div><div className="mt-2 text-3xl font-bold text-navy">{b.total_confirmed}<span className="text-base">점</span></div><div className="text-xs text-amber-700">해석 필요 항목 포함 시 {b.total_with_interpretation}점</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-sm text-slate-500">예상 서류 점수</div><div className="mt-2 text-lg font-bold text-navy">산출 대상 아님</div><div className="text-xs text-slate-500">서류전형은 자기소개서 적격/부적격 판정 <EvidenceLink rid={rid} ev={a.screening?.evidence} /></div></div>
      </div>

      <Card className="mt-6" title="지원 자격 상세" icon={<ClipboardCheck size={16} />}>
        <div className="divide-y divide-slate-100">
          {a.eligibility.items.map((i: any) => (
            <div key={i.id} className="grid gap-2 py-3 md:grid-cols-[150px_120px_1fr]">
              <div className="font-medium text-navy">{i.item}</div>
              <div><StatusBadge status={i.status} /></div>
              <div className="text-sm"><div className="text-slate-700">{i.reason}</div><div className="text-xs text-slate-500">공고 기준: {i.rule_text}</div><div className="mt-1"><EvidenceLink rid={rid} ev={i.evidence} /></div></div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-6" title="필기 우대 가점 계산 상세" icon={<Calculator size={16} />} action={<Pill tone="blue">Python 규칙 엔진 계산 · AI 미사용</Pill>}>
        <div className="mb-3 text-xs text-slate-500">{b.base_score_note}</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-2">보유 자격</th><th>공고 목록 매칭</th><th>영역·등급</th><th>점수</th><th>적용</th><th>공식 근거</th></tr></thead>
            <tbody>
              {b.rows.map((row: any, i: number) => (
                <tr key={i} className="border-b border-slate-100 align-top">
                  <td className="py-2 font-medium">{row.cert}</td>
                  <td className="text-slate-600">{row.matched || '-'}</td>
                  <td className="text-slate-600">{row.category ? `${row.category} · ${row.grade}` : '-'}</td>
                  <td className="font-semibold">{row.points != null ? `${row.points}점` : '-'}</td>
                  <td><StatusBadge status={row.status} />{row.note && <div className="mt-1 max-w-56 text-xs text-slate-500">{row.note}</div>}</td>
                  <td><EvidenceLink rid={rid} ev={row.evidence} /></td>
                </tr>
              ))}
              {b.others.map((o: any, i: number) => (
                <tr key={`o${i}`} className="border-b border-slate-100 align-top">
                  <td className="py-2 font-medium">{o.item}</td><td className="text-slate-600" colSpan={2}>{o.note}</td>
                  <td className="font-semibold">{o.points != null ? `${o.points}점` : '-'}</td><td><StatusBadge status={o.status} /></td><td><EvidenceLink rid={rid} ev={o.evidence} /></td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold"><td className="py-2" colSpan={3}>합계 (일반 자격증 최대 {b.caps.general_max}점·최대 {b.caps.general_max_count}개, 자격증 총 {b.caps.cert_total_cap}점 상한 적용)</td><td colSpan={3}>확정 {b.total_confirmed}점 / 해석 포함 {b.total_with_interpretation}점</td></tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {b.interpretation_notes.map((n: any) => (
            <div key={n.category} className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><b>해석 필요 · {n.category} 직무 자격증</b><div className="mt-1">{n.text}</div><div className="mt-1"><EvidenceLink rid={rid} ev={{ ...n, verified: n.evidence_verified }} /></div></div>
          ))}
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><b>적용한 공식 계산 규칙</b>
            <ul className="mt-1 space-y-1">{b.policy_evidence.map((e: any, i: number) => <li key={i}>• {e.quote} <EvidenceLink rid={rid} ev={{ ...e, verified: e.evidence_verified }} /></li>)}</ul>
            <div className="mt-1">{b.rail_cert_note}</div>
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="이미 충족한 조건"><ul className="space-y-1 text-sm">{a.met_conditions.map((m: string) => <li key={m}>• {m}</li>)}</ul></Card>
        <Card title="추가 확인·준비 필요"><ul className="space-y-1 text-sm">{a.todo_conditions.map((m: string) => <li key={m}>• {m}</li>)}{b.others.filter((o: any) => o.status === '확인 필요').map((o: any) => <li key={o.item}>• {o.item}: {o.note}</li>)}</ul></Card>
        <Card title="공식 문서에서 확인되지 않은 정보" icon={<FileWarning size={16} />}><ul className="space-y-1 text-sm text-slate-600">{a.not_found.map((m: string) => <li key={m}>• {m}</li>)}</ul></Card>
      </div>

      {a.exam.available && (
        <Card className="mt-6" title="NCS 및 전공시험 안내 (공식 공고 기준)" icon={<BookOpenCheck size={16} />}>
          <div className="grid gap-4 md:grid-cols-4">
            {[['시험일', a.exam.exam.date], ['시험 시간', `${a.exam.exam.duration_minutes}분`], ['문항 구성', `NCS ${a.exam.exam.composition.NCS} · 전공 ${a.exam.exam.composition['전공']} · 철도법령 ${a.exam.exam.composition['철도법령']}`], ['과락', a.exam.exam.cutoff]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{k}</div><div className="mt-1 text-sm font-semibold text-navy">{v}</div></div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
            <span>출제 대행사: <b>{a.exam.exam.agency_note}</b></span><span>시험 유형: <b>{a.exam.exam.exam_type_note}</b></span>
            <span>철도법령 범위: {a.exam.exam.law_scope}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-3">{a.exam.exam.evidence.map((e: any) => <EvidenceLink key={e.what} rid={rid} ev={{ ...e, verified: e.evidence_verified }} label={`근거: ${e.what} p.${e.page}`} />)}</div>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div><div className="mb-2 text-sm font-semibold text-navy">NCS 출제 영역 × 내 준비 상태</div>
              {a.exam.ncs.map((x: any) => <div key={x.subject} className="flex justify-between border-b border-slate-100 py-1.5 text-sm"><span>{x.subject}</span><StatusText s={x.my_status} /></div>)}</div>
            <div><div className="mb-2 text-sm font-semibold text-navy">전공({a.exam.exam.major_name}) 출제범위 × 내 준비 상태</div>
              {a.exam.major.map((x: any) => <div key={x.subject} className="flex justify-between border-b border-slate-100 py-1.5 text-sm"><span>{x.subject}{x.subject === '전자계산기' && <span className="text-xs text-slate-400"> (컴퓨터구조 입력값 사용)</span>}</span><StatusText s={x.my_status} /></div>)}</div>
          </div>
          {a.exam.my_subjects_not_in_scope.length > 0 && (
            <div className="mt-4 rounded-xl bg-violet-50 p-3 text-xs text-violet-800"><b>개인 맞춤 분석(추천):</b> 내가 준비 중인 {a.exam.my_subjects_not_in_scope.join(', ')}은(는) 이 공고의 IT 전공 출제범위에 없습니다. 코레일 대비 시간 배분 우선순위를 낮추는 것을 고려하세요.</div>
          )}
        </Card>
      )}

      <Card className="mt-6" title="과거 합격선 및 경쟁력 분석" icon={<BarChart3 size={16} />}>
        <div className="flex flex-wrap items-center gap-3"><Pill tone="slate">{a.competition.judgement}</Pill><span className="text-sm text-slate-600">{a.competition.note}</span></div>
        {a.competition.derived && <div className="mt-2 text-sm text-slate-700">{a.competition.derived} <EvidenceLink rid={rid} ev={{ ...a.screening.written_pass_evidence, verified: a.screening.written_pass_evidence.evidence_verified }} /></div>}
        <div className="mt-1 text-xs text-slate-500">분류 기준: {a.competition.criteria}. 임의의 합격 확률이나 경쟁자 스펙은 생성하지 않습니다.</div>
        {a.final_score && <div className="mt-2 text-xs text-slate-500">{a.final_score.text} <EvidenceLink rid={rid} ev={{ ...a.final_score, verified: a.final_score.evidence_verified }} /></div>}
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/simulator" className={btnPrimary}><Calculator size={15} />가점 시뮬레이션</Link>
        <Link to="/roadmap" className={btnGhost}><Map size={15} />맞춤 로드맵 생성</Link>
      </div>
    </div>
  )
}
