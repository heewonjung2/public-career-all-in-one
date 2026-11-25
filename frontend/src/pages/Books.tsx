import { BookOpen, ExternalLink, Info } from 'lucide-react'
import { Card, ErrorBox, Loading, PageHeader, Pill, useApi } from '../components/ui'

export default function Books() {
  const { data, error, loading } = useApi<any>('/books')
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  return (
    <div>
      <PageHeader title="추천 학습 자료" desc="공식 필기 출제범위와 내 취약 영역을 기준으로 학습 주제를 추천합니다." />
      <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><Info size={16} className="mt-0.5 shrink-0" />{data.price_comparison.note}</div>
      <div className="grid gap-4 md:grid-cols-2">
        {data.recommendations.map((r: any) => (
          <Card key={r.topic} title={r.topic} icon={<BookOpen size={16} />} action={r.official_link ? <Pill tone="blue">공식 시험 범위 연계</Pill> : <Pill tone="violet">개인 취약 영역 · 일반 학습 보조</Pill>}>
            <div className="text-sm text-slate-600">{r.reason}</div>
            <div className="mt-3 text-xs text-slate-500">온라인 서점 검색 (가격은 각 서점에서 확인)</div>
            <div className="mt-2 flex flex-wrap gap-2">{r.stores.map((s: any) => <a key={s.store} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">{s.store} <ExternalLink size={12} /></a>)}</div>
          </Card>
        ))}
      </div>
      <Card className="mt-6" title="무료 공식 자료">
        <ul className="space-y-2 text-sm">{data.free.map((f: any) => <li key={f.url}><a className="inline-flex items-center gap-1 text-brand-600 hover:underline" href={f.url} target="_blank" rel="noreferrer">{f.name} <ExternalLink size={12} /></a></li>)}</ul>
      </Card>
    </div>
  )
}
