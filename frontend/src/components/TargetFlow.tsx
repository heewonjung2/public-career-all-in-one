import { useState } from 'react'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { api } from '../api'
import { COMP, TargetSearch } from '../pages/Spec'
import { EvidenceToggle, btnLine, btnPrimary, btnSoft, input } from './ui'

const NAMES: Record<string, string> = { korail: '한국철도공사', kepco: '한국전력공사', seoulmetro: '서울교통공사' }
export const tName = (t: any) => t?.company_name || NAMES[t?.company_id] || t?.company_id

/** 목표 기업 변경: 검색 → 목표로 설정 → 직렬·채용 유형 저장 */
export function TargetPicker({ profile, onDone }: { profile: any; onDone: () => void }) {
  const [picked, setPicked] = useState<any>(null)
  const [job, setJob] = useState('')
  const [rtype, setRtype] = useState('신입')
  const [busy, setBusy] = useState(false)
  const targets = [...(profile.targets || [])].sort((x: any, y: any) => (x.priority || 99) - (y.priority || 99))
  const save = async (t: any, jobName: string, type: string) => {
    setBusy(true)
    const { _updated_at, ...p } = profile
    const exists = (p.targets || []).some((x: any) => x.company_id === t.company_id)
    const targetsNew = exists ? p.targets.map((x: any) => (x.company_id === t.company_id ? { ...x, job_category: jobName || x.job_category, recruitment_type: type } : x))
      : [...(p.targets || []), { ...t, job_category: jobName, recruitment_type: type, priority: (p.targets?.length || 0) + 1 }]
    await api('/profile', { method: 'PUT', json: { ...p, targets: targetsNew, primary_company_id: t.company_id } })
    // 공고를 고르기 전까지는 '공고 선택 필요' 범위(로드맵 없음) — 코레일은 검증 공고 범위를 그대로 사용
    if (t.company_id === 'korail') {
      const a = await api('/active')
      const d = await api('/target/posting', { method: 'POST', json: { company_id: 'korail', company_name: '한국철도공사', posting_id: a.recruitment_id } })
      await api('/target/scope', { method: 'PUT', json: { ...d, job: jobName || d.job } })
    } else {
      await api('/target/scope', { method: 'PUT', json: { company_id: t.company_id, company_name: tName(t), job: jobName || '직렬 미입력', subjects: {}, status: '공고 선택 필요' } })
    }
    setBusy(false); onDone()
  }
  if (picked) return (
    <div className="mb-2 rounded-2xl border border-[#E2DBFA] bg-[#FBFAFF] p-4">
      <div className="text-[15px] font-bold">{tName(picked)}</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px_auto]">
        <input className={input} value={job} onChange={(e) => setJob(e.target.value)} placeholder="지원 직렬 (예: 사무(전산), ICT) — 모르면 공고 선택 후 고를 수 있어요" />
        <select className={input} value={rtype} onChange={(e) => setRtype(e.target.value)}>{['신입', '인턴', '경력'].map((x) => <option key={x}>{x}</option>)}</select>
        <button className={`${btnPrimary} whitespace-nowrap`} disabled={busy} onClick={() => save(picked, job, rtype)}>{busy ? '저장 중…' : '저장'}</button>
      </div>
      <button className="mt-2 text-[12.5px] text-sub underline" onClick={() => setPicked(null)}>다른 기관 고르기</button>
    </div>
  )
  return (
    <TargetSearch
      saved={targets.map((t: any) => ({ name: tName(t), job: t.job_category, onClick: () => save(t, t.job_category || '', t.recruitment_type || '신입') }))}
      onPick={(org: string, _u: string, _t: string, group?: string) => { const ex = targets.find((t: any) => tName(t) === org); setJob(ex?.job_category || ''); setPicked(ex || { company_id: COMP.find((c) => c.name === org)?.id || `org:${org}`, company_name: org, institution_group: group }) }}
    />
  )
}

/** 공고 선택 → 모집 직렬 선택 → 필기 과목(근거) 확인 → 로드맵 만들기 */
export function PostingFlow({ scope, onDone }: { scope: any; onDone: () => void }) {
  const [list, setList] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [dl, setDl] = useState<string | null>(null)
  const [job, setJob] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async () => { setLoading(true); try { setList(await api('/target/postings', { method: 'POST', json: { company_id: scope.company_id, company_name: scope.company_name } })) } finally { setLoading(false) } }
  const pick = async (p: any) => {
    setDl(p.url || p.posting_id); setDetail(null)
    try {
      const d = await api('/target/posting', { method: 'POST', json: { company_id: scope.company_id, company_name: scope.company_name, posting_id: p.posting_id, url: p.url, title: p.title } })
      setDetail(d); setJob((d.jobs || []).includes(scope.job) ? scope.job : (scope.company_id === 'korail' ? d.job : ''))
    } finally { setDl(null) }
  }
  const make = async () => {
    setBusy(true)
    await api('/target/scope', { method: 'PUT', json: { ...detail, job: job || scope.job } })
    if (detail.subjects?.ncs?.length || detail.subjects?.major?.length) await api('/roadmaps', { method: 'POST', json: { weeks: 8 } })
    setBusy(false); onDone()
  }
  if (!list) return <button className={btnSoft} onClick={load} disabled={loading}>{loading ? <><Loader2 size={14} className="animate-spin" />공고 찾는 중…</> : '공고 선택'}</button>
  const ok = detail && (detail.subjects?.ncs?.length || detail.subjects?.major?.length)
  return (
    <div className="mt-4 w-full border-t border-line pt-4">
      <div className="mb-2 text-[14px] font-bold">{scope.company_name} 공식 공고</div>
      {list.message && <p className="text-[13px] text-butter-ink">{list.message}</p>}
      <div className="divide-y divide-line">
        {list.postings.map((p: any) => (
          <div key={p.url + (p.posting_id || '')} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13.5px]">
            <div className="min-w-0"><div className="font-medium">{p.title}</div><div className="text-[12px] text-sub">{p.published_at || '게시일 확인 필요'}{p.type ? ` · ${p.type}` : ''}{p.attachments?.length ? ` · 첨부: ${p.attachments.join(', ')}` : ''}</div></div>
            <div className="flex shrink-0 gap-2">
              <a href={p.url} target="_blank" rel="noreferrer" className={btnLine}>원문 <ArrowUpRight size={13} /></a>
              <button className={btnSoft} onClick={() => pick(p)} disabled={!!dl}>{dl === (p.url || p.posting_id) ? '확인 중…' : '이 공고로'}</button>
            </div>
          </div>
        ))}
        {list.postings.length === 0 && <p className="py-3 text-[13px] text-sub">공식 공고를 찾지 못했어요.</p>}
      </div>
      {detail && (
        <div className="mt-3 rounded-2xl bg-[#F8F7FC] px-5 py-4 text-[13.5px]">
          <div className="font-semibold">{detail.posting_title}</div>
          <label className="mt-2 block text-[12.5px] text-sub">모집 직렬 (공고에 적힌 직렬 선택)</label>
          {(detail.jobs || []).length > 0
            ? <select className={`${input} mt-1`} value={job} onChange={(e) => setJob(e.target.value)}><option value="">선택</option>{detail.jobs.map((j: string) => <option key={j} value={j}>{j}</option>)}</select>
            : <input className={`${input} mt-1`} value={job} onChange={(e) => setJob(e.target.value)} placeholder="공고에서 직렬을 확인하지 못했어요 — 직접 입력" />}
          {detail.job_note && <p className="mt-1 text-[12px] text-sub">{detail.job_note}</p>}
          <div className="mt-3 text-[12.5px] font-semibold">필기 과목 · <span className={ok ? 'text-sage-ink' : 'text-butter-ink'}>{detail.status}</span></div>
          {ok ? (
            <>
              <div className="mt-1">NCS: {detail.subjects.ncs.join(', ') || '-'}</div>
              <div>전공: {detail.subjects.major.join(', ') || '-'}{detail.subjects.law?.length ? ` · ${detail.subjects.law.join(', ')}` : ''}</div>
              <div className="mt-1 text-[12px] text-sub">필기 범위: {detail.subject_source}</div>
              <div className="mt-1 space-y-0.5">{detail.evidence.slice(0, 4).map((e: any, i: number) => detail.evidence_rid
                ? <div key={i}><EvidenceToggle rid={detail.evidence_rid} ev={e} label={`근거: ${e.what} · ${e.doc === 'reference' ? '참고자료' : e.doc.startsWith('ref2026') ? '2026 참고자료' : '공고문'} p.${e.page}`} /></div>
                : <div key={i} className="text-[12px] text-sub">근거: {e.what} p.{e.page} “{e.quote}”</div>)}</div>
            </>
          ) : (
            <div className="mt-1 text-[13px] text-sub">{detail.message} <a className="text-accent-ink underline" href={detail.posting_url} target="_blank" rel="noreferrer">공식 공고 보기</a></div>
          )}
          <button className={`${btnPrimary} mt-3`} disabled={busy || !ok || !job} onClick={make}>{busy ? '만드는 중…' : '로드맵 만들기'}</button>
          {!ok && <button className={`${btnLine} ml-2 mt-3`} disabled={busy || !job} onClick={make}>직렬만 저장</button>}
        </div>
      )}
    </div>
  )
}
