import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { KEYS, store } from '../../lib/storage';
import type { QuestionRecord, QuestionType } from '../../lib/types';
import { Button, Chip, Frame, Notice, Spinner } from '../../ui/Deco';
import { useRun } from './useRun';

type Draft = { id?: number; category: string; type: QuestionType; question: string; options: string[]; answer: string; explanation: string; imageUrl: string };

const blank = (category = ''): Draft => ({ category, type: 'multiple_choice', question: '', options: ['', '', '', ''], answer: '', explanation: '', imageUrl: '' });

export function QuestionBank() {
  const [questions, setQuestions] = useState<QuestionRecord[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [message, setMessage] = useState('');
  const { busy, error, run } = useRun();
  const fileRef = useRef<HTMLInputElement>(null);
  const [replace, setReplace] = useState(false);

  const load = useCallback(() => {
    api<QuestionRecord[]>('GET', '/api/questions', undefined, 'host').then(setQuestions).catch((e: Error) => setLoadError(e.message));
  }, []);
  useEffect(load, [load]);

  const categories = useMemo(() => [...new Set((questions ?? []).map((q) => q.category))].sort((a, b) => a.localeCompare(b)), [questions]);
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (questions ?? []).filter((q) =>
      (!category || q.category === category) && (!type || q.type === type) &&
      (!needle || q.question.toLowerCase().includes(needle) || q.answer.toLowerCase().includes(needle)));
  }, [questions, search, category, type]);

  const remove = (q: QuestionRecord) => {
    if (!window.confirm(`Delete this question?\n\n${q.question}`)) return;
    void run(async () => { await api('DELETE', `/api/questions/${q.id}`, undefined, 'host'); load(); });
  };

  const exportAll = () => run(async () => {
    const res = await fetch('/api/export', { headers: { authorization: `Bearer ${store.get(KEYS.host) ?? ''}` } });
    if (!res.ok) throw new ApiError('Could not export.', res.status);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = 'trivium-questions.json'; a.click();
    URL.revokeObjectURL(url);
  });

  const importFile = (file: File) => run(async () => {
    let data: unknown;
    try { data = JSON.parse(await file.text()); } catch { throw new ApiError('That file is not valid JSON.', 400); }
    const list = Array.isArray(data) ? data : (data as { questions?: unknown })?.questions;
    if (replace && !window.confirm('Replace ALL existing questions with this file?')) return;
    const out = await api<{ imported: number; errors: { row: number; error: string }[] }>('POST', '/api/import', { questions: list, replace }, 'host');
    setMessage(`Imported ${out.imported} ${out.imported === 1 ? 'question' : 'questions'}.${out.errors.length ? ` Skipped ${out.errors.length}: row ${out.errors[0].row} ${out.errors[0].error}` : ''}`);
    load();
  });

  if (loadError) return <Notice tone="error">{loadError}</Notice>;
  if (!questions) return <div className="grid place-items-center py-24"><Spinner label="Loading questions" /></div>;

  if (editing) {
    return <QuestionForm draft={editing} categories={categories} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label className="label" htmlFor="q-search">Search</label>
          <input id="q-search" className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Question or answer text" />
        </div>
        <div>
          <label className="label" htmlFor="q-cat">Category</label>
          <select id="q-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="q-type">Type</label>
          <select id="q-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option>
            <option value="multiple_choice">Multiple choice</option>
            <option value="write_in">Write-in</option>
          </select>
        </div>
        <Button onClick={() => setEditing(blank(category))}>Add question</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-mute">
        <span>{shown.length} of {questions.length} questions</span>
        <span className="flex-1" />
        <label className="flex items-center gap-2"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace existing on import</label>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>Import JSON</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={exportAll}>Export JSON</Button>
      </div>
      {message ? <Notice>{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {!shown.length ? <Notice>No questions match.</Notice> : (
        <ul className="space-y-2">
          {shown.map((q) => {
            const s = q.stats;
            const rate = s && s.answers >= 3 ? Math.round((s.correct / s.answers) * 100) : null;
            return (
              <li key={q.id}>
                <Frame cut={8} inner="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <Chip>{q.category}</Chip>
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="font-semibold">{q.question}</div>
                    <div className="text-sm text-mute">
                      {q.type === 'write_in' ? 'Write-in' : `${q.options.length} options`} &middot; Answer: <span className="text-gold-light">{q.answer || 'host decides'}</span>
                      {s && s.answers ? <> &middot; asked {s.answers}x{rate !== null ? `, ${rate}% correct` : ''}</> : null}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...q, options: q.options.length ? q.options : ['', '', '', ''] })}>Edit</Button>
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => remove(q)}>Delete</Button>
                </Frame>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function QuestionForm({ draft, categories, onCancel, onSaved }: { draft: Draft; categories: string[]; onCancel: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  const { busy, error, run } = useRun();
  const mc = d.type === 'multiple_choice';
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setOption = (i: number, v: string) => setD((x) => {
    const options = x.options.map((o, j) => (j === i ? v : o));
    return { ...x, options, answer: x.answer === x.options[i] ? v : x.answer };
  });

  const save = () => run(async () => {
    const body = { category: d.category, type: d.type, question: d.question, imageUrl: d.imageUrl, explanation: d.explanation, answer: d.answer, options: mc ? d.options.filter((o) => o.trim()) : [] };
    if (d.id) await api('PUT', `/api/questions/${d.id}`, body, 'host');
    else await api('POST', '/api/questions', body, 'host');
    onSaved();
  });

  return (
    <Frame inner="p-6" className="mx-auto max-w-3xl">
      <h2 className="display mb-5 text-2xl text-gold-light">{d.id ? 'Edit question' : 'New question'}</h2>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="label" htmlFor="f-cat">Category</label>
            <input id="f-cat" className="input" list="cats" value={d.category} maxLength={40} onChange={(e) => set('category', e.target.value)} />
            <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <span className="label">Type</span>
            <div className="inline-flex border border-gold/40" role="radiogroup" aria-label="Question type">
              {([['multiple_choice', 'Multiple choice'], ['write_in', 'Write-in']] as const).map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={d.type === id} onClick={() => set('type', id)}
                  className={`px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] ${d.type === id ? 'bg-gold text-ink' : 'text-mute hover:text-cream'}`}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="f-q">Question</label>
          <textarea id="f-q" className="input min-h-24" value={d.question} maxLength={500} onChange={(e) => set('question', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="f-img">Image URL (optional)</label>
          <input id="f-img" className="input" value={d.imageUrl} placeholder="https://" onChange={(e) => set('imageUrl', e.target.value)} />
        </div>

        {mc ? (
          <fieldset>
            <legend className="label">Options. Pick the correct one.</legend>
            <div className="space-y-2">
              {d.options.map((o, i) => (
                <div key={i} className="flex items-center gap-3">
                  <input type="radio" name="correct" aria-label={`Option ${i + 1} is correct`} checked={!!o && d.answer === o} disabled={!o.trim()} onChange={() => set('answer', o)} className="h-5 w-5 accent-[#d9b45b]" />
                  <input className="input" value={o} maxLength={120} placeholder={`Option ${i + 1}`} onChange={(e) => setOption(i, e.target.value)} />
                  {d.options.length > 2 ? <button className="px-2 text-mute hover:text-ruby" aria-label={`Remove option ${i + 1}`} onClick={() => setD((x) => ({ ...x, options: x.options.filter((_, j) => j !== i), answer: x.answer === o ? '' : x.answer }))}>✕</button> : null}
                </div>
              ))}
            </div>
            {d.options.length < 6 ? <Button size="sm" variant="ghost" className="mt-3" onClick={() => setD((x) => ({ ...x, options: [...x.options, ''] }))}>Add option</Button> : null}
          </fieldset>
        ) : (
          <div>
            <label className="label" htmlFor="f-ans">Accepted answer (optional)</label>
            <input id="f-ans" className="input" value={d.answer} maxLength={200} onChange={(e) => set('answer', e.target.value)} />
            <p className="mt-1 text-xs text-mute">Separate alternatives with | (for example &ldquo;Everest|Mount Everest&rdquo;). Small typos still match. Leave empty to grade every answer by hand.</p>
          </div>
        )}

        <div>
          <label className="label" htmlFor="f-exp">Explanation (shown at reveal)</label>
          <textarea id="f-exp" className="input min-h-16" value={d.explanation} maxLength={500} onChange={(e) => set('explanation', e.target.value)} />
        </div>

        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="flex gap-3">
          <Button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save question'}</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </Frame>
  );
}
