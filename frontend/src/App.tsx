import { useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { Bell, BookOpen, Briefcase, CalendarDays, Calculator, LayoutDashboard, Map, Menu, ScanSearch, UserRound } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Recruitments from './pages/Recruitments'
import Analysis from './pages/Analysis'
import Simulator from './pages/Simulator'
import Roadmap from './pages/Roadmap'
import Books from './pages/Books'
import Calendar from './pages/Calendar'
import Notifications from './pages/Notifications'

const NAV = [
  { to: '/', label: '대시보드', icon: LayoutDashboard },
  { to: '/profile', label: '내 스펙 관리', icon: UserRound },
  { to: '/recruitments', label: '기업 및 채용공고', icon: Briefcase },
  { to: '/analysis', label: '맞춤형 분석', icon: ScanSearch },
  { to: '/simulator', label: '가점 시뮬레이터', icon: Calculator },
  { to: '/roadmap', label: '취업 로드맵', icon: Map },
  { to: '/books', label: '추천 학습 자료', icon: BookOpen },
  { to: '/calendar', label: '채용 캘린더', icon: CalendarDays },
  { to: '/notifications', label: '알림 설정', icon: Bell, badge: '일부 구현' },
]

export default function App() {
  const [open, setOpen] = useState(false)
  return (
    <BrowserRouter>
      <div className="min-h-screen lg:flex">
        <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white transition lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">公</div>
            <div>
              <div className="text-[15px] font-bold text-navy">공기업 All-in-One</div>
              <div className="text-[11px] text-slate-400">공식 채용정보 기반 취업 준비</div>
            </div>
          </div>
          <nav className="space-y-1 p-3">
            {NAV.map(({ to, label, icon: Icon, badge }) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}
                className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <Icon size={18} />
                <span className="flex-1">{label}</span>
                {badge && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{badge}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="absolute bottom-0 w-full border-t border-slate-100 p-4 text-[11px] leading-relaxed text-slate-400">
            채용 기준은 JOB-ALIO 등 공식 출처의 원문으로만 판단합니다. 확인되지 않은 정보는 ‘확인 필요’로 표시합니다.
          </div>
        </aside>
        {open && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)} />}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
            <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(true)}><Menu size={20} /></button>
            <div className="hidden text-sm text-slate-500 lg:block">오늘의 취업 준비 현황</div>
            <div className="flex items-center gap-3">
              <NavLink to="/notifications" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><Bell size={18} /></NavLink>
              <NavLink to="/profile" className="flex items-center gap-2 rounded-full bg-slate-100 py-1 pl-1 pr-3 text-sm text-slate-700">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs text-white"><UserRound size={14} /></span>내 프로필
              </NavLink>
            </div>
          </header>
          <main className="mx-auto max-w-6xl p-4 lg:p-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/recruitments" element={<Recruitments />} />
              <Route path="/analysis" element={<Analysis />} />
              <Route path="/simulator" element={<Simulator />} />
              <Route path="/roadmap" element={<Roadmap />} />
              <Route path="/books" element={<Books />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/notifications" element={<Notifications />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}
