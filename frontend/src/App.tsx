import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { Bell, Menu, UserRound, X } from 'lucide-react'
import { api } from './api'
import Home from './pages/Home'
import Jobs from './pages/Jobs'
import Spec from './pages/Spec'
import Roadmap from './pages/Roadmap'
import Books from './pages/Books'
import Calendar from './pages/Calendar'
import Settings from './pages/Settings'
import Chat from './components/Chat'

const NAV = [
  { to: '/', label: '홈' },
  { to: '/jobs', label: '채용' },
  { to: '/spec', label: '내 스펙' },
  { to: '/roadmap', label: '로드맵' },
  { to: '/books', label: '학습 자료' },
  { to: '/calendar', label: '캘린더' },
]

function useOutside(cb: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) cb() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [cb])
  return ref
}

function Bellmenu() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<any[]>([])
  const ref = useOutside(() => setOpen(false))
  const load = () => api<any[]>('/notifications').then(setItems).catch(() => {})
  useEffect(() => { load() }, [])
  const unread = items.filter((n) => !n.read).length
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen(!open); load() }} className="relative rounded-full p-2 text-[#6b6b6b] hover:bg-white" aria-label="알림">
        <Bell size={19} strokeWidth={1.7} />{unread > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-3xl bg-white p-2 shadow-[0_12px_40px_rgba(41,41,41,0.08)]">
          <div className="px-4 pb-1 pt-3 text-[13px] text-sub">알림</div>
          {items.length === 0 && <div className="px-4 py-6 text-sm text-sub">새 알림이 없습니다.</div>}
          {items.map((n) => (
            <button key={n.id} onClick={async () => setItems(await api(`/notifications/${n.id}/read`, { method: 'PATCH' }))}
              className="block w-full rounded-2xl px-4 py-3 text-left hover:bg-bg">
              <div className={`text-[14px] ${n.read ? 'text-sub' : ''}`}>{n.title}</div>
              <div className="text-[12.5px] text-sub">{n.body}</div>
              <div className="mt-1 text-[11.5px] text-[#b0aca3]">{n.severity} · {n.created_at?.replace('T', ' ').slice(0, 16)}</div>
            </button>
          ))}
          <Link to="/jobs?tab=changes" onClick={() => setOpen(false)} className="block px-4 py-3 text-[13px] text-accent-ink">공고 변경 이력 보기</Link>
        </div>
      )}
    </div>
  )
}

function ProfileMenu() {
  const [open, setOpen] = useState(false)
  const ref = useOutside(() => setOpen(false))
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex h-9 w-9 items-center justify-center rounded-full bg-lav text-accent-ink" aria-label="프로필"><UserRound size={17} strokeWidth={1.8} /></button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-56 rounded-3xl bg-white p-2 text-[14px] shadow-[0_12px_40px_rgba(41,41,41,0.08)]" onClick={() => setOpen(false)}>
          <Link to="/spec?tab=edit" className="block rounded-2xl px-4 py-2.5 hover:bg-bg">내 스펙 편집</Link>
          <Link to="/settings" className="block rounded-2xl px-4 py-2.5 hover:bg-bg">알림 설정</Link>
          <Link to="/settings#privacy" className="block rounded-2xl px-4 py-2.5 hover:bg-bg">개인정보 보호</Link>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [mobile, setMobile] = useState(false)
  return (
    <BrowserRouter>
      <header className="sticky top-0 z-40 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between px-6">
          <div className="flex items-center gap-10">
            <Link to="/" className="text-[17px] font-semibold tracking-tight">공기업 올인원</Link>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'}
                  className={({ isActive }) => `rounded-full px-4 py-1.5 text-[14.5px] transition ${isActive ? 'bg-lav text-accent-ink' : 'text-[#6b6b6b] hover:text-ink'}`}>{n.label}</NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Bellmenu />
            <ProfileMenu />
            <button className="rounded-full p-2 md:hidden" onClick={() => setMobile(!mobile)}>{mobile ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>
        {mobile && (
          <nav className="flex flex-wrap gap-1 px-6 pb-4 md:hidden" onClick={() => setMobile(false)}>
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `rounded-full px-4 py-1.5 text-[14px] ${isActive ? 'bg-lav text-accent-ink' : 'text-[#6b6b6b]'}`}>{n.label}</NavLink>)}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-[1200px] px-6 pb-32 pt-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/spec" element={<Spec />} />
          <Route path="/roadmap" element={<Roadmap />} />
          <Route path="/books" element={<Books />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <footer className="mx-auto max-w-[1200px] px-6 pb-10 text-[12px] text-[#aaa69d]">
        채용 기준은 JOB-ALIO 등 공식 원문으로만 판단하며, 확인되지 않은 정보는 ‘확인 필요’로 표시합니다.
      </footer>
      <Chat />
    </BrowserRouter>
  )
}
