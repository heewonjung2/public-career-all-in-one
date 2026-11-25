import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ChevronDown, Loader2, MessageCircle, RotateCcw, X } from 'lucide-react'
import { api } from '../api'
import { EvidenceToggle } from './ui'

const SUGGEST = [
  '정보처리기사랑 SQLD 가점이 중복 인정돼?',
  '한국사 1급은 몇 점이야?',
  '전공시험 출제 범위에 데이터베이스가 포함돼?',
  '필기시험 과락 기준은?',
  'NCS 출제 대행사가 공개되어 있어?',
  '내 자격증 중 가점 인정 안 되는 건?',
  '나 무슨 기사 자격증 더 따는 게 좋아?',
]
const KEY = 'pc-chat-v1'
const MODE: Record<string, string> = {
  rule_engine: '가점 규칙 엔진 계산', simulator: '가점 시뮬레이터 계산(현재 공고·내 스펙)', retrieval_only: '공식 원문 검색 결과', llm_grounded: 'AI 답변 · 인용 검증 통과', abstain: '답변 보류',
}

export default function Chat() {
  const [open, setOpen] = useState(false)
  const [sources, setSources] = useState<any[]>([])
  const [rid, setRid] = useState('')
  const [msgs, setMsgs] = useState<any[]>(() => { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]') } catch { return [] } })
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => { if (open) { api<any[]>('/chat/sources').then(setSources).catch(() => {}); api<any>('/active').then((a) => a.recruitment_id && setRid(a.recruitment_id)).catch(() => {}) } }, [open])
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs)) } catch { /* ignore */ } end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const ask = async (text: string) => {
    if (!text.trim() || busy) return
    setQ(''); setBusy(true)
    setMsgs((m) => [...m, { role: 'user', text }])
    try {
      const r = await api('/chat/ask', { method: 'POST', json: { question: text, recruitment_id: rid } })
      setMsgs((m) => [...m, { role: 'bot', data: r }])
    } catch (e: any) { setMsgs((m) => [...m, { role: 'bot', error: e.message }]) } finally { setBusy(false) }
  }
  const clear = async () => { await api('/chat/history', { method: 'DELETE' }).catch(() => {}); setMsgs([]) }
  const src = sources.find((s) => s.recruitment_id === rid)

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} className="fixed bottom-7 right-7 z-50 flex items-center gap-2 rounded-full bg-accent py-3 pl-4 pr-5 text-[14px] text-white shadow-[0_10px_30px_rgba(165,155,231,0.45)] hover:bg-[#9489de]">
          <MessageCircle size={18} strokeWidth={1.8} />채용 상담
        </button>
      )}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[min(680px,calc(100vh-48px))] w-[min(420px,calc(100vw-32px))] flex-col rounded-[28px] bg-white shadow-[0_20px_60px_rgba(41,41,41,0.12)]">
          <div className="flex items-start justify-between px-6 pb-3 pt-5">
            <div>
              <div className="text-[16px] font-semibold">채용 상담</div>
              <div className="text-[12.5px] text-sub">공식 문서에서 찾은 근거로만 답해요</div>
            </div>
            <div className="flex gap-1">
              <button onClick={clear} title="대화 기록 삭제" className="rounded-full p-2 text-sub hover:bg-bg"><RotateCcw size={16} /></button>
              <button onClick={() => setOpen(false)} className="rounded-full p-2 text-sub hover:bg-bg"><X size={17} /></button>
            </div>
          </div>
          <div className="px-6 pb-3">
            <label className="relative block">
              <select value={rid} onChange={(e) => setRid(e.target.value)} className="w-full appearance-none rounded-2xl bg-lav px-4 py-2.5 pr-9 text-[13px] text-[#4a4280] outline-none">
                {sources.map((s) => <option key={s.recruitment_id} value={s.recruitment_id}>{s.company} · {s.job_category} · {s.published_at}</option>)}
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-accent-ink" />
            </label>
            {src && <div className="mt-1.5 px-1 text-[11.5px] leading-snug text-sub">{src.title} 기준{src.status_note ? ' · 마감된 과거 공고' : ''}</div>}
          </div>
          <div className="flex-1 space-y-5 overflow-auto px-6 py-3">
            {msgs.length === 0 && (
              <div className="space-y-2 pt-2">
                <div className="text-[12.5px] text-sub">이런 걸 물어볼 수 있어요</div>
                {SUGGEST.map((s) => <button key={s} onClick={() => ask(s)} className="block w-full rounded-2xl bg-bg px-4 py-2.5 text-left text-[13.5px] hover:bg-lav">{s}</button>)}
              </div>
            )}
            {msgs.map((m, i) => m.role === 'user'
              ? <div key={i} className="ml-10 rounded-3xl rounded-br-lg bg-lav px-4 py-2.5 text-[14px]">{m.text}</div>
              : <BotMsg key={i} m={m} />)}
            {busy && <div className="flex items-center gap-2 text-[13px] text-sub"><Loader2 size={14} className="animate-spin" />공식 문서 검색 중</div>}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(q) }} className="m-4 flex items-center gap-2 rounded-full bg-bg py-1.5 pl-5 pr-1.5">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="채용공고에 대해 질문해 보세요" className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#b5b1a8]" />
            <button disabled={busy || !q.trim()} className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"><ArrowUp size={17} /></button>
          </form>
        </div>
      )}
    </>
  )
}

function BotMsg({ m }: { m: any }) {
  if (m.error) return <div className="text-[13.5px] text-rose-ink">{m.error}</div>
  return (
    <div className="space-y-5">
      {m.data.answers.map((a: any, i: number) => (
        <div key={i} className="text-[14px] leading-relaxed">
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-sub">
            <span>{a.scope?.company}{a.scope?.job_category ? ` · ${a.scope.job_category}` : ''}</span>
            {a.mode && <span className={a.abstained ? 'text-butter-ink' : 'text-accent-ink'}>{MODE[a.mode] || a.mode}</span>}
          </div>
          <div>{a.answer?.summary}</div>
          {a.answer?.lines?.length > 0 && <ul className="mt-2 space-y-1 text-[13.5px] text-[#555]">{a.answer.lines.map((l: string, j: number) => <li key={j}>· {l}</li>)}</ul>}
          {a.answer?.notes?.length > 0 && <div className="mt-2 text-[12.5px] text-butter-ink">{a.answer.notes.join(' ')}</div>}
          {a.answer?.next && <div className="mt-2 text-[12.5px] text-sub">추가로 확인할 곳: {a.answer.next.join(', ')}</div>}
          {a.citations?.length > 0 && (
            <div className="mt-3 space-y-1.5 border-l-2 border-lav pl-3">
              {a.citations.slice(0, 4).map((c: any, j: number) => <div key={j}><EvidenceToggle rid={a.scope.recruitment_id} ev={c} /></div>)}
            </div>
          )}
          {a.scope?.recruitment_title && <div className="mt-2 text-[11.5px] text-[#b0aca3]">기준: {a.scope.recruitment_title} ({a.scope.published_at})</div>}
        </div>
      ))}
      <div className="text-[11px] text-[#c0bcb3]">{m.data.elapsed_ms}ms · 대화는 이 브라우저 탭에만 저장</div>
    </div>
  )
}
