import { ArrowUpRight } from 'lucide-react'
import { ErrorBox, Loading, Note, Section, useApi } from '../components/ui'

export default function Books() {
  const { data, error, loading } = useApi<any>('/books')
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  return (
    <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Section title="지금 필요한 학습 자료">
        <div className="divide-y divide-line">
          {data.recommendations.map((r: any) => (
            <div key={r.topic} className="grid gap-3 py-6 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <div className="text-[16px]">{r.topic}</div>
                <div className="mt-1 text-[13.5px] text-sub">{r.reason}</div>
                <div className={`mt-1 text-[12px] ${r.official_link ? 'text-accent-ink' : 'text-sub'}`}>{r.official_link ? '공식 시험 범위 연계' : '개인 취약 영역 · 일반 학습 보조'}</div>
              </div>
              <div className="flex gap-3 text-[13.5px]">
                {r.stores.map((s: any) => <a key={s.store} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent-ink hover:underline underline-offset-4">{s.store}<ArrowUpRight size={13} /></a>)}
              </div>
            </div>
          ))}
        </div>
      </Section>
      <aside className="space-y-8">
        <Note>{data.price_comparison.note}</Note>
        <Section title="무료 공식 자료">
          <ul className="space-y-3 text-[14px]">
            {data.free.map((f: any) => <li key={f.url}><a className="inline-flex items-center gap-0.5 hover:text-accent-ink" href={f.url} target="_blank" rel="noreferrer">{f.name}<ArrowUpRight size={13} /></a></li>)}
          </ul>
        </Section>
      </aside>
    </div>
  )
}
