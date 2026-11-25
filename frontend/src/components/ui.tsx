import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, CircleHelp, ExternalLink, FileText, Loader2, MinusCircle, ShieldCheck, X, XCircle } from 'lucide-react'
import { api } from '../api'

export function Card({ title, icon, action, children, className = '' }: { title?: ReactNode; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-navy">{icon}{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function PageHeader({ title, desc, action }: { title: string; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-navy">{title}</h1>
        {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
      </div>
      {action}
    </div>
  )
}

const STATUS: Record<string, { cls: string; icon: ReactNode }> = {
  '충족': { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: <CheckCircle2 size={14} /> },
  '인정': { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: <CheckCircle2 size={14} /> },
  '미충족': { cls: 'bg-rose-50 text-rose-700 ring-rose-200', icon: <XCircle size={14} /> },
  '미인정': { cls: 'bg-rose-50 text-rose-700 ring-rose-200', icon: <XCircle size={14} /> },
  '확인 필요': { cls: 'bg-amber-50 text-amber-700 ring-amber-200', icon: <CircleHelp size={14} /> },
  '확정 계산에만 인정': { cls: 'bg-sky-50 text-sky-700 ring-sky-200', icon: <CheckCircle2 size={14} /> },
  '인정(해석 필요)': { cls: 'bg-amber-50 text-amber-700 ring-amber-200', icon: <CircleHelp size={14} /> },
  '해당 없음': { cls: 'bg-slate-100 text-slate-600 ring-slate-200', icon: <MinusCircle size={14} /> },
  '미반영': { cls: 'bg-slate-100 text-slate-600 ring-slate-200', icon: <MinusCircle size={14} /> },
  '공고에 기준 없음': { cls: 'bg-slate-100 text-slate-600 ring-slate-200', icon: <MinusCircle size={14} /> },
  '가산대상 목록에 없음': { cls: 'bg-slate-100 text-slate-600 ring-slate-200', icon: <MinusCircle size={14} /> },
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] || { cls: 'bg-slate-100 text-slate-600 ring-slate-200', icon: null }
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${s.cls}`}>{s.icon}{status}</span>
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'blue' | 'green' | 'amber' | 'rose' | 'violet' }) {
  const t = {
    slate: 'bg-slate-100 text-slate-600', blue: 'bg-brand-50 text-brand-700', green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700', rose: 'bg-rose-50 text-rose-700', violet: 'bg-violet-50 text-violet-700',
  }[tone]
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>
}

export function VerifiedBadge({ status }: { status?: string }) {
  if (status === 'verified') return <Pill tone="green"><ShieldCheck size={13} />공식 출처 검증</Pill>
  if (status === 'user_upload_unverified') return <Pill tone="amber"><AlertTriangle size={13} />사용자 업로드 · 공식 출처 미검증</Pill>
  if (status === 'official_source_unreviewed') return <Pill tone="blue"><ShieldCheck size={13} />공식 도메인 수집 · 규칙 미검증</Pill>
  return <Pill tone="rose"><AlertTriangle size={13} />검증 실패/미검증</Pill>
}

export function AiBadge() {
  return <Pill tone="violet">추천 · 공식 채용 요건 아님</Pill>
}

export function Loading({ text = '불러오는 중…' }: { text?: string }) {
  return <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="animate-spin" size={16} />{text}</div>
}

export function ErrorBox({ error }: { error: string }) {
  return <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertTriangle size={16} />{error}</div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>
}

export function useApi<T = any>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const load = () => {
    if (!path) return
    setLoading(true)
    api<T>(path).then((d) => { setData(d); setError(null) }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [path, ...deps])
  return { data, error, loading, reload: load, setData }
}

export type Evidence = { doc: string; page: number; quote: string; verified?: boolean }

export function EvidenceLink({ rid, ev, label }: { rid: string; ev?: Evidence | null; label?: string }) {
  const [open, setOpen] = useState(false)
  if (!ev || !ev.quote) return <span className="text-xs text-slate-400">공식 근거 없음</span>
  const docName = ev.doc === 'notice' ? '공고문' : ev.doc === 'reference' ? '참고자료' : ev.doc
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-brand-600 hover:underline">
        <FileText size={13} />{label || `${docName} p.${ev.page}`}
        {ev.verified === false && <span className="text-rose-600">(원문 불일치)</span>}
      </button>
      {open && <EvidenceModal rid={rid} ev={ev} onClose={() => setOpen(false)} />}
    </>
  )
}

function EvidenceModal({ rid, ev, onClose }: { rid: string; ev: Evidence; onClose: () => void }) {
  const { data, error, loading } = useApi<any>(`/evidence/${rid}/${ev.doc}/${ev.page}`)
  const norm = (s: string) => s.replace(/\s+/g, '')
  const lines: string[] = data?.text?.split('\n') || []
  const q = norm(ev.quote)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <div className="text-xs text-slate-500">공식 원문 근거 · 페이지 {ev.page}</div>
            <div className="mt-1 font-semibold text-navy">{data?.document_name || '문서'}</div>
            <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">“{ev.quote}”</div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {ev.verified !== false ? <Pill tone="green"><ShieldCheck size={13} />원문 존재 확인됨(코드 검증)</Pill> : <Pill tone="rose">원문 불일치</Pill>}
              {data?.document_url && <a className="inline-flex items-center gap-1 text-brand-600 hover:underline" href={data.document_url} target="_blank" rel="noreferrer">공식 첨부파일 원본 <ExternalLink size={12} /></a>}
              <a className="inline-flex items-center gap-1 text-brand-600 hover:underline" href={`/api/documents/${rid}/${ev.doc}/file#page=${ev.page}`} target="_blank" rel="noreferrer">보관본 PDF 열기 <ExternalLink size={12} /></a>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="overflow-auto p-5 font-mono text-[12.5px] leading-relaxed text-slate-700">
          {loading && <Loading />}
          {error && <ErrorBox error={error} />}
          {lines.map((l, i) => {
            const hit = norm(l).length > 3 && (q.includes(norm(l)) || norm(l).includes(q))
            return <div key={i} className={hit ? 'rounded bg-amber-100 px-1' : 'px-1'}>{l || ' '}</div>
          })}
        </div>
      </div>
    </div>
  )
}

export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between text-sm text-slate-500">{label}<span className="text-brand-500">{icon}</span></div>
      <div className="mt-2 text-2xl font-bold text-navy">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

export const btn = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50'
export const btnPrimary = `${btn} bg-brand-600 text-white hover:bg-brand-700`
export const btnGhost = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
export const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'
