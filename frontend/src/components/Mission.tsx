import { useState } from 'react'
import { BadgeCheck, ChevronDown, ChevronUp, FileSearch, Layers, ShieldCheck, Target, UserCheck, Users, Wallet, Bot } from 'lucide-react'

const PROBLEMS = [
  { icon: Users, title: '청년 취업 정보 접근성 격차', desc: '정보를 찾고 해석하는 능력과 시간에 따라 준비 수준이 달라집니다.' },
  { icon: Layers, title: '공공기관 채용정보의 파편화', desc: '기관마다 다른 사이트·첨부파일(PDF·HWP)에 기준이 흩어져 있습니다.' },
  { icon: Bot, title: '생성형 AI 환각으로 인한 의사결정 오류', desc: '근거 없는 AI 답변을 믿으면 지원 기회를 놓칠 수 있습니다.' },
  { icon: Wallet, title: '불필요한 스펙 경쟁과 시간·비용 부담', desc: '가점에 반영되지 않는 자격증·과목에 시간과 비용을 씁니다.' },
]

const VALUES = [
  { icon: BadgeCheck, title: '정확성', desc: '공식 공고 원문에 있는 규칙만 사용하고, 점수는 AI가 아닌 코드로 계산' },
  { icon: ShieldCheck, title: '신뢰성', desc: '모든 판단에 원문 페이지·인용문 제공, 확인 불가는 ‘확인 필요’로 표시' },
  { icon: FileSearch, title: '접근성', desc: '흩어진 공고·첨부파일을 한 화면에서, 무료 공식 자료 링크 제공' },
  { icon: UserCheck, title: '개인 맞춤화', desc: '내 스펙·준비 상태로 자격·가점·출제범위 공백·로드맵 산출' },
]

export default function Mission() {
  const [open, setOpen] = useState(true)
  return (
    <section className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-navy to-brand-700 text-white shadow-sm">
      <div className="p-6 lg:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-brand-100">공기업 All-in-One · Public Career All-in-One</div>
            <h1 className="mt-1 text-xl font-bold leading-snug lg:text-2xl">청년 취업 정보 격차 해소를 위한<br className="sm:hidden" /> 공식 데이터 기반 AI 취업 지원 플랫폼</h1>
            <p className="mt-2 max-w-3xl text-sm text-brand-100">공식 채용공고만을 근거로 지원 자격과 가점을 분석하고, 맞춤형 준비 로드맵으로 연결합니다. 누구나 신뢰할 수 있는 정보로 체계적으로 준비할 수 있도록 돕는 것이 목표입니다.</p>
          </div>
          <button onClick={() => setOpen(!open)} className="shrink-0 rounded-lg bg-white/10 p-1.5 hover:bg-white/20" aria-label="접기">{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm">
          <Target size={16} className="shrink-0" /><b>핵심 차별점</b><span className="text-brand-100">공식 출처 검증(허용 도메인·리다이렉트·SSRF 차단) + 모든 분석 결과에 원문 근거(페이지·인용문) 제공 및 코드로 원문 존재 검증</span>
        </div>
        {open && (
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-100">해결하려는 사회적 문제</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {PROBLEMS.map(({ icon: I, title, desc }) => (
                  <div key={title} className="rounded-xl bg-white/10 p-3"><div className="flex items-center gap-2 text-sm font-semibold"><I size={15} />{title}</div><div className="mt-1 text-xs text-brand-100">{desc}</div></div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-100">핵심 가치</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {VALUES.map(({ icon: I, title, desc }) => (
                  <div key={title} className="rounded-xl bg-white p-3 text-navy"><div className="flex items-center gap-2 text-sm font-bold"><I size={15} className="text-brand-600" />{title}</div><div className="mt-1 text-xs text-slate-600">{desc}</div></div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-300/40 bg-emerald-400/10 p-3 text-xs">
                <div className="mb-1 text-sm font-semibold">현재까지 검증된 성과 (실측)</div>
                <ul className="space-y-0.5 text-brand-50">
                  <li>• 한국철도공사 2026 상반기 사무영업(IT) 공식 공고 1건 분석 반영</li>
                  <li>• 규칙 근거 인용문 77건 전부 공식 PDF 원문과 코드로 일치 확인</li>
                  <li>• 비공식·사설 IP·위장 도메인 URL 차단 및 가점 계산 자동 테스트 통과</li>
                </ul>
              </div>
              <div className="rounded-xl border border-white/20 bg-white/5 p-3 text-xs">
                <div className="mb-1 text-sm font-semibold">기대 효과 (목표 · 미검증)</div>
                <ul className="space-y-0.5 text-brand-100">
                  <li>• 정보 수집·관리 시간 주 3시간 → 1시간 목표 (66.7% 절감 예상)</li>
                  <li>• 가점 미반영 자격증 취득 등 불필요한 준비 비용 감소</li>
                  <li>• 대상 기관 확대 시 정보 접근성 격차 완화</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
