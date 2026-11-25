import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowUpRight, RefreshCw, Upload } from 'lucide-react'
import { api } from '../api'
import { Empty, ErrorBox, EvidenceToggle, Loading, Note, Section, Sheet, Status, Tabs, btnLine, btnPrimary, btnSoft, input, link, useApi } from '../components/ui'

function CompanySearch({ recent, onOpen }: { recent: any[]; onOpen: (id: string) => void }) {
  const [q, setQ] = useState(() => new URLSearchParams(window.location.search).get('q') || '')
  const [res, setRes] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [an, setAn] = useState<Record<string, any>>({})
  const [anBusy, setAnBusy] = useState<string | null>(null)
  const go = async (e?: any) => {
    e?.preventDefault(); if (!q.trim()) return
    setBusy(true); setRes(null)
    try { setRes(await api('/search/postings', { method: 'POST', json: { q } })) } catch (er: any) { setRes({ status: '검색 실패', message: er.message, results: [] }) } finally { setBusy(false) }
  }
  const analyze = async (url: string) => {
    setAnBusy(url)
    try { const r = await api('/postings/analyze', { method: 'POST', json: { url } }); setAn((m) => ({ ...m, [url]: r })) }
    catch (er: any) { setAn((m) => ({ ...m, [url]: { status: '분석 실패', message: er.message, stages: [] } })) } finally { setAnBusy(null) }
  }
  return (
    <section className="card mb-8 px-7 py-6">
      <h1 className="text-[22px] font-bold">공공기관 채용공고 검색</h1>
      <form onSubmit={go} className="mt-4 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="기관명을 입력하세요 (예: 한국수자원공사)" className={`${input} min-w-0 flex-1 !py-3 !text-[15px]`} />
        <button className={`${btnPrimary} shrink-0 whitespace-nowrap !rounded-xl !px-6`} disabled={busy || !q.trim()}>{busy ? '검색 중…' : '검색'}</button>
      </form>
      {!res && recent.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[14px] font-semibold">최근 채용공고</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((r) => (
              <button key={r.id} onClick={() => onOpen(r.id)} className="rounded-2xl border border-line bg-white px-4 py-3.5 text-left transition hover:border-[#D9D0FA] hover:bg-[#FBFAFF]">
                <div className="text-[12.5px] text-sub">{r.company}</div>
                <div className="mt-0.5 line-clamp-2 text-[14px] font-medium leading-snug">{r.recruitment_title}</div>
                <div className="mt-1.5 text-[12px] text-sub">게시일 {r.published_at}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {res && (
        <div className="mt-5">
          <div className="mb-2 text-[13px] text-sub">{res.status}{res.cached ? ' · 저장된 검색 결과' : ''}{res.elapsed_s ? ` · ${res.elapsed_s}초` : ''}</div>
          {res.message && <Note>{res.message}</Note>}
          <div className="divide-y divide-line">
            {res.results.map((r: any) => {
              const a = an[r.url]
              return (
                <div key={r.url} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lav text-[12px] font-bold text-accent-ink">{(r.org || r.ai_org || '?').replace(/한국|공사|공단/g, '').slice(0, 2)}</span>
                      <div>
                        <div className="text-[13px] text-sub">{r.org || r.ai_org || '기관 확인 필요'} · <span className={r.status === '공식 출처 검증 완료' ? 'text-sage-ink' : 'text-butter-ink'}>{r.status}</span></div>
                        <div className="text-[15px] font-semibold">{r.title || r.ai_title || '제목 확인 필요'}</div>
                        {r.attachments?.length > 0 && <div className="text-[12px] text-sub">첨부: {r.attachments.map((x: any) => x.name).join(', ')}</div>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a href={r.url} target="_blank" rel="noreferrer" className={btnLine}>공식 원문 <ArrowUpRight size={13} /></a>
                      <button className={btnSoft} disabled={anBusy === r.url} onClick={() => analyze(r.url)}>{anBusy === r.url ? '분석 중…' : '공고 분석'}</button>
                    </div>
                  </div>
                  {a && (
                    <div className="mt-3 rounded-2xl bg-[#F8F7FC] px-5 py-4 text-[13.5px]">
                      <div className="font-semibold">{a.status}</div>
                      {a.message && <div className="mt-1 text-sub">{a.message}</div>}
                      <ol className="mt-2 space-y-0.5 text-[12.5px] text-sub">{(a.stages || []).map((s: any, i: number) => <li key={i}>✓ {s.stage} — {s.detail}</li>)}</ol>
                      {a.extraction && (
                        <div className="mt-3 grid gap-4 md:grid-cols-2">
                          <div><div className="mb-1 text-[12.5px] font-semibold">모집 직렬(AI 추출)</div><ul className="space-y-0.5">{a.extraction.job_categories.slice(0, 12).map((j: string, i: number) => <li key={i}>· {j}</li>)}</ul></div>
                          <div><div className="mb-1 text-[12.5px] font-semibold">가점·우대(AI 추출 · 원문 대조)</div><ul className="space-y-0.5">{a.extraction.bonus_rules.slice(0, 10).map((b: any, i: number) => <li key={i}>· {b.item} {b.points ? `(${b.points})` : ''} <span className={b.evidence_verified ? 'text-sage-ink' : 'text-butter-ink'}>{b.evidence_verified ? `원문 일치 p.${b.evidence.page}` : '원문 불일치·확인 필요'}</span></li>)}</ul></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[12px] text-sub">{res.note}</p>
        </div>
      )}
    </section>
  )
}

export default function Jobs() {
  const [sp, setSp] = useSearchParams()
  const recs = useApi<any[]>('/recruitments')
  const act = useApi<any>('/active')
  const id = sp.get('id') || act.data?.recruitment_id || ''
  const tab = sp.get('tab') || 'overview'
  if (recs.loading || act.loading) return <Loading />
  if (recs.error) return <ErrorBox error={recs.error} />
  const list = (recs.data || []).filter((r) => !r.user_document)
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); n.set(k, v); setSp(n) }

  return (
    <>
    <CompanySearch recent={[...list].sort((x, y) => String(y.published_at).localeCompare(String(x.published_at))).slice(0, 4)} onOpen={(rid) => { const n = new URLSearchParams(sp); n.set('id', rid); n.set('tab', 'overview'); setSp(n); setTimeout(() => document.getElementById('posting-detail')?.scrollIntoView({ behavior: 'smooth' }), 50) }} />
    <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside>
        <div className="mb-4 text-[13px] text-sub">검증 완료 공고 (가점 계산 가능)</div>
        <div className="space-y-1">
          {list.map((r) => (
            <button key={r.id} onClick={() => set('id', r.id)} className={`block w-full rounded-2xl px-4 py-3.5 text-left transition ${r.id === id ? 'card' : 'hover:bg-white'}`}>
              <div className="text-[12.5px] text-sub">{r.company} · {r.published_at}</div>
              <div className="mt-0.5 text-[14.5px] leading-snug">{r.recruitment_title}</div>
              <div className="mt-1 text-[12.5px] text-sub">{r.job_category} · {r.application_status}</div>
            </button>
          ))}
        </div>
        <div className="mt-8 px-4 text-[12.5px] leading-relaxed text-sub">위 검색으로 찾은 다른 기관 공고는 AI 추출 후 검토가 필요해 아직 자동 가점 계산에 쓰이지 않아요.</div>
      </aside>
      <div id="posting-detail" className="scroll-mt-24">
        <Tabs tabs={[{ key: 'overview', label: '공고 개요' }, { key: 'changes', label: '변경 이력' }, { key: 'register', label: '원문 등록' }]} value={tab} onChange={(k) => set('tab', k)} />
        {tab === 'overview' && <Overview id={id} />}
        {tab === 'changes' && <Changes id={id} />}
        {tab === 'register' && <Register reload={recs.reload} />}
      </div>
    </div>
    </>
  )
}

function Overview({ id }: { id: string }) {
  const { data: r, error, loading } = useApi<any>(`/recruitments/${id}`, [id])
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const we = r.written_exam
  return (
    <div className="space-y-12">
      <div>
        <div className="text-[13px] text-sub">{r.company} {r.notice_no}</div>
        <h1 className="mt-1 text-[28px] font-semibold leading-snug">{r.recruitment_title}</h1>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13.5px] text-sub">
          <span>게시 {r.published_at}</span><span>{r.job_category}</span>{r.headcount && <span>{r.location ? `${r.location} ${r.headcount}명` : `전체 ${r.headcount}명`}</span>}
          <span>마지막 확인 {r.official_source.checked_at}</span>
          <span className="text-sage-ink">공식 출처 검증 · 근거 {r.evidence_check.passed}/{r.evidence_check.checked} 일치</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href={r.official_source.url} target="_blank" rel="noreferrer" className={btnLine}>JOB-ALIO 원문 <ArrowUpRight size={14} /></a>
          {Object.entries(r.documents).map(([k, d]: any) => <a key={k} href={d.url} target="_blank" rel="noreferrer" className={btnLine}>{k === 'notice' ? '공고문' : '참고자료'} 첨부 <ArrowUpRight size={14} /></a>)}
        </div>
      </div>
      {r.status_note && <Note>{r.status_note}</Note>}
      {we && (
        <Section title="필기시험">
          <div className="grid gap-8 sm:grid-cols-4">
            {[['시험일', we.date], ['시간', `${we.duration_minutes}분`], ['문항', `${we.question_count}문항`], ['과락', '과목별 40% 미만']].map(([k, v]) => (
              <div key={k}><div className="text-[13px] text-sub">{k}</div><div className="mt-1 text-[18px]">{v}</div></div>
            ))}
          </div>
          <dl className="mt-8 divide-y divide-line text-[14.5px]">
            <Row k="NCS" v={we.ncs_subjects.join(', ') + ` (${we.composition.NCS}문항)`} ev={<EvidenceToggle rid={id} ev={tag(we.evidence[1])} />} />
            <Row k={`전공 · ${we.major_name}`} v={we.major_subjects.join(', ') + ` (${we.composition['전공']}문항)`} ev={<EvidenceToggle rid={id} ev={tag(we.evidence[2])} />} />
            <Row k="철도법령" v={`${we.law_scope} (${we.composition['철도법령']}문항)`} ev={<EvidenceToggle rid={id} ev={tag(we.evidence[3])} />} />
            <Row k="출제 대행사" v={<span className="text-sub">{we.agency_note}</span>} />
            <Row k="NCS 유형" v={<span className="text-sub">{we.exam_type_note}</span>} />
          </dl>
        </Section>
      )}
      {r.schedule?.length > 0 && (
        <Section title="공식 일정">
          <dl className="divide-y divide-line text-[14.5px]">
            {r.schedule.map((s: any, i: number) => <Row key={i} k={s.date + (s.end ? ` ~ ${s.end.slice(5)}` : '')} v={s.label} ev={<EvidenceToggle rid={id} ev={tag(s)} />} />)}
          </dl>
        </Section>
      )}
      {r.missing_information?.length > 0 && (
        <Section title="공식 공고에서 확인되지 않은 정보">
          <p className="text-[14px] leading-relaxed text-sub">{r.missing_information.join(' · ')}</p>
        </Section>
      )}
    </div>
  )
}
const tag = (e: any) => e && ({ doc: e.doc, page: e.page, quote: e.quote, verified: e.evidence_verified })

function Row({ k, v, ev }: { k: any; v: any; ev?: any }) {
  return <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr]"><dt className="text-sub">{k}</dt><dd>{v}{ev && <div className="mt-1">{ev}</div>}</dd></div>
}

function Changes({ id }: { id: string }) {
  const versions = useApi<any[]>(`/recruitments/${id}/versions`, [id])
  const changes = useApi<any>(`/recruitments/${id}/changes`, [id])
  const demo = useApi<any>('/demo/correction')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = async () => {
    setBusy(true); setMsg(null)
    try { const r = await api(`/recruitments/${id}/refresh`, { method: 'POST' }); setMsg(`${r.status}${r.detail ? ' · ' + r.detail : ''}`); versions.reload(); changes.reload() }
    catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-14">
      <Section title="이 공고의 버전" action={<button className={btnSoft} onClick={refresh} disabled={busy}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />공식 사이트 다시 확인</button>}>
        {msg && <div className="mb-4"><Note tone="lav">{msg}</Note></div>}
        <div className="divide-y divide-line text-[14px]">
          {versions.data?.map((v) => (
            <div key={v.id} className="grid gap-1 py-4 sm:grid-cols-[90px_1fr_auto]">
              <span className="text-sub">v{v.version_number}</span>
              <span>{v.label} · 게시 {v.published_at || '-'} · 확인 {v.fetched_at?.replace('T', ' ').slice(0, 16)}<div className="text-[12px] text-[#b0aca3]">파일 SHA-256 {v.raw_file_hash?.slice(0, 16)}… · 정규화 텍스트 {v.normalized_text_hash?.slice(0, 16)}…</div></span>
              <Status s={v.verification_status === 'verified' ? '충족' : '확인 필요'} />
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1 text-[13px] text-sub">
          <p>{changes.data?.scheduler?.note}</p>
          {changes.data?.logs?.slice(0, 3).map((l: any) => <p key={l.id}>{l.checked_at.replace('T', ' ')} · {l.status}</p>)}
          {changes.data && !changes.data.changes.length && <p>이 공고에 대해 감지된 정정·변경 사항은 없습니다.</p>}
        </div>
      </Section>

      {demo.data && <DemoDiff d={demo.data} />}
    </div>
  )
}

function DemoDiff({ d }: { d: any }) {
  const [v1, v2] = d.versions
  const color: Record<string, string> = { added: 'bg-sage', deleted: 'bg-rose line-through text-rose-ink', modified: 'bg-butter' }
  return (
    <Section title={<>변경 감지 시연 <span className="ml-2 text-[13px] font-normal text-butter-ink">시연용 가상 문서 · 실제 기관 공고 아님</span></>}>
      <div className="grid gap-6 sm:grid-cols-2">
        {[v1, v2].map((v: any) => (
          <div key={v.version}><div className="text-[12.5px] text-sub">Version {v.version} · {v.published_at}</div><div className="text-[15px]">{v.title}</div><div className="text-[12.5px] text-sub">{v.notice_no} · 근거 {v.evidence_check.passed}/{v.evidence_check.checked}</div></div>
        ))}
      </div>
      <p className="mt-4 text-[13px] text-sub">동일 모집 건 판정: {d.same_recruitment.decision === 'same' ? '동일' : d.same_recruitment.decision} ({d.same_recruitment.reasons.join(', ')}) · 파일 비교: {d.file_compare.status} · 메타데이터만 바꾼 사본: {d.metadata_only_compare.status}</p>

      <table className="mt-8 w-full text-[14px]">
        <thead><tr className="text-left text-[12.5px] text-sub"><th className="pb-3 font-normal">변경 항목</th><th className="pb-3 font-normal">변경 전</th><th className="pb-3 font-normal">변경 후</th><th className="pb-3 font-normal">중요도</th></tr></thead>
        <tbody className="divide-y divide-line">
          {d.items.map((i: any, k: number) => (
            <tr key={k}><td className="py-3.5">{i.field.replace(':', ' · ')}</td><td className="text-sub">{fmt(i.before)}</td><td>{fmt(i.after)}</td>
              <td className={i.severity === '매우 중요' ? 'text-rose-ink' : i.severity === '중요' ? 'text-butter-ink' : 'text-sub'}>{i.severity}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[12px] text-[#b0aca3]">중요도는 서비스 내부 알림 분류 기준입니다.</p>

      <Sheet tone="lav" className="mt-8 px-7 py-6">
        <div className="text-[15px] font-semibold">나에게 미치는 영향</div>
        <ul className="mt-3 space-y-1.5 text-[14px]">{d.impact.items.map((x: any, i: number) => <li key={i}><span className="text-[#6d6696]">{x.type}</span> · {x.text}</li>)}</ul>
        <div className="mt-3 text-[12.5px] text-[#6d6696]">가점(확정) {d.impact.before.bonus} → {d.impact.after.bonus}점 · {d.impact.note}</div>
      </Sheet>

      <div className="mt-8 text-[13px] text-sub">원문 비교</div>
      <div className="mt-3 space-y-1 text-[13.5px]">
        {d.text_diff.map((x: any, i: number) => (
          <div key={i} className={`rounded-lg px-3 py-1.5 ${color[x.type]}`}>{x.type === 'modified' ? <><span className="text-sub line-through">{x.old}</span> → {x.new}</> : (x.new || x.old)}</div>
        ))}
      </div>
    </Section>
  )
}
const fmt = (v: any) => (v == null ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v))

function Register({ reload }: { reload: () => void }) {
  const [url, setUrl] = useState('')
  const [company, setCompany] = useState('korail')
  const [res, setRes] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(null); setRes(null); try { setRes(await fn()); reload() } catch (e: any) { setErr(e.message) } finally { setBusy(false) } }
  const upload = (f: File) => run(async () => { const fd = new FormData(); fd.append('file', f); return { doc: await api('/documents/parse', { method: 'POST', body: fd }) } })
  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-[14px] leading-relaxed text-sub">JOB-ALIO, ALIO, 기관 공식 도메인만 수집해요. 블로그·카페·위장 도메인·내부망 주소는 차단돼요.</p>
      <div className="flex gap-2">
        <select className={`${input} w-40`} value={company} onChange={(e) => setCompany(e.target.value)}><option value="korail">한국철도공사</option><option value="kepco">한국전력공사</option><option value="seoulmetro">서울교통공사</option></select>
        <input className={input} placeholder="공식 공고 또는 첨부파일 URL" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={btnLine} disabled={!url || busy} onClick={() => run(async () => ({ verify: await api('/source/verify', { method: 'POST', json: { url, company_id: company } }) }))}>출처 검증</button>
        <button className={btnPrimary} disabled={!url || busy} onClick={() => run(async () => { const r = await api('/recruitments/import', { method: 'POST', json: { url, company_id: company } }); return { doc: await api(`/documents/${r.document_id}`) } })}>검증 후 수집</button>
        <label className={`${btnSoft} cursor-pointer`}><Upload size={14} />PDF 업로드<input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
      </div>
      {busy && <Loading text="처리 중" />}
      {err && <ErrorBox error={err} />}
      {res?.verify && <Note tone={res.verify.ok ? 'sage' : 'butter'}>{res.verify.ok ? '허용' : '차단'} · {res.verify.reason}</Note>}
      {res?.doc && (
        <div className="space-y-3 text-[14px]">
          <div>{res.doc.file_name} <span className="text-sub">· {res.doc.page_count}쪽 · {res.doc.verification_note}{res.doc.duplicate ? ' · 이미 등록된 문서' : ''}</span></div>
          {!res.doc.text_extractable && <Note>텍스트 추출이 어려운 문서예요. OCR은 구현 예정이에요.</Note>}
          <div className="text-[13px] text-sub">근거 후보(키워드 탐색, 사람이 확인 필요)</div>
          {Object.entries(res.doc.evidence_candidates || {}).map(([k, v]: any) => (
            <div key={k} className="text-[13px]"><span className="text-sub">{k}</span> {v.slice(0, 2).map((h: any) => `p.${h.page} ${h.text}`).join(' / ') || '없음'}</div>
          ))}
          <p className="text-[12.5px] text-sub">AI 구조화 추출은 ANTHROPIC_API_KEY가 설정된 경우에만 실행돼요{res.doc.ai_enabled ? '' : ' (현재 미설정)'}.</p>
        </div>
      )}
      <Empty><a className={link} href="https://job.alio.go.kr" target="_blank" rel="noreferrer">JOB-ALIO에서 공고 찾기</a></Empty>
    </div>
  )
}
