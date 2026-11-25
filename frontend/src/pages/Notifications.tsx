import { useState } from 'react'
import { Info, Save } from 'lucide-react'
import { api } from '../api'
import { Card, ErrorBox, Loading, PageHeader, Pill, btnPrimary, input, useApi } from '../components/ui'

export default function Notifications() {
  const s = useApi<any>('/notifications/settings')
  const [msg, setMsg] = useState<string | null>(null)
  if (s.loading) return <Loading />
  if (s.error) return <ErrorBox error={s.error} />
  const d = s.data
  const set = (k: string, v: any) => s.setData({ ...d, [k]: v })
  const save = async () => { s.setData(await api('/notifications/settings', { method: 'PUT', json: d })); setMsg('설정을 저장했습니다 (메일은 발송되지 않음)') }
  return (
    <div>
      <PageHeader title="알림 설정" desc="관심 기업 신규 공고 알림" action={<Pill tone="amber">설정 저장만 구현 · 발송 구현 예정</Pill>} />
      <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><Info size={16} className="mt-0.5 shrink-0" />{d.note}</div>
      {msg && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}
      <Card title="알림 받을 조건">
        <div className="grid max-w-xl gap-4">
          <label className="text-sm">이메일 주소<input className={`${input} mt-1`} value={d.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" /></label>
          <label className="text-sm">확인 시각 (쉼표 구분, {d.timezone})<input className={`${input} mt-1`} value={(d.times || []).join(', ')} onChange={(e) => set('times', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!d.consent} onChange={(e) => set('consent', e.target.checked)} />공식 출처가 검증된 신규 공고 알림 메일 수신에 동의합니다.</label>
          <div><button className={btnPrimary} onClick={save}><Save size={15} />저장</button></div>
        </div>
      </Card>
      <Card className="mt-6" title="계획된 처리 과정 (구현 예정)">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>스케줄러가 지정 시각에 JOB-ALIO 등 허용된 공식 출처를 조회</li><li>공고 ID·문서 해시로 기존 공고와 비교해 신규·정정 공고 확인</li>
          <li>관심 기업 사용자에게만, 수신 동의한 경우에만 발송</li><li>발송 내역 기록으로 중복 발송 방지</li>
        </ol>
      </Card>
    </div>
  )
}
