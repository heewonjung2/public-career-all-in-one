import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ExternalLink, Link2, Search, Sparkles, Upload } from 'lucide-react'
import { api } from '../api'
import { Card, Empty, ErrorBox, Loading, PageHeader, Pill, VerifiedBadge, btnGhost, btnPrimary, input, useApi } from '../components/ui'

export default function Recruitments() {
  const recs = useApi<any[]>('/recruitments')
  const companies = useApi<any[]>('/companies')
  const [q, setQ] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [year, setYear] = useState('')
  const [url, setUrl] = useState('')
  const [company, setCompany] = useState('korail')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)

  const list = useMemo(() => (recs.data || []).filter((r) =>
    (!q || `${r.company} ${r.recruitment_title} ${r.job_category}`.includes(q)) &&
    (!onlyOpen || r.application_status === '접수 중') &&
    (!year || String(r.recruitment_year) === year)), [recs.data, q, onlyOpen, year])

  const verify = async () => {
    setErr(null); setResult(null)
    try { setResult({ verify: await api('/source/verify', { method: 'POST', json: { url, company_id: company } }) }) } catch (e: any) { setErr(e.message) }
  }
  const importUrl = async () => {
    setBusy(true); setErr(null); setResult(null)
    try {
      const r = await api('/recruitments/import', { method: 'POST', json: { url, company_id: company } })
      setResult({ doc: await api(`/documents/${r.document_id}`), imported: r }); recs.reload()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const upload = async (f: File) => {
    setBusy(true); setErr(null); setResult(null)
    const fd = new FormData(); fd.append('file', f)
    try { setResult({ doc: await api('/documents/parse', { method: 'POST', body: fd }) }); recs.reload() } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const aiExtract = async (id: number) => {
    setBusy(true)
    try { setResult({ ...result, ai: await api(`/documents/${id}/ai-extract`, { method: 'POST' }) }) } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  if (recs.loading) return <Loading />
  if (recs.error) return <ErrorBox error={recs.error} />

  return (
    <div>
      <PageHeader title="기업 및 채용공고" desc="JOB-ALIO 등 공식 출처에서 확보하고 원문 대조를 마친 공고만 분석에 사용합니다." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {companies.data?.map((c) => (
          <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 font-semibold text-navy"><Building2 size={16} />{c.name}</div>
            <div className="mt-1 text-xs text-slate-500">{c.data_status}</div>
            <div className="mt-2 text-[11px] text-slate-400">허용 공식 도메인: {c.allowed_domains.join(', ')}</div>
          </div>
        ))}
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input className={`${input} pl-9`} placeholder="기업명·공고명·직렬 검색" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className={`${input} w-32`} value={year} onChange={(e) => setYear(e.target.value)}><option value="">전체 연도</option><option>2026</option></select>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />접수 중인 공고만</label>
        </div>
        <div className="space-y-3">
          {list.length === 0 && <Empty>조건에 맞는 공고가 없습니다. 현재 접수 중인 관심 기업 공고는 확인되지 않았습니다.</Empty>}
          {list.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-slate-500">{r.company} {r.notice_no}</div>
                  <div className="font-semibold text-navy">{r.recruitment_title}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    {r.job_category && <Pill tone="blue">{r.job_category}</Pill>}
                    {r.recruitment_type && <Pill>{r.recruitment_type}</Pill>}
                    {r.headcount && <Pill>{r.job_category?.includes('IT') ? `IT ${r.headcount}명(${r.location})` : `전체 ${r.headcount}명`}</Pill>}
                    <Pill tone={r.application_status === '접수 중' ? 'green' : 'slate'}>{r.application_status}</Pill>
                    {r.application_period?.start && <span className="text-slate-500">접수 {r.application_period.start} ~ {r.application_period.end}</span>}
                  </div>
                </div>
                <VerifiedBadge status={r.official_source?.verification_status} />
              </div>
              {r.status_note && <div className="mt-2 text-xs text-slate-500">{r.status_note}</div>}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span>게시일 {r.published_at || '-'}</span><span>마지막 확인 {r.official_source?.checked_at}</span>
                {r.evidence_check && <span>근거 원문 검증 {r.evidence_check.passed}/{r.evidence_check.checked}</span>}
                <span className="ml-auto flex gap-2">
                  {r.official_source?.url && <a href={r.official_source.url} target="_blank" rel="noreferrer" className={btnGhost}>공식 공고 보기 <ExternalLink size={13} /></a>}
                  {r.analysis_supported && <Link to="/analysis" className={btnPrimary}>내 스펙 분석하기</Link>}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-6" title="공식 원문 등록 (URL 또는 PDF)" icon={<Link2 size={16} />}>
        <div className="grid gap-3 lg:grid-cols-[160px_1fr_auto_auto]">
          <select className={input} value={company} onChange={(e) => setCompany(e.target.value)}>{companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input className={input} placeholder="https://job.alio.go.kr/... 또는 공식 첨부파일 URL" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className={btnGhost} onClick={verify} disabled={!url}>출처 검증만</button>
          <button className={btnPrimary} onClick={importUrl} disabled={!url || busy}>공식 출처 확인 후 수집</button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <label className={`${btnGhost} cursor-pointer`}><Upload size={15} />PDF 업로드<input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
          <span className="text-xs text-slate-500">업로드한 PDF는 공식 원본과 대조하기 전까지 ‘사용자 업로드 자료 · 공식 출처 미검증’으로 표시됩니다. HWP/HWPX는 구현 예정입니다.</span>
        </div>
        {busy && <Loading text="처리 중…" />}
        {err && <div className="mt-3"><ErrorBox error={err} /></div>}
        {result?.verify && <div className={`mt-3 rounded-xl p-3 text-sm ${result.verify.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{result.verify.ok ? '허용' : '차단'}: {result.verify.reason}</div>}
        {result?.doc && (
          <div className="mt-4 rounded-xl border border-slate-200 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-semibold text-navy">{result.doc.file_name}</div><VerifiedBadge status={result.doc.verification_status} /></div>
            <div className="mt-1 text-xs text-slate-500">{result.doc.page_count}페이지 · SHA-256 {result.doc.sha256?.slice(0, 16)}… · {result.doc.verification_note} {result.doc.duplicate && '· 이미 등록된 문서(중복 저장 안 함)'}</div>
            {!result.doc.text_extractable && <div className="mt-2 text-amber-700">텍스트 추출 불가(스캔 PDF 등) - 분석 제한, OCR은 구현 예정</div>}
            <div className="mt-3 text-xs font-semibold text-slate-600">근거 후보 탐색 (키워드 기반, 사람이 확인해야 함)</div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {Object.entries(result.doc.evidence_candidates || {}).map(([k, v]: any) => (
                <div key={k} className="rounded-lg bg-slate-50 p-2"><div className="text-xs font-semibold text-navy">{k}</div>
                  {v.length ? v.slice(0, 3).map((h: any, i: number) => <div key={i} className="truncate text-xs text-slate-600">p.{h.page} {h.text}</div>) : <div className="text-xs text-slate-400">해당 키워드 없음</div>}</div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button className={btnGhost} onClick={() => aiExtract(result.doc.id)} disabled={busy}><Sparkles size={15} />AI 구조화 추출</button>
              {!result.doc.ai_enabled && <span className="text-xs text-slate-500">ANTHROPIC_API_KEY 미설정 - AI 추출 비활성</span>}
            </div>
            {result.ai && <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(result.ai, null, 2)}</pre>}
          </div>
        )}
      </Card>
    </div>
  )
}
