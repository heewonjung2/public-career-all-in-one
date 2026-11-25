import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, RotateCcw, Save, ScanSearch, Trash2 } from 'lucide-react'
import { api } from '../api'
import { Card, ErrorBox, Loading, PageHeader, btnGhost, btnPrimary, input } from '../components/ui'

const LEVELS = ['준비 완료', '복습 필요', '준비 중', '보완 필요', '취약', '미시작']
const NCS = ['의사소통능력', '수리능력', '문제해결능력']
const MAJOR = ['운영체제', '데이터베이스', '데이터통신', '소프트웨어공학', '정보보호개론', '컴퓨터구조', '자료구조', '알고리즘', '인공지능', '컴퓨터 네트워크']
const COMPANIES = [{ id: 'korail', name: '한국철도공사' }, { id: 'kepco', name: '한국전력공사' }, { id: 'seoulmetro', name: '서울교통공사' }]

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}</label>
}

export default function Profile() {
  const [p, setP] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const nav = useNavigate()
  useEffect(() => { api('/profile').then(setP).catch((e) => setErr(e.message)) }, [])
  if (err) return <ErrorBox error={err} />
  if (!p) return <Loading />

  const set = (k: string, v: any) => setP({ ...p, [k]: v })
  const setIn = (k: string, i: number, f: string, v: any) => { const arr = [...(p[k] || [])]; arr[i] = { ...arr[i], [f]: v }; set(k, arr) }
  const add = (k: string, obj: any) => set(k, [...(p[k] || []), obj])
  const del = (k: string, i: number) => set(k, (p[k] || []).filter((_: any, j: number) => j !== i))

  const save = async (go?: boolean) => {
    try {
      const saved = await api('/profile', { method: 'PUT', json: p })
      setP(saved); setMsg(`저장 완료 · ${saved._updated_at}`)
      if (go) nav('/analysis')
    } catch (e: any) { setErr(e.message) }
  }
  const reset = async () => { const d = await api('/profile/reset-demo', { method: 'POST' }); setP(d); setMsg('데모 프로필로 초기화했습니다') }

  return (
    <div>
      <PageHeader title="내 스펙 관리" desc="입력한 정보는 이 서버의 로컬 DB에만 저장되며 분석에만 사용됩니다. 공개 배포 시 실명·연락처 등 개인정보는 입력하지 마세요."
        action={<div className="flex gap-2"><button className={btnGhost} onClick={reset}><RotateCcw size={15} />데모 데이터</button><button className={btnGhost} onClick={() => save()}><Save size={15} />저장</button><button className={btnPrimary} onClick={() => save(true)}><ScanSearch size={15} />저장 후 분석 시작</button></div>} />
      {msg && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="기본 정보">
          <div className="grid grid-cols-2 gap-3">
            <Field label="닉네임"><input className={input} value={p.nickname || ''} onChange={(e) => set('nickname', e.target.value)} /></Field>
            <Field label="출생연도"><input className={input} type="number" value={p.birth_year || ''} onChange={(e) => set('birth_year', Number(e.target.value) || null)} /></Field>
            <Field label="학력"><input className={input} value={p.education || ''} onChange={(e) => set('education', e.target.value)} /></Field>
            <Field label="전공"><input className={input} value={p.major || ''} onChange={(e) => set('major', e.target.value)} /></Field>
            <Field label="졸업 여부"><select className={input} value={p.graduation_status || ''} onChange={(e) => set('graduation_status', e.target.value)}>{['재학', '졸업예정', '졸업', '휴학'].map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="졸업(예정)일"><input className={input} value={p.graduation_date || ''} placeholder="2027-02" onChange={(e) => set('graduation_date', e.target.value)} /></Field>
            <Field label="학점"><input className={input} type="number" step="0.01" value={p.gpa ?? ''} onChange={(e) => set('gpa', Number(e.target.value))} /></Field>
            <Field label="만점"><input className={input} type="number" step="0.1" value={p.gpa_scale ?? ''} onChange={(e) => set('gpa_scale', Number(e.target.value))} /></Field>
            <Field label="병역 사항"><select className={input} value={p.military_status || ''} onChange={(e) => set('military_status', e.target.value)}><option value="">선택</option>{['군필', '면제', '해당없음', '복무중', '미필'].map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="국적"><input className={input} value={p.nationality || ''} onChange={(e) => set('nationality', e.target.value)} /></Field>
            <Field label="희망 근무 지역" hint="쉼표로 구분"><input className={input} value={(p.regions || []).join(', ')} onChange={(e) => set('regions', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} /></Field>
            <Field label="목표 취업 시기"><input className={input} value={p.target_period || ''} onChange={(e) => set('target_period', e.target.value)} /></Field>
          </div>
        </Card>

        <Card title="목표 기업 및 직렬" action={<button className="text-sm text-brand-600" onClick={() => add('targets', { company_id: 'korail', job_category: '', recruitment_type: '신입' })}><Plus size={14} className="inline" /> 추가</button>}>
          <div className="space-y-2">
            {(p.targets || []).map((t: any, i: number) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_90px_32px] gap-2">
                <select className={input} value={t.company_id} onChange={(e) => setIn('targets', i, 'company_id', e.target.value)}>{COMPANIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <input className={input} placeholder="직렬" value={t.job_category} onChange={(e) => setIn('targets', i, 'job_category', e.target.value)} />
                <select className={input} value={t.recruitment_type} onChange={(e) => setIn('targets', i, 'recruitment_type', e.target.value)}>{['신입', '인턴', '경력'].map((x) => <option key={x}>{x}</option>)}</select>
                <button onClick={() => del('targets', i)} className="text-slate-400 hover:text-rose-500"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="mb-2 text-sm font-medium text-slate-600">한국철도공사 체험형 인턴</div>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!p.intern?.is_korail_experience_intern} onChange={(e) => set('intern', { ...p.intern, is_korail_experience_intern: e.target.checked })} />인턴 이력 있음</label>
              <input className={input} placeholder="인턴 근무 직렬" value={p.intern?.job_category || ''} onChange={(e) => set('intern', { ...p.intern, job_category: e.target.value })} />
              <input className={input} type="date" value={p.intern?.completed_at || ''} onChange={(e) => set('intern', { ...p.intern, completed_at: e.target.value })} />
            </div>
            <div className="mt-1 text-xs text-slate-400">공고상 인턴 가점은 ‘인턴 근무 직렬과 동일 직렬 지원’ 시에만 적용됩니다. 수료일이 비어 있으면 수료 전으로 처리합니다.</div>
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="mb-2 text-sm font-medium text-slate-600">본인 확인이 필요한 지원자격 (자가 진술)</div>
            <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={!!p.self_declarations?.etc} onChange={(e) => set('self_declarations', { ...p.self_declarations, etc: e.target.checked })} />
              코레일 공고 ‘기타사항’(철도 현장 업무수행 가능, 채용 결격사유 미해당, 최종합격자 발표일 이후 근무 가능)을 직접 확인했습니다.</label>
          </div>
        </Card>

        <Card title="자격증" action={<button className="text-sm text-brand-600" onClick={() => add('certificates', { name: '', grade: '', acquired_at: '', expires_at: '' })}><Plus size={14} className="inline" /> 추가</button>}>
          <div className="mb-2 grid grid-cols-[1.4fr_0.7fr_1fr_1fr_32px] gap-2 text-xs text-slate-400"><span>자격증명</span><span>등급</span><span>취득일</span><span>유효기간</span><span /></div>
          <div className="space-y-2">
            {(p.certificates || []).map((c: any, i: number) => (
              <div key={i} className="grid grid-cols-[1.4fr_0.7fr_1fr_1fr_32px] gap-2">
                <input className={input} value={c.name} onChange={(e) => setIn('certificates', i, 'name', e.target.value)} />
                <input className={input} value={c.grade} placeholder="예: 1급" onChange={(e) => setIn('certificates', i, 'grade', e.target.value)} />
                <input className={input} type="date" value={c.acquired_at} onChange={(e) => setIn('certificates', i, 'acquired_at', e.target.value)} />
                <input className={input} type="date" value={c.expires_at} onChange={(e) => setIn('certificates', i, 'expires_at', e.target.value)} />
                <button onClick={() => del('certificates', i)} className="text-slate-400 hover:text-rose-500"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </Card>

        <Card title="어학 성적" action={<button className="text-sm text-brand-600" onClick={() => add('languages', { test: '', score: '', taken_at: '' })}><Plus size={14} className="inline" /> 추가</button>}>
          <div className="space-y-2">
            {(p.languages || []).map((c: any, i: number) => (
              <div key={i} className="grid grid-cols-[1.2fr_0.8fr_1fr_32px] gap-2">
                <input className={input} placeholder="시험" value={c.test} onChange={(e) => setIn('languages', i, 'test', e.target.value)} />
                <input className={input} placeholder="점수/등급" value={c.score} onChange={(e) => setIn('languages', i, 'score', e.target.value)} />
                <input className={input} type="date" value={c.taken_at} onChange={(e) => setIn('languages', i, 'taken_at', e.target.value)} />
                <button onClick={() => del('languages', i)} className="text-slate-400 hover:text-rose-500"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between"><span className="text-sm font-medium text-slate-600">프로젝트·인턴·대외활동</span><button className="text-sm text-brand-600" onClick={() => add('experiences', { type: '프로젝트', title: '' })}><Plus size={14} className="inline" /> 추가</button></div>
          <div className="mt-2 space-y-2">
            {(p.experiences || []).map((c: any, i: number) => (
              <div key={i} className="grid grid-cols-[100px_1fr_32px] gap-2">
                <select className={input} value={c.type} onChange={(e) => setIn('experiences', i, 'type', e.target.value)}>{['프로젝트', '인턴', '공모전', '대외활동'].map((x) => <option key={x}>{x}</option>)}</select>
                <input className={input} value={c.title} onChange={(e) => setIn('experiences', i, 'title', e.target.value)} />
                <button onClick={() => del('experiences', i)} className="text-slate-400 hover:text-rose-500"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </Card>

        <Card title="NCS 준비 현황">
          <div className="space-y-2">
            {NCS.map((s) => (
              <div key={s} className="grid grid-cols-[1fr_140px] items-center gap-2 text-sm"><span>{s}</span>
                <select className={input} value={p.ncs_status?.[s] || '미시작'} onChange={(e) => set('ncs_status', { ...p.ncs_status, [s]: e.target.value })}>{LEVELS.map((x) => <option key={x}>{x}</option>)}</select></div>
            ))}
          </div>
          <Field label="세부 취약 영역 (쉼표로 구분)"><input className={`${input} mt-1`} value={(p.weak_areas || []).join(', ')} onChange={(e) => set('weak_areas', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} /></Field>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="하루 학습 가능 시간"><input className={input} type="number" value={p.study_hours_per_day ?? ''} onChange={(e) => set('study_hours_per_day', Number(e.target.value))} /></Field>
            <Field label="주간 학습일"><input className={input} type="number" value={p.study_days_per_week ?? ''} onChange={(e) => set('study_days_per_week', Number(e.target.value))} /></Field>
          </div>
        </Card>

        <Card title="전공 준비 현황">
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from(new Set([...MAJOR, ...Object.keys(p.major_status || {})])).map((s) => (
              <div key={s} className="grid grid-cols-[1fr_120px] items-center gap-2 text-sm"><span>{s}</span>
                <select className={input} value={p.major_status?.[s] || ''} onChange={(e) => {
                  const m = { ...p.major_status }; if (e.target.value) m[s] = e.target.value; else delete m[s]; set('major_status', m)
                }}><option value="">해당 없음</option>{LEVELS.map((x) => <option key={x}>{x}</option>)}</select></div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
