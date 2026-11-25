import { useEffect, useState, type ReactNode } from 'react'
import { ArrowUpRight, ChevronDown, Loader2, X } from 'lucide-react'
import { api } from '../api'

/* ---------- 데이터 훅 ---------- */
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

/* ---------- 레이아웃 기본 요소 ---------- */
export function Section({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="mb-4 flex items-baseline justify-between gap-4">
          {title && <h2 className="text-[17px] font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Sheet({ children, className = '', tone = 'white' }: { children: ReactNode; className?: string; tone?: 'white' | 'lav' | 'sage' | 'butter' }) {
  const bg = { white: 'bg-white', lav: 'bg-lav', sage: 'bg-sage', butter: 'bg-butter' }[tone]
  return <div className={`rounded-3xl ${bg} ${className}`}>{children}</div>
}

export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="mb-10 flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={`-mb-px border-b-2 px-1 pb-3 pr-5 text-[15px] transition ${value === t.key ? 'border-accent text-ink' : 'border-transparent text-sub hover:text-ink'}`}>{t.label}</button>
      ))}
    </div>
  )
}

export function Loading({ text = '불러오는 중' }: { text?: string }) {
  return <div className="flex items-center gap-2 py-16 text-sm text-sub"><Loader2 className="animate-spin" size={15} />{text}</div>
}
export function ErrorBox({ error }: { error: string }) {
  return <div className="rounded-2xl bg-rose px-5 py-4 text-sm text-rose-ink">{error}</div>
}
export function Note({ children, tone = 'butter' }: { children: ReactNode; tone?: 'butter' | 'lav' | 'sage' | 'plain' }) {
  const t = { butter: 'bg-butter text-[#6b5313]', lav: 'bg-lav text-[#4a4280]', sage: 'bg-sage text-[#36603f]', plain: 'text-sub' }[tone]
  return <div className={`rounded-2xl px-5 py-3.5 text-[13.5px] leading-relaxed ${t}`}>{children}</div>
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-sub">{children}</div>
}

/* ---------- 상태 표시: 배지 대신 점 + 텍스트 ---------- */
const DOT: Record<string, string> = {
  '충족': 'bg-sage-ink', '인정': 'bg-sage-ink', '지원 자격 충족(공고 기준)': 'bg-sage-ink', '준비 완료': 'bg-sage-ink', '출제': 'bg-accent',
  '확인 필요': 'bg-butter-ink', '인정(해석 필요)': 'bg-butter-ink', '복습 필요': 'bg-butter-ink', '준비 중': 'bg-butter-ink', '보완 필요': 'bg-butter-ink',
  '미충족': 'bg-rose-ink', '미인정': 'bg-rose-ink', '취약': 'bg-rose-ink', '미시작': 'bg-rose-ink', '미입력': 'bg-[#cfcac0]',
  '확정 계산에만 인정': 'bg-accent',
  '최고점 자격증으로 선택': 'bg-sage-ink', '가점 상한 도달': 'bg-butter-ink', '해당 공고 인정': 'bg-sage-ink', '사전등록 성적으로 인정': 'bg-sage-ink',
  '중복 인정 제한으로 제외': 'bg-[#cfcac0]', '그룹별 인정 개수 제한으로 제외': 'bg-[#cfcac0]', '전체 인정 개수 제한으로 제외': 'bg-[#cfcac0]',
  '지원 직렬 인정 대상 아님': 'bg-rose-ink', '유효기간 만료': 'bg-rose-ink', '해당 공고 미인정': 'bg-rose-ink', '공식 기준 확인 필요': 'bg-butter-ink',
}
export function Status({ s, className = '' }: { s: string; className?: string }) {
  const k = s?.startsWith('확인 필요') ? '확인 필요' : s?.startsWith('지원 불가') ? '미충족' : s
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13.5px] ${className}`}><span className={`h-1.5 w-1.5 rounded-full ${DOT[k] || 'bg-[#cfcac0]'}`} />{s}</span>
}

export const btn = 'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[14px] transition disabled:opacity-40'
export const btnPrimary = `${btn} bg-accent text-white hover:bg-[#9489de]`
export const btnSoft = `${btn} bg-lav text-accent-ink hover:bg-[#e6e1fa]`
export const btnLine = `${btn} border border-line bg-white text-ink hover:bg-[#f6f5f1]`
export const input = 'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[14px] outline-none transition placeholder:text-[#b5b1a8] focus:border-accent'
export const link = 'text-accent-ink hover:underline underline-offset-4'

/* ---------- 공식 근거: 항목 옆에서 펼쳐 보기 ---------- */
export type Evidence = { doc: string; page: number; quote: string; verified?: boolean }
const DOC_NAMES: Record<string, string> = { notice: '공고문', reference: '참고자료', ref2026_notice: '2026 공고문(과거 참고)', ref2026_reference: '2026 참고자료(과거 참고)' }
const docName = (d: string) => DOC_NAMES[d] || d

export function EvidenceToggle({ rid, ev, label }: { rid: string; ev?: Evidence | null; label?: string }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(false)
  if (!ev || !ev.quote) return <span className="text-[12.5px] text-sub">공식 근거 없음</span>
  return (
    <span className="inline">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-0.5 text-[12.5px] text-accent-ink hover:underline underline-offset-4">
        {label || `${docName(ev.doc)} p.${ev.page}`}<ChevronDown size={13} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <span className="mt-2 block rounded-2xl bg-[#F7F6F2] px-4 py-3 text-[13px] leading-relaxed">
          <span className="block text-ink">“{ev.quote}”</span>
          <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-sub">
            <span>{docName(ev.doc)} {ev.page}쪽</span>
            <span className={ev.verified === false ? 'text-rose-ink' : 'text-sage-ink'}>{ev.verified === false ? '원문 불일치' : '원문 일치 확인됨'}</span>
            <button className={link} onClick={() => setPage(true)}>페이지 전체 보기</button>
            <a className={link} href={`/api/documents/${rid}/${ev.doc}/file#page=${ev.page}`} target="_blank" rel="noreferrer">PDF</a>
          </span>
        </span>
      )}
      {page && <PageModal rid={rid} ev={ev} onClose={() => setPage(false)} />}
    </span>
  )
}

function PageModal({ rid, ev, onClose }: { rid: string; ev: Evidence; onClose: () => void }) {
  const { data, error, loading } = useApi<any>(`/evidence/${rid}/${ev.doc}/${ev.page}`)
  const norm = (s: string) => s.replace(/\s+/g, '')
  const q = norm(ev.quote)
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#292929]/25 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-8 pb-4 pt-7">
          <div>
            <div className="text-[12.5px] text-sub">{docName(ev.doc)} · {ev.page}쪽</div>
            <div className="mt-1 text-[15px]">{data?.document_name}</div>
            {data?.document_url && <a className={`mt-1 inline-flex items-center gap-0.5 text-[12.5px] ${link}`} href={data.document_url} target="_blank" rel="noreferrer">JOB-ALIO 공식 첨부파일 <ArrowUpRight size={12} /></a>}
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-sub hover:bg-bg"><X size={18} /></button>
        </div>
        <div className="overflow-auto px-8 pb-8 text-[13px] leading-[1.9] text-[#555]">
          {loading && <Loading />}
          {error && <ErrorBox error={error} />}
          {(data?.text?.split('\n') || []).map((l: string, i: number) => {
            const n = norm(l)
            const hit = n.length > 3 && (q.includes(n) || n.includes(q))
            return <div key={i} className={hit ? '-mx-2 rounded-lg bg-butter px-2 text-ink' : ''}>{l || ' '}</div>
          })}
        </div>
      </div>
    </div>
  )
}

export function Bar({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'sage' }) {
  return <div className="h-1.5 rounded-full bg-[#EFEDE8]"><div className={`h-1.5 rounded-full ${tone === 'accent' ? 'bg-accent' : 'bg-sage-ink'}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
}

export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
