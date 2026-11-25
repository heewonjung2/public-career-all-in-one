import { useEffect, useState } from 'react'
import { api, MAIN_RID } from '../api'
import { Card, ErrorBox, Loading, PageHeader, Pill, StatusBadge } from '../components/ui'

export default function Simulator() {
  const [opts, setOpts] = useState<any[] | null>(null)
  const [sel, setSel] = useState<string[]>([])
  const [res, setRes] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const key = (o: any) => `${o.name}|${o.grade}`

  useEffect(() => { api(`/simulate/options/${MAIN_RID}`).then(setOpts).catch((e) => setErr(e.message)) }, [])
  useEffect(() => {
    if (!opts) return
    const add = opts.filter((o) => sel.includes(key(o))).map((o) => ({ name: o.name, grade: o.grade }))
    api('/simulate', { method: 'POST', json: { recruitment_id: MAIN_RID, add_certificates: add } }).then(setRes).catch((e) => setErr(e.message))
  }, [sel, opts])

  if (err) return <ErrorBox error={err} />
  if (!opts || !res) return <Loading />
  if (!res.available) return <ErrorBox error={`시뮬레이션 비활성화: ${res.reason}`} />
  const cur = res.current, sim = res.simulated
  const groups = ['공통직무', '안전', '직렬별']

  return (
    <div>
      <PageHeader title="가점 시뮬레이터" desc="한국철도공사 2026 상반기 공고([참고4])의 가산대상 자격증 목록과 중복·상한 규칙을 그대로 적용합니다." />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-sm text-slate-500">현재 가점 (확정 / 해석 포함)</div><div className="mt-2 text-3xl font-bold text-navy">{cur.total_confirmed} <span className="text-lg text-slate-400">/ {cur.total_with_interpretation}</span></div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-sm text-slate-500">추가 예상 가점</div><div className="mt-2 text-3xl font-bold text-brand-600">+{res.delta_confirmed} <span className="text-lg text-slate-400">/ +{res.delta_with_interpretation}</span></div></div>
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5"><div className="text-sm text-brand-700">시뮬레이션 후 가점</div><div className="mt-2 text-3xl font-bold text-navy">{sim.total_confirmed} <span className="text-lg text-slate-400">/ {sim.total_with_interpretation}</span></div></div>
      </div>
      <div className="mt-2 text-xs text-slate-500">일반 자격증: 공통직무 1개·안전 1개·직렬별 2개 중 최대 3개, 최대 12점 · 동일 종별은 최고 1개만 · 필기 과목별 40% 이상 득점 시에만 적용</div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card title="추가 취득 시나리오 선택">
          {groups.map((g) => (
            <div key={g} className="mb-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-navy">{g} {g === '직렬별' && <Pill tone="amber">해석 필요 영역</Pill>}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {opts.filter((o) => o.category === g).map((o) => (
                  <label key={key(o)} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm ${sel.includes(key(o)) ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                    <input type="checkbox" checked={sel.includes(key(o))} onChange={(e) => setSel(e.target.checked ? [...sel, key(o)] : sel.filter((x) => x !== key(o)))} />
                    <span className="flex-1">{o.name} {o.grade}</span><span className="text-xs text-slate-500">{o.cert_grade} {o.points}점 · p.{o.page}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </Card>
        <Card title="시뮬레이션 결과 상세">
          <table className="w-full text-sm">
            <tbody>
              {sim.rows.map((r: any, i: number) => (
                <tr key={i} className="border-b border-slate-100 align-top">
                  <td className="py-2">{r.cert}{r.hypothetical && <Pill tone="violet">가상</Pill>}<div className="text-xs text-slate-400">{r.category ? `${r.category} · ${r.kind}` : ''}</div></td>
                  <td className="text-right">{r.points != null ? `${r.points}점` : '-'}</td>
                  <td className="pl-2 text-right"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">추가 자격증이 같은 영역의 기존 자격증보다 점수가 높지 않으면(예: 공통직무 1개 제한) 가점이 늘지 않습니다. 취득 우선순위는 <b>아직 채워지지 않은 영역</b>의 기사급 자격증이 유리합니다.</div>
        </Card>
      </div>
    </div>
  )
}
