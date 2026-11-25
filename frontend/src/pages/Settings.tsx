import { useState } from 'react'
import { api } from '../api'
import { ErrorBox, Loading, Note, Section, btnPrimary, input, useApi } from '../components/ui'

export default function Settings() {
  const s = useApi<any>('/notifications/settings')
  const [msg, setMsg] = useState<string | null>(null)
  if (s.loading) return <Loading />
  if (s.error) return <ErrorBox error={s.error} />
  const d = s.data
  const set = (k: string, v: any) => s.setData({ ...d, [k]: v })
  const save = async () => { s.setData(await api('/notifications/settings', { method: 'PUT', json: d })); setMsg('저장했어요. 메일은 아직 발송되지 않아요.') }
  return (
    <div className="max-w-[720px] space-y-16">
      <Section title="알림 설정">
        <div className="space-y-5">
          <Note>{d.note}</Note>
          <label className="block text-[13px] text-sub">이메일<input className={`${input} mt-1.5`} value={d.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" /></label>
          <label className="block text-[13px] text-sub">확인 시각 ({d.timezone})<input className={`${input} mt-1.5`} value={(d.times || []).join(', ')} onChange={(e) => set('times', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></label>
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={!!d.consent} onChange={(e) => set('consent', e.target.checked)} />공식 출처가 검증된 신규·정정 공고 알림 수신에 동의</label>
          <div className="flex items-center gap-4"><button className={btnPrimary} onClick={save}>저장</button>{msg && <span className="text-[13px] text-sub">{msg}</span>}</div>
          <p className="text-[13px] text-sub">웹사이트 안 알림(상단 종 아이콘)은 공고 변경이 감지될 때 생성되며, 같은 변경은 한 번만 알려요.</p>
        </div>
      </Section>
      <Section title="개인정보 보호">
        <ul id="privacy" className="space-y-3 text-[14px] leading-relaxed text-[#555]">
          <li>로그인 기능이 없어 공개 시연 서버에 입력한 스펙은 다른 방문자와 공유될 수 있어요. 실제 개인정보는 입력하지 마세요.</li>
          <li>AI 취업 에이전트 대화는 서버에 저장하지 않고 브라우저 탭 세션에만 보관돼요. 에이전트 창의 되돌리기 버튼으로 삭제할 수 있어요.</li>
          <li>AI API를 쓰는 경우에도 닉네임·학력 등은 보내지 않고, 질문에 필요한 자격증 목록만 사용해요.</li>
          <li>홈의 분포 그래프는 고정 시드로 만든 시연용 가상 준비생 데이터이며 실제 이용자 통계가 아니에요.</li>
          <li>저장소에는 가상 데모 프로필만 포함돼 있어요.</li>
        </ul>
      </Section>
    </div>
  )
}
