import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowUpRight, Plus, X } from 'lucide-react'
import { api } from '../api'
import { ErrorBox, EvidenceToggle, Loading, Note, Section, Sheet, Status, Tabs, btnLine, btnPrimary, btnSoft, input, useApi } from '../components/ui'

export default function Spec() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'analysis'
  return (
    <div>
      <Tabs tabs={[{ key: 'analysis', label: '분석' }, { key: 'sim', label: '가점 시뮬레이터' }, { key: 'edit', label: '스펙 편집' }]} value={tab} onChange={(k) => setSp({ tab: k })} />
      {tab === 'analysis' && <Analysis />}
      {tab === 'sim' && <Simulator />}
      {tab === 'edit' && <Edit onSaved={() => setSp({ tab: 'analysis' })} />}
    </div>
  )
}

/* ------------------------------------------------ 분석 */
function Analysis() {
  const [a, setA] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [vers, setVers] = useState<any>(null)
  const [rid0, setRid] = useState<string | null>(null)
  useEffect(() => { api('/rule-versions/korail').then((v) => { setVers(v); setRid(v.default) }).catch((e) => setErr(e.message)) }, [])
  useEffect(() => { if (rid0) { setA(null); api('/analysis', { method: 'POST', json: { recruitment_id: rid0 } }).then(setA).catch((e) => setErr(e.message)) } }, [rid0])
  if (err) return <ErrorBox error={err} />
  if (!a) return <Loading text="공식 공고 기준으로 분석 중" />
  const r = a.recruitment, b = a.bonus, rid = r.id
  const ev = (e: any) => e && ({ doc: e.doc, page: e.page, quote: e.quote, verified: e.evidence_verified ?? e.verified })
  const preview = a.rule_version?.type === '사전예고'
  const ds = a.document_screening

  return (
    <div className="grid gap-x-16 gap-y-14 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-14">
        <div>
          {vers?.versions?.length > 1 && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-sub">분석 기준</span>
              {vers.versions.map((v: any) => (
                <button key={v.recruitment_id} onClick={async () => { await api('/active', { method: 'PUT', json: { recruitment_id: v.recruitment_id } }); setRid(v.recruitment_id) }}
                  className={`rounded-full px-4 py-1.5 text-[13.5px] ${v.recruitment_id === rid ? 'bg-accent text-white' : 'bg-white hover:bg-lav'}`}>
                  {v.year} {v.type === '사전예고' ? '사전예고' : '확정 공고'}{v.year === vers.target_year ? ' · 목표 연도' : ''}
                </button>
              ))}
            </div>
          )}
          <div className="text-[13px] text-sub">{r.company} · {r.job_category} · {preview ? '공식 사전예고(최종 공고 아님)' : '확정 채용공고'}</div>
          <h1 className="mt-1 text-[26px] font-semibold">{r.recruitment_title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 text-[14px] text-sub">
            <span>공식 발표 {r.published_at}</span>
            <Status s={a.eligibility.overall.startsWith('지원 자격 충족') ? '충족' : a.eligibility.overall.startsWith('지원 불가') ? '미충족' : '확인 필요'} />
            <a className="inline-flex items-center gap-0.5 text-accent-ink" href={r.official_source.url} target="_blank" rel="noreferrer">공식 원문<ArrowUpRight size={13} /></a>
          </p>
        </div>
        <Note>{r.status_note}</Note>

        {ds?.available && (
          <Section title="서류전형 점수 (2027 사전예고 기준)" action={<span className="text-[12.5px] text-sub">100점 만점 · 채용인원 {ds.selection_ratio}배수 선발</span>}>
            <div className="grid gap-6 sm:grid-cols-3">
              <div><div className="text-[13px] text-sub">어학 ({ds.weights.language}점)</div><div className="mt-1 text-[24px]">{ds.language_points}</div>
                {ds.language_points_if_valid != null && <div className="text-[12.5px] text-butter-ink">유효기간 확인 시 {ds.language_points_if_valid}점</div>}</div>
              <div><div className="text-[13px] text-sub">자격증 ({ds.weights.cert}점, 원점수×{ds.weights.multiplier})</div><div className="mt-1 text-[24px]">{ds.cert_points}</div>
                <div className="text-[12.5px] text-sub">원점수 {ds.cert_raw} / 20 · 예상</div></div>
              <div><div className="text-[13px] text-sub">합계</div><div className="mt-1 text-[24px] font-semibold">{ds.total}</div>
                {ds.total_if_language_valid != null && <div className="text-[12.5px] text-butter-ink">조건부 {ds.total_if_language_valid}점</div>}</div>
            </div>
            <div className="mt-6 divide-y divide-line text-[14px]">
              {ds.languages.map((l: any, i: number) => (
                <div key={i} className="grid gap-1 py-3 sm:grid-cols-[180px_160px_1fr]">
                  <span>{l.test} {l.score}</span><Status s={l.status} />
                  <span className="text-[13px] text-sub">{l.conversion ? l.conversion + ' · ' : ''}{l.reason}{l.selected ? ' · 반영' : ''}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1 text-[12.5px] text-sub">
              <p>{ds.formula} <EvidenceToggle rid={rid} ev={ev(ds.evidence.formula_evidence)} /></p>
              <p>유효기간: 성적 취득일로부터 2년, 국가공무원채용시스템 사전등록 성적은 해당 시스템 인정기간까지 <EvidenceToggle rid={rid} ev={ev(ds.language_evidence.validity_evidence)} /></p>
              <p>{ds.cert_list_status}</p>
              {ds.reference_date_provisional && <p className="text-butter-ink">판단 기준일 미발표 → 오늘({ds.reference_date}) 기준 잠정 판단</p>}
              <p>{ds.intern_note} <EvidenceToggle rid={rid} ev={ev(ds.evidence.intern_exemption)} /></p>
            </div>
          </Section>
        )}

        {a.rule_version?.changes_vs_2026 && (
          <Section title="2026 → 2027 변경 사항">
            <div className="divide-y divide-line text-[14px]">
              {a.rule_version.changes_vs_2026.map((c: any) => (
                <div key={c.item} className="grid gap-1 py-3.5 sm:grid-cols-[120px_1fr_1fr_130px]">
                  <span>{c.item}</span><span className="text-sub">{c.before}</span><span>{c.after}<div><EvidenceToggle rid={rid} ev={ev(c.evidence)} /></div></span>
                  <span className={`text-[12.5px] ${c.status.startsWith('공식') ? 'text-accent-ink' : 'text-butter-ink'}`}>{c.status}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="지원 자격">
          <div className="divide-y divide-line">
            {a.eligibility.items.map((i: any) => (
              <div key={i.id} className="grid gap-2 py-4 sm:grid-cols-[130px_120px_1fr]">
                <div className="text-[14.5px]">{i.item}</div>
                <Status s={i.status} />
                <div className="text-[14px]">
                  <div>{i.reason}</div>
                  <div className="text-[12.5px] text-sub">공고: {i.rule_text}</div>
                  <div className="mt-1"><EvidenceToggle rid={rid} ev={i.evidence} /></div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={preview ? "자격증 원점수 (서류 점수에 반영 · 2026 목록 참고)" : "필기 우대 가점"} action={<span className="text-[12.5px] text-sub">{(b.usage || []).filter((u: any) => u.pool === "일반 자격증").map((u: any) => `${u.group} ${u.used}/${u.cap}`).join(" · ")}</span>}>
          {!preview && <p className="mb-5 text-[13.5px] leading-relaxed text-sub">{b.base_score_note}</p>}
          <div className="divide-y divide-line">
            {b.rows.map((row: any, i: number) => (
              <div key={i} className="grid gap-2 py-4 sm:grid-cols-[180px_70px_1fr]">
                <div className="text-[14.5px]">{row.cert}<div className="text-[12.5px] text-sub">{row.category ? `${row.category} · ${row.grade}` : '목록 외'}</div></div>
                <div className="text-[17px]">{row.points != null ? row.points : '–'}</div>
                <div className="text-[14px]"><Status s={row.status} />{row.note && <div className="text-[12.5px] text-sub">{row.note}</div>}<div className="mt-1"><EvidenceToggle rid={rid} ev={row.evidence} /></div></div>
              </div>
            ))}
            {b.others.map((o: any, i: number) => (
              <div key={`o${i}`} className="grid gap-2 py-4 sm:grid-cols-[180px_70px_1fr]">
                <div className="text-[14.5px]">{o.item}</div><div className="text-[17px]">{o.points ?? '–'}</div>
                <div className="text-[14px]"><Status s={o.status} /><div className="text-[12.5px] text-sub">{o.note}</div><div className="mt-1"><EvidenceToggle rid={rid} ev={o.evidence} /></div></div>
              </div>
            ))}
          </div>
          <details className="mt-6 text-[13.5px]">
            <summary className="text-accent-ink">적용한 공식 계산 규칙</summary>
            <ul className="mt-3 space-y-2 text-sub">
              {b.policy_evidence.map((e: any, i: number) => <li key={i}>{e.quote} <EvidenceToggle rid={rid} ev={ev(e)} /></li>)}
              <li>{b.rail_cert_note}</li>
            </ul>
          </details>
        </Section>

        {a.exam.available && (
          <Section title="출제범위 × 내 준비">
            <div className="grid gap-10 sm:grid-cols-2">
              {[['NCS', a.exam.ncs], [`전공 · ${a.exam.exam.major_name}`, a.exam.major]].map(([t, rows]: any) => (
                <div key={t}>
                  <div className="mb-2 text-[13px] text-sub">{t}</div>
                  {rows.map((x: any) => <div key={x.subject} className="flex justify-between border-b border-line py-2.5 text-[14px]"><span>{x.subject}</span><Status s={x.my_status} /></div>)}
                </div>
              ))}
            </div>
            <p className="mt-5 text-[13px] text-sub">출제 대행사·NCS 유형: 공식 공고에서 확인되지 않음 · <EvidenceToggle rid={rid} ev={ev(a.exam.exam.evidence[2])} label="전공 출제범위 근거" /></p>
            {a.exam.my_subjects_not_in_scope.length > 0 && <div className="mt-5"><Note tone="lav">준비 중인 {a.exam.my_subjects_not_in_scope.join(', ')}은(는) 이 공고의 전공 출제범위 밖이에요. (학습 추천 · 공식 요건 아님)</Note></div>}
          </Section>
        )}
      </div>

      <aside className="space-y-10">
        <Sheet className="px-7 py-6">
          <div className="text-[13px] text-sub">확정 가점</div>
          <div className="mt-1 text-[40px] font-semibold leading-none">{b.total_confirmed}<span className="ml-1 text-[15px] font-normal text-sub">점</span></div>
          <div className="mt-4 text-[13px] text-butter-ink">해석 필요 항목 포함 {b.total_with_interpretation}점</div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-sub">{b.scope_resolution?.[0]?.text}</p>
        </Sheet>
        <div>
          <div className="text-[13px] text-sub">경쟁력</div>
          <div className="mt-1 text-[16px]">{a.competition.judgement}</div>
          <p className="mt-2 text-[13px] leading-relaxed text-sub">{a.competition.note}</p>
          {a.screening && <p className="mt-2 text-[13px]">{a.competition.derived} <EvidenceToggle rid={rid} ev={ev(a.screening.written_pass_evidence)} /></p>}
          <p className="mt-2 text-[12.5px] text-sub">익명 준비생 비교는 실제 이용자 통계가 없어 제공하지 않아요.</p>
        </div>
        <div>
          <div className="text-[13px] text-sub">서류전형</div>
          {a.screening
            ? <p className="mt-1 text-[14px]">자기소개서 적격/부적격 판정이라 서류 점수는 산출하지 않아요. <EvidenceToggle rid={rid} ev={ev(a.screening.evidence)} /></p>
            : <p className="mt-1 text-[14px]">{ds?.available ? `어학+자격증 100점 점수제, ${ds.selection_ratio}배수 선발 (왼쪽 서류 점수 참고)` : '공고 기준 확인 필요'}</p>}
        </div>
        {a.rule_version?.written_exam_note && <div><div className="text-[13px] text-sub">필기시험</div><p className="mt-1 text-[13.5px] text-sub">{a.rule_version.written_exam_note}</p></div>}
        <div>
          <div className="text-[13px] text-sub">공식 공고에서 확인되지 않은 정보</div>
          <p className="mt-1 text-[13.5px] leading-relaxed text-sub">{a.not_found.join(' · ')}</p>
        </div>
      </aside>
    </div>
  )
}

/* ------------------------------------------------ 시뮬레이터 */
function Simulator() {
  const opts = useApi<any[]>(`/simulate/options`)
  const [sel, setSel] = useState<string[]>([])
  const [res, setRes] = useState<any>(null)
  const key = (o: any) => `${o.name}|${o.grade}`
  useEffect(() => {
    if (!opts.data) return
    const add = opts.data.filter((o) => sel.includes(key(o))).map((o) => ({ name: o.name, grade: o.grade }))
    api('/simulate', { method: 'POST', json: { add_certificates: add } }).then(setRes).catch(() => {})
  }, [sel, opts.data])
  if (!opts.data || !res) return <Loading />
  return (
    <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-10">
        <p className="text-[14px] text-sub">취득을 고려하는 자격증을 골라 보세요. 동일 종별·영역별 개수·상한 규칙을 그대로 적용해요.</p>
        {['공통직무', '안전', '직렬별'].map((g) => (
          <Section key={g} title={<>{g}{g === '직렬별' && <span className="ml-2 text-[12.5px] font-normal text-butter-ink">해석 필요</span>}</>}>
            <div className="flex flex-wrap gap-2">
              {opts.data!.filter((o) => o.category === g).map((o) => {
                const on = sel.includes(key(o))
                return <button key={key(o)} onClick={() => setSel(on ? sel.filter((x) => x !== key(o)) : [...sel, key(o)])}
                  className={`rounded-full px-4 py-2 text-[13.5px] transition ${on ? 'bg-accent text-white' : 'bg-white text-ink hover:bg-lav'}`}>{o.name} {o.grade} <span className={on ? 'text-white/80' : 'text-sub'}>{o.points}</span></button>
              })}
            </div>
          </Section>
        ))}
      </div>
      <aside className="space-y-8">
        <Sheet tone="lav" className="px-7 py-6">
          <div className="text-[13px] text-[#6d6696]">시뮬레이션 후 확정 가점</div>
          <div className="mt-1 text-[40px] font-semibold leading-none">{res.simulated.total_confirmed}</div>
          <div className="mt-3 text-[13.5px]">현재 {res.current.total_confirmed} → <span className="text-accent-ink">+{res.delta_confirmed}</span></div>
          <div className="mt-1 text-[12.5px] text-[#6d6696]">해석 필요 포함 {res.simulated.total_with_interpretation} (+{res.delta_with_interpretation})</div>
        </Sheet>
        <div className="divide-y divide-line text-[13.5px]">
          {res.simulated.rows.map((r: any, i: number) => <div key={i} className="flex justify-between gap-3 py-2.5"><span>{r.cert}{r.hypothetical && <span className="ml-1 text-accent-ink">가상</span>}</span><Status s={r.status} /></div>)}
        </div>
        <p className="text-[12.5px] leading-relaxed text-sub">같은 영역이 이미 채워져 있으면 추가 자격증을 따도 가점이 늘지 않을 수 있어요.</p>
      </aside>
    </div>
  )
}

/* ------------------------------------------------ 스펙 편집 */
const LEVELS = ['준비 완료', '복습 필요', '준비 중', '보완 필요', '취약', '미시작']
const NCS = ['의사소통능력', '수리능력', '문제해결능력']
const MAJOR = ['운영체제', '데이터베이스', '데이터통신', '소프트웨어공학', '정보보호개론', '컴퓨터구조', '자료구조', '알고리즘', '인공지능']
export const COMP = [{ id: 'korail', name: '한국철도공사' }, { id: 'kepco', name: '한국전력공사' }, { id: 'seoulmetro', name: '서울교통공사' }]

const RECENT_KEY = 'pc-recent-inst-search'
function loadRecent(): string[] { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] } }
function pushRecent(q: string) { try { const r = [q, ...loadRecent().filter((x) => x !== q)].slice(0, 6); localStorage.setItem(RECENT_KEY, JSON.stringify(r)) } catch { /* ignore */ } }

export function TargetSearch({ onPick, saved }: { onPick: (org: string, url: string, title: string, group?: string) => void; onQuick?: (id: string) => void; saved?: { name: string; job?: string; onClick: () => void }[] }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [all, setAll] = useState<any>(null)
  const [group, setGroup] = useState('전체')
  const [showAll, setShowAll] = useState(false)
  const [recent, setRecent] = useState<string[]>(loadRecent())
  const run = async (term: string) => {
    const t = term.trim(); if (!t) return
    setBusy(true)
    try { setRes(await api(`/institutions?q=${encodeURIComponent(t)}`)); pushRecent(t); setRecent(loadRecent()) } catch { setRes({ total: 0, results: [] }) } finally { setBusy(false) }
  }
  useEffect(() => { if (showAll || (res && res.total === 0)) api(`/institutions?group=${encodeURIComponent(group)}`).then(setAll).catch(() => {}) }, [showAll, res, group])
  const Row = ({ i }: { i: any }) => (
    <div className="flex items-center justify-between gap-2 py-2.5 text-[14px]">
      <div className="min-w-0">
        <span className="font-semibold">{i.name}</span>
        <span className={`ml-2 rounded px-1.5 py-0.5 text-[11px] ${i.group === '중앙 공공기관' ? 'bg-lav text-accent-ink' : 'bg-sage text-sage-ink'}`}>{i.group}</span>
        {i.match && <span className="ml-2 text-[12px] text-sub">{i.match}</span>}
      </div>
      <button className={`${btnSoft} shrink-0 whitespace-nowrap`} onClick={() => onPick(i.name, '', '', i.group)}>목표로 설정</button>
    </div>
  )
  const empty = res && res.total === 0
  return (
    <div className="mb-4 rounded-2xl border border-[#E2DBFA] bg-[#FBFAFF] p-4">
      <form onSubmit={(e) => { e.preventDefault(); run(q) }} className="flex gap-2">
        <input className={`${input} min-w-0 flex-1`} value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setRes(null) }} placeholder="기관명·약칭 (예: 한수원, 마사회, 인국공)" autoFocus />
        <button type="submit" className={`${btnPrimary} shrink-0 whitespace-nowrap !rounded-xl`} disabled={busy || !q.trim()}>{busy ? '검색 중…' : '검색'}</button>
      </form>
      {res && res.total > 0 && <div className="mt-2 max-h-72 divide-y divide-line overflow-auto">{res.results.map((i: any) => <Row key={i.name} i={i} />)}</div>}
      {empty && <p className="mt-2 text-[13px] text-butter-ink">‘{q}’와 일치하는 공공기관이 없어요. 아래 전체 기관 목록에서 찾아보세요.</p>}
      {!res && !q && recent.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[12.5px] text-sub">최근 검색</div>
          <div className="flex flex-wrap gap-1.5">{recent.map((r) => <button key={r} onClick={() => { setQ(r); run(r) }} className="rounded-full bg-white px-3 py-1 text-[13px] hover:bg-lav">{r}</button>)}</div>
        </div>
      )}
      {!res && !q && saved && saved.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[12.5px] text-sub">저장한 목표 기업</div>
          <div className="flex flex-wrap gap-1.5">{saved.map((s) => <button key={s.name} onClick={s.onClick} className="rounded-full bg-white px-3 py-1 text-[13px] hover:bg-lav">{s.name}{s.job ? ` · ${s.job}` : ''}</button>)}</div>
        </div>
      )}
      {(showAll || empty) && (
        <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
          {['전체', '중앙 공공기관', '지방공공기관'].map((g) => <button key={g} onClick={() => setGroup(g)} className={`rounded-full px-3 py-1 ${group === g ? 'bg-accent text-white' : 'bg-white hover:bg-lav'}`}>{g}</button>)}
        </div>
      )}
      {(showAll || empty) && all && (
        <>
          <div className="mt-2 max-h-72 divide-y divide-line overflow-auto rounded-xl bg-white px-3">{all.results.map((i: any) => <Row key={i.name} i={i} />)}</div>
          <p className="mt-1 text-[11.5px] text-sub">{all.total}개 · 중앙: ALIO 기관 목록({all.sources.central.checked_at}) · 지방: {all.sources.local.note}</p>
        </>
      )}
      {!empty && <button onClick={() => setShowAll(!showAll)} className="mt-3 text-[12.5px] text-accent-ink underline underline-offset-4">{showAll ? '전체 기관 목록 닫기' : '전체 기관 목록 보기'}</button>}
    </div>
  )
}

function F({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[12.5px] text-sub">{label}</span>{children}</label>
}

function Edit({ onSaved }: { onSaved: () => void }) {
  const [p, setP] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => { api('/profile').then(setP).catch((e) => setErr(e.message)) }, [])
  if (err) return <ErrorBox error={err} />
  if (!p) return <Loading />
  const set = (k: string, v: any) => setP({ ...p, [k]: v })
  const setIn = (k: string, i: number, f: string, v: any) => { const a = [...(p[k] || [])]; a[i] = { ...a[i], [f]: v }; set(k, a) }
  const add = (k: string, o: any) => set(k, [...(p[k] || []), o])
  const del = (k: string, i: number) => set(k, p[k].filter((_: any, j: number) => j !== i))
  const save = async () => { try { setP(await api('/profile', { method: 'PUT', json: p })); onSaved() } catch (e: any) { setErr(e.message) } }
  const reset = async () => setP(await api('/profile/reset-demo', { method: 'POST' }))
  const Add = ({ onClick }: { onClick: () => void }) => <button onClick={onClick} className="inline-flex items-center gap-1 text-[13px] text-accent-ink"><Plus size={14} />추가</button>
  const Del = ({ onClick }: { onClick: () => void }) => <button onClick={onClick} className="p-2 text-[#c0bcb3] hover:text-rose-ink"><X size={15} /></button>

  return (
    <div className="max-w-[880px] space-y-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-sub">이 서버의 로컬 DB에만 저장돼요. 실명·연락처는 입력하지 마세요.</p>
        <div className="flex gap-2"><button className={btnLine} onClick={reset}>데모 데이터</button><button className={btnPrimary} onClick={save}>저장하고 분석</button></div>
      </div>
      <Section title="기본 정보">
        <div className="grid gap-5 sm:grid-cols-3">
          <F label="닉네임"><input className={input} value={p.nickname || ''} onChange={(e) => set('nickname', e.target.value)} /></F>
          <F label="출생연도"><input className={input} type="number" value={p.birth_year || ''} onChange={(e) => set('birth_year', Number(e.target.value) || null)} /></F>
          <F label="병역"><select className={input} value={p.military_status || ''} onChange={(e) => set('military_status', e.target.value)}><option value="">선택</option>{['군필', '면제', '해당없음', '복무중', '미필'].map((x) => <option key={x}>{x}</option>)}</select></F>
          <F label="전공"><input className={input} value={p.major || ''} onChange={(e) => set('major', e.target.value)} /></F>
          <F label="졸업 여부"><select className={input} value={p.graduation_status || ''} onChange={(e) => set('graduation_status', e.target.value)}>{['재학', '졸업예정', '졸업', '휴학'].map((x) => <option key={x}>{x}</option>)}</select></F>
          <F label="학점 / 만점"><div className="flex gap-2"><input className={input} type="number" step="0.01" value={p.gpa ?? ''} onChange={(e) => set('gpa', Number(e.target.value))} /><input className={input} type="number" step="0.1" value={p.gpa_scale ?? ''} onChange={(e) => set('gpa_scale', Number(e.target.value))} /></div></F>
          <F label="주간 학습 시간"><input className={input} type="number" value={p.weekly_hours ?? ''} onChange={(e) => set('weekly_hours', Number(e.target.value))} /></F>
          <F label="월 준비 예산(원)"><input className={input} type="number" value={p.monthly_budget ?? ''} onChange={(e) => set('monthly_budget', Number(e.target.value))} /></F>
          <F label="목표 시기"><input className={input} value={p.target_period || ''} onChange={(e) => set('target_period', e.target.value)} /></F>
        </div>
      </Section>
      <Section title="목표 기업" action={<Add onClick={() => setSearchOpen(!searchOpen)} />}>
        {searchOpen && (
          <TargetSearch
            onPick={(org: string, _url: string, _title: string, group?: string) => { add('targets', { company_id: COMP.find((c) => c.name === org)?.id || `org:${org}`, company_name: org, institution_group: group, job_category: '', recruitment_type: '신입', priority: (p.targets?.length || 0) + 1 }); setSearchOpen(false) }}
            onQuick={(id: string) => { add('targets', { company_id: id, company_name: COMP.find((c) => c.id === id)?.name, job_category: '', recruitment_type: '신입', priority: (p.targets?.length || 0) + 1 }); setSearchOpen(false) }}
          />
        )}
        <div className="mb-2 hidden grid-cols-[70px_1fr_1fr_90px_36px] gap-2 px-1 text-[12px] text-sub sm:grid"><span>우선순위</span><span>기업</span><span>직렬 (공고 기준 명칭)</span><span>채용 유형</span><span /></div>
        {(p.targets || []).map((t: any, i: number) => (
          <div key={i} className="mb-2 grid grid-cols-[70px_1fr_1fr_90px_36px] items-center gap-2">
            <input className={input} type="number" min={1} value={t.priority ?? i + 1} onChange={(e) => setIn('targets', i, 'priority', Number(e.target.value))} title="우선순위" />
            {COMP.find((c) => c.id === t.company_id)
              ? <select className={input} value={t.company_id} onChange={(e) => setIn('targets', i, 'company_id', e.target.value)}>{COMP.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              : <div className="truncate rounded-xl border border-line bg-[#F8F7FC] px-3.5 py-2.5 text-[14px]" title={t.source_title}>{t.company_name || t.company_id}<a href={`/jobs?q=${encodeURIComponent(t.company_name || '')}`} className="ml-2 text-[12px] text-accent-ink">공고 조회</a></div>}
            <input className={input} placeholder="직렬" value={t.job_category} onChange={(e) => setIn('targets', i, 'job_category', e.target.value)} />
            <select className={input} value={t.recruitment_type} onChange={(e) => setIn('targets', i, 'recruitment_type', e.target.value)}>{['신입', '인턴', '경력'].map((x) => <option key={x}>{x}</option>)}</select>
            <Del onClick={() => del('targets', i)} />
          </div>
        ))}
        <p className="mt-2 text-[12.5px] text-sub">맨 앞 숫자가 우선순위예요. 통합 취업 전략 계산에 쓰여요.</p>
      </Section>
      <Section title="자격증" action={<Add onClick={() => add('certificates', { name: '', grade: '', acquired_at: '', has_validity: false, expires_at: '', issuer: '' })} />}>
        <div className="mb-2 hidden grid-cols-[1.5fr_0.7fr_1fr_1.3fr_36px] gap-2 px-1 text-[12px] text-sub sm:grid">
          <span>자격증명</span><span>등급</span><span>취득일 (공고 기준일 판단)</span><span>유효기간 (해당 자격증만)</span><span />
        </div>
        {(p.certificates || []).map((c: any, i: number) => (
          <div key={i} className="mb-2 grid grid-cols-[1.5fr_0.7fr_1fr_1.3fr_36px] items-center gap-2">
            <input className={input} placeholder="예: 정보처리기사" value={c.name} onChange={(e) => setIn('certificates', i, 'name', e.target.value)} />
            <input className={input} placeholder="예: 1급" value={c.grade} onChange={(e) => setIn('certificates', i, 'grade', e.target.value)} />
            <input className={input} type="date" aria-label="취득일" value={c.acquired_at || ''} onChange={(e) => setIn('certificates', i, 'acquired_at', e.target.value)} />
            <div className="flex items-center gap-2">
              <label className="flex shrink-0 items-center gap-1 text-[12.5px] text-sub"><input type="checkbox" checked={!!c.has_validity} onChange={(e) => setIn('certificates', i, 'has_validity', e.target.checked)} />있음</label>
              {c.has_validity && <input className={input} type="date" aria-label="유효기간 만료일" value={c.expires_at || ''} onChange={(e) => setIn('certificates', i, 'expires_at', e.target.value)} />}
            </div>
            <Del onClick={() => del('certificates', i)} />
          </div>
        ))}
        <p className="mt-1 text-[12px] text-sub">자격증 자체의 유효기간과 채용공고의 인정 기준일은 다르게 판단해요. 취득일이 공고 기준일 이후면 그 공고에서는 인정되지 않아요.</p>
      </Section>
      <Section title="어학성적" action={<Add onClick={() => add('languages', { test: '', score: '', exam_date: '', original_expiry_date: '', preregistration_status: '미등록', preregistration_date: '', preregistration_expiry_date: '' })} />}>
        <div className="mb-2 hidden grid-cols-[1.2fr_0.9fr_1fr_1fr_36px] gap-2 px-1 text-[12px] text-sub sm:grid">
          <span>시험명</span><span>점수·등급</span><span>응시일</span><span>기존 만료일 (성적표 기준)</span><span />
        </div>
        {(p.languages || []).map((c: any, i: number) => (
          <div key={i} className="mb-3 rounded-2xl border border-line p-3">
            <div className="grid grid-cols-[1.2fr_0.9fr_1fr_1fr_36px] items-center gap-2">
              <select className={input} value={c.test} onChange={(e) => setIn('languages', i, 'test', e.target.value)}>
                {['', 'TOEIC', 'TOEIC Speaking', 'TEPS', 'OPIc', 'JPT', 'HSK', 'IELTS', 'TOEFL', '기타'].map((x) => <option key={x} value={x}>{x || '선택'}</option>)}
              </select>
              <input className={input} placeholder={c.test === 'TOEIC Speaking' || c.test === 'OPIc' ? '등급 예: IH' : '점수 예: 860'} value={c.score} onChange={(e) => setIn('languages', i, 'score', e.target.value)} />
              <input className={input} type="date" aria-label="응시일" value={c.exam_date || ''} onChange={(e) => setIn('languages', i, 'exam_date', e.target.value)} />
              <input className={input} type="date" aria-label="기존 만료일" value={c.original_expiry_date || ''} onChange={(e) => setIn('languages', i, 'original_expiry_date', e.target.value)} />
              <Del onClick={() => del('languages', i)} />
            </div>
            {c.legacy_date && <p className="mt-2 text-[12.5px] text-butter-ink">이전에 입력한 날짜 {c.legacy_date}가 응시일인지 만료일인지 알 수 없어 반영하지 않았어요. 위 칸에 다시 입력해 주세요.</p>}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
              <label className="flex items-center gap-2"><input type="checkbox" checked={c.preregistration_status === '등록 완료(사용자 입력)'} onChange={(e) => setIn('languages', i, 'preregistration_status', e.target.checked ? '등록 완료(사용자 입력)' : '미등록')} />어학성적 사전등록 완료</label>
              <a href="https://career.gosi.kr/" target="_blank" rel="noreferrer" className="text-[12.5px] text-accent-ink underline underline-offset-4">통합채용포털</a>
              {c.preregistration_status === '등록 완료(사용자 입력)' && (
                <>
                  <span className="text-sub">사전등록일</span><input className={`${input} !w-40`} type="date" value={c.preregistration_date || ''} onChange={(e) => setIn('languages', i, 'preregistration_date', e.target.value)} />
                  <span className="text-sub">인정기간 만료일</span><input className={`${input} !w-40`} type="date" value={c.preregistration_expiry_date || ''} onChange={(e) => setIn('languages', i, 'preregistration_expiry_date', e.target.value)} />
                  <span className="text-[12px] text-sub">사용자 입력 정보 · 정부 시스템에서 직접 확인한 값이 아님(확인서 기준으로 입력)</span>
                </>
              )}
            </div>
          </div>
        ))}
        <p className="mt-1 text-[12px] text-sub">기업마다 사전등록 성적 인정 여부·기간이 달라요. 분석 화면에서 공고 기준으로 따로 판단해요.</p>
      </Section>
      <Section title="준비 상태">
        <div className="grid gap-x-10 gap-y-2 sm:grid-cols-2">
          {NCS.map((s) => <Lvl key={s} s={s} v={p.ncs_status?.[s]} on={(v) => set('ncs_status', { ...p.ncs_status, [s]: v })} />)}
          {Array.from(new Set([...MAJOR, ...Object.keys(p.major_status || {})])).map((s) => (
            <Lvl key={s} s={s} v={p.major_status?.[s]} optional on={(v) => { const m = { ...p.major_status }; if (v) m[s] = v; else delete m[s]; set('major_status', m) }} />
          ))}
        </div>
      </Section>
      <Section title="인턴 · 본인 확인">
        <div className="grid gap-5 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={!!p.intern?.is_korail_experience_intern} onChange={(e) => set('intern', { ...p.intern, is_korail_experience_intern: e.target.checked })} />코레일 체험형 인턴</label>
          <F label="인턴 근무 직렬"><input className={input} value={p.intern?.job_category || ''} onChange={(e) => set('intern', { ...p.intern, job_category: e.target.value })} /></F>
          <F label="수료일"><input className={input} type="date" value={p.intern?.completed_at || ''} onChange={(e) => set('intern', { ...p.intern, completed_at: e.target.value })} /></F>
        </div>
        <label className="mt-5 flex items-start gap-2 text-[14px]"><input className="mt-1.5" type="checkbox" checked={!!p.self_declarations?.etc} onChange={(e) => set('self_declarations', { ...p.self_declarations, etc: e.target.checked })} />
          코레일 공고 ‘기타사항’(현장 업무 가능, 결격사유 미해당, 발표일 이후 근무 가능)을 직접 확인했어요.</label>
      </Section>
    </div>
  )
}

function Lvl({ s, v, on, optional }: { s: string; v?: string; on: (v: string) => void; optional?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2 text-[14px]"><span>{s}</span>
      <select className="rounded-lg bg-transparent py-1 text-right text-[13.5px] text-sub outline-none" value={v || ''} onChange={(e) => on(e.target.value)}>
        {optional ? <option value="">해당 없음</option> : null}{LEVELS.map((x) => <option key={x}>{x}</option>)}
      </select>
    </div>
  )
}
