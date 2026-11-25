import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ChevronDown, Loader2, MessageCircle, MoreHorizontal, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { EvidenceToggle } from './ui'

const QUICK = [
  { label: '내 가점 확인', q: '내 자격증 가점 몇 점이야?' },
  { label: '자격증별 추가 가점', q: '기사 자격증 뭐 더 따면 좋아?' },
  { label: '이번 주 할 일', q: '이번 주 할 일 알려줘' },
]
const SUGGEST = ['SQLD 가점 몇 점이야?', '정보처리기사랑 SQLD 가점이 중복 인정돼?', '필기 과목이 뭐야?', '필기시험 과락 기준은?']
const KEY = 'pc-chat-v2'
const GEO = 'pc-chat-geo'
type Geo = { x: number; y: number; w: number; h: number }
const MIN_W = 320, MIN_H = 380

function defaultGeo(): Geo {
  const w = Math.min(420, window.innerWidth - 32), h = Math.min(680, window.innerHeight - 48)
  return { x: window.innerWidth - w - 24, y: window.innerHeight - h - 24, w, h }
}
// 창이 화면 밖으로 나가지 않게(닫기 버튼·입력창이 항상 보이도록) 보정
function clamp(g: Geo): Geo {
  const W = window.innerWidth, H = window.innerHeight
  const w = Math.max(MIN_W, Math.min(g.w, W - 16)), h = Math.max(MIN_H, Math.min(g.h, H - 16))
  return { w, h, x: Math.max(8, Math.min(g.x, W - w - 8)), y: Math.max(8, Math.min(g.y, H - h - 8)) }
}
function loadGeo(): Geo { try { const g = JSON.parse(localStorage.getItem(GEO) || 'null'); if (g) return clamp(g) } catch { /* ignore */ } return defaultGeo() }

export default function Chat() {
  const [open, setOpen] = useState(false)
  const [st, setSt] = useState<{ msgs: any[]; ctx: any; pending: string | null }>(() => { try { return JSON.parse(sessionStorage.getItem(KEY) || '') } catch { return { msgs: [], ctx: null, pending: null } } })
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [geo, setGeo] = useState<Geo>(() => loadGeo())
  const [menu, setMenu] = useState(false)
  const [mobile, setMobile] = useState(window.innerWidth < 640)
  const end = useRef<HTMLDivElement>(null)
  const { msgs, ctx, pending } = st

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(st)) } catch { /* ignore */ } end.current?.scrollIntoView({ behavior: 'smooth' }) }, [st])
  useEffect(() => { try { localStorage.setItem(GEO, JSON.stringify(geo)) } catch { /* ignore */ } }, [geo])
  useEffect(() => {
    const on = () => { setMobile(window.innerWidth < 640); setGeo((g) => clamp(g)) }
    window.addEventListener('resize', on); return () => window.removeEventListener('resize', on)
  }, [])

  const ask = async (text: string, display?: string) => {
    if (!text.trim() || busy) return
    setQ(''); setBusy(true)
    setSt((s) => ({ ...s, msgs: [...s.msgs, { role: 'user', text: display || text }] }))
    try {
      const r = await api('/chat/ask', { method: 'POST', json: { question: text, context: ctx, pending_question: pending } })
      setSt((s) => r.clarify
        ? { msgs: [...s.msgs, { role: 'bot', clarify: r.clarify }], ctx: s.ctx, pending: r.pending_question }
        : { msgs: [...s.msgs, { role: 'bot', data: r }], ctx: r.context || s.ctx, pending: null })
    } catch (e: any) { setSt((s) => ({ ...s, msgs: [...s.msgs, { role: 'bot', error: e.message }] })) } finally { setBusy(false) }
  }
  const pickOption = (o: string) => {
    if (o === '다른 기관') { setSt((s) => ({ ...s, msgs: [...s.msgs, { role: 'bot', text: '기관명을 입력해 주세요. (예: 한수원, 서울교통공사)' }] })); return }
    ask(o)
  }
  const clear = () => { setSt({ msgs: [], ctx: null, pending: null }); setMenu(false) }

  // 드래그(상단 바) · 크기 조절(오른쪽 아래 손잡이)
  const drag = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    if (mobile) return
    if ((e.target as HTMLElement).closest('button') && mode === 'move') return
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY, g0 = geo
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      setGeo(clamp(mode === 'move' ? { ...g0, x: g0.x + dx, y: g0.y + dy } : { ...g0, w: g0.w + dx, h: g0.h + dy }))
    }
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }
  const style = mobile ? undefined : { left: geo.x, top: geo.y, width: geo.w, height: geo.h }

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} className="fixed bottom-7 right-7 z-50 flex items-center gap-2 rounded-full bg-accent py-3 pl-4 pr-5 text-[14px] text-white shadow-[0_10px_30px_rgba(165,155,231,0.45)] hover:bg-[#9489de]">
          <MessageCircle size={18} strokeWidth={1.8} />취뽀봇
        </button>
      )}
      {open && (
        <div style={style} className={`fixed z-50 flex flex-col bg-white shadow-[0_20px_60px_rgba(41,41,41,0.16)] ${mobile ? 'inset-x-2 bottom-2 top-16 rounded-[24px]' : 'rounded-[24px]'}`}>
          <div onPointerDown={(e) => drag(e, 'move')} className={`relative flex items-center justify-between rounded-t-[24px] px-5 pb-2 pt-4 ${mobile ? '' : 'cursor-move select-none'}`}>
            <div>
              <div className="text-[16px] font-semibold">취뽀봇</div>
              <div className="text-[12px] text-sub">{ctx?.company_name ? `${ctx.company_name}${ctx.job ? ` · ${ctx.job}` : ''} 기준으로 답하는 중` : '궁금한 걸 바로 물어보세요'}</div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setMenu(!menu)} title="메뉴" className="rounded-full p-2 text-sub hover:bg-bg"><MoreHorizontal size={17} /></button>
              <button onClick={() => setOpen(false)} title="닫기" className="rounded-full p-2 text-sub hover:bg-bg"><X size={17} /></button>
            </div>
            {menu && (
              <div className="absolute right-4 top-14 z-10 w-52 rounded-2xl border border-line bg-white py-1.5 text-[13.5px] shadow-lg">
                {!mobile && <button className="block w-full px-4 py-2 text-left hover:bg-bg" onClick={() => { setGeo(defaultGeo()); setMenu(false) }}>기본 위치·크기로 되돌리기</button>}
                <button className="block w-full px-4 py-2 text-left hover:bg-bg" onClick={clear}>새 대화 시작</button>
              </div>
            )}
          </div>
          <div className="flex-1 space-y-4 overflow-auto px-5 py-3">
            {msgs.length === 0 && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-3 gap-2 pb-2">
                  {QUICK.map((x) => <button key={x.label} onClick={() => ask(x.q)} className="rounded-2xl bg-lav px-2 py-3 text-[13px] font-semibold text-accent-ink hover:bg-[#e6e0fb]">{x.label}</button>)}
                </div>
                {SUGGEST.map((s) => <button key={s} onClick={() => ask(s)} className="block w-full rounded-2xl bg-bg px-4 py-2.5 text-left text-[13.5px] hover:bg-lav">{s}</button>)}
              </div>
            )}
            {msgs.map((m, i) => m.role === 'user'
              ? <div key={i} className="ml-10 rounded-3xl rounded-br-lg bg-lav px-4 py-2.5 text-[14px]">{m.text}</div>
              : <BotMsg key={i} m={m} onOption={i === msgs.length - 1 && pending ? pickOption : undefined} />)}
            {busy && <div className="flex items-center gap-2 text-[13px] text-sub"><Loader2 size={14} className="animate-spin" />확인 중</div>}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(q) }} className="m-3 flex items-center gap-2 rounded-full bg-bg py-1.5 pl-5 pr-1.5">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pending ? '기관명을 입력하거나 위에서 골라 주세요' : '가점·자격증·공고·할 일을 물어보세요'} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#b5b1a8]" />
            <button disabled={busy || !q.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"><ArrowUp size={17} /></button>
          </form>
          {!mobile && <div onPointerDown={(e) => drag(e, 'resize')} title="크기 조절" className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize rounded-br-[20px] border-b-2 border-r-2 border-[#CFC8E8]" />}
        </div>
      )}
    </>
  )
}

function BotMsg({ m, onOption }: { m: any; onOption?: (o: string) => void }) {
  if (m.error) return <div className="text-[13.5px] text-rose-ink">{m.error}</div>
  if (m.text) return <div className="text-[14px]">{m.text}</div>
  if (m.clarify) return (
    <div className="text-[14px]">
      <div>{m.clarify.question}</div>
      {onOption && <div className="mt-2 flex flex-wrap gap-1.5">{m.clarify.options.map((o: string) => <button key={o} onClick={() => onOption(o)} className="rounded-full border border-[#D9D0FA] px-3 py-1 text-[13px] text-accent-ink hover:bg-lav">{o}</button>)}</div>}
    </div>
  )
  return <div className="space-y-4">{m.data.answers.map((a: any, i: number) => <Answer key={i} a={a} />)}</div>
}

function Answer({ a }: { a: any }) {
  const [open, setOpen] = useState(false)
  const t = a.scope?.recruitment_title || ''
  const ref = /사전예고/.test(t) ? '2027 사전예고 기준(최종 공고 아님)' : a.scope?.status_note || /마감/.test(t) ? '과거 공고 참고' : null
  const hasEv = a.scope?.company || a.citations?.length
  return (
    <div className="text-[14px] leading-relaxed">
      <div className="font-medium">{a.answer?.summary}</div>
      {a.answer?.lines?.length > 0 && <ul className="mt-1.5 space-y-1 text-[13.5px] text-[#555]">{a.answer.lines.slice(0, 8).map((l: string, j: number) => <li key={j}>· {l}</li>)}</ul>}
      {a.answer?.notes?.length > 0 && <div className="mt-1.5 text-[12.5px] text-butter-ink">{a.answer.notes[0]}</div>}
      {a.action && <Link to={a.action.to} className="mt-2 inline-block rounded-xl bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white">{a.action.label}</Link>}
      {ref && <div className="mt-2 text-[12px] text-butter-ink">{ref}</div>}
      {hasEv && (
        <div className="mt-1.5">
          <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-0.5 text-[12.5px] text-accent-ink">근거 보기 <ChevronDown size={13} className={open ? 'rotate-180' : ''} /></button>
          {open && (
            <div className="mt-1.5 space-y-1.5 border-l-2 border-lav pl-3 text-[12px] text-sub">
              <div>{a.scope?.company}{a.scope?.job_category ? ` · ${a.scope.job_category}` : ''}</div>
              {t && <div>공고: {t}{a.scope?.published_at ? ` (${a.scope.published_at})` : ''}</div>}
              {(a.citations || []).slice(0, 4).map((c: any, j: number) => <div key={j}><EvidenceToggle rid={a.scope.recruitment_id} ev={c} /></div>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
