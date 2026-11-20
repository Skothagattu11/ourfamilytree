import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useData, useUI, goTo } from '../store';
import type { FormState, Sex } from '../types';
import { fam, families, fullName } from '../lib/family';
import { fileToAvatar } from '../lib/image';
import { Button, Icon3D, Sheet, cn } from './ui';
import { useT, tr } from '../lib/i18n';

const blank = { first: '', surname: '', sex: '' as Sex, born: '', died: '', notes: '', photo: '' as string | undefined, co: '' };

function parseTokens(raw: string, surname: string, multi: boolean) {
  const parts = multi ? raw.split(/\s*[,\n;]\s*/) : [raw.replace(/\s*[,\n;]\s*/g, ' ')];
  return parts.map(s => s.trim()).filter(Boolean).map(t => {
    let born = '', sn = surname;
    const m = t.match(/^(.*?)[\s(]+(\d{4})\)?$/);
    if (m) { t = m[1].trim(); born = m[2]; }
    if (sn && t.toLowerCase().endsWith(' ' + sn.toLowerCase())) t = t.slice(0, -sn.length).trim();
    else if (!sn && t.includes(' ')) { const w = t.split(/\s+/); sn = w.pop()!; t = w.join(' '); }
    return { first: t, born, surname: sn };
  });
}

function defaults(f: FormState) {
  const { people } = useData.getState();
  const { fams, view } = useUI.getState();
  const o = f.of ? people[f.of] : undefined;
  const v = { ...blank, first: f.name || '', surname: f.surname || '' };
  if (f.mode === 'edit' && o) return { ...v, first: o.placeholder ? '' : o.first, surname: o.surname, sex: o.sex, born: o.born, died: o.died, notes: o.notes, photo: o.photo };
  if (!o) return v;
  const inView = (s: string) => view === 'tree' && fams.includes(s);
  if (f.mode === 'child') {
    const blood = !inView(fam(o)) && o.spouses.map(s => people[s]).find(s => s && inView(fam(s)));
    v.surname = blood ? fam(blood) : o.surname;
    v.co = o.spouses.find(s => people[s]) || '';
  }
  if (f.mode === 'parent' || f.mode === 'sibling') v.surname = o.surname;
  if (f.mode === 'spouse') v.sex = o.sex === 'f' ? 'm' : o.sex === 'm' ? 'f' : '';
  if (f.mode === 'parent') { const other = o.parents.map(x => people[x]).find(Boolean); if (other) v.sex = other.sex === 'f' ? 'm' : other.sex === 'm' ? 'f' : ''; }
  return v;
}

export function PersonForm() {
  const tT = useT();
  const form = useUI(s => s.form);
  const set = useUI(s => s.set);
  const people = useData(s => s.people);
  const [v, setV] = useState(blank);
  const [flash, setFlash] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (form) { setV(defaults(form)); setFlash(''); setTimeout(() => nameRef.current?.focus(), 350); } }, [form]);

  if (!form) return <Sheet open={false} onOpenChange={() => {}} title="Person">{null}</Sheet>;
  const o = form.of ? people[form.of] : undefined;
  const tt = tT;
  const multi = ['child', 'sibling', 'new'].includes(form.mode) && !form.first;
  const close = () => set({ form: null });

  const titles: Record<string, [string, string]> = {
    new: form.first ? [tt('whoFirst'), tt('whoFirstSub')] : [tt('addAPerson'), ''],
    edit: [tt('editDetails'), ''],
    child: [tt('addChild'), o ? tt('childOf', { n: fullName(o) }) : ''],
    spouse: [tt('addPartner'), o ? tt('partnerOf', { n: fullName(o) }) : ''],
    parent: [tt('addParent'), o ? tt('parentOf', { n: fullName(o) }) : ''],
    sibling: [tt('addSibling'), o ? tt('siblingOf', { n: fullName(o) }) : ''],
  };
  const [title, ctx] = titles[form.mode];
  const icon = ({ child: 'child', spouse: 'partner', parent: 'parent', sibling: 'sibling', new: 'people', edit: 'notes' } as const)[form.mode];

  const save = (more: boolean) => {
    const toks = parseTokens(v.first, v.surname.trim(), multi);
    if (!toks.length) { nameRef.current?.focus(); return; }
    const base = { sex: v.sex, born: v.born.trim(), died: v.died.trim(), notes: v.notes.trim(), photo: v.photo || undefined };
    const d = useData.getState();
    let made: string[] = [];
    if (form.mode === 'edit' && o) {
      const t = toks[0];
      d.update(o.id, { ...base, first: t.first, surname: t.surname, born: base.born || t.born });
    } else {
      made = d.add(form.mode, form.of, toks.map(t => ({ ...base, first: t.first, surname: t.surname, born: base.born || t.born, photo: toks.length === 1 ? base.photo : undefined })), v.co || undefined);
    }
    const names = made.map(id => useData.getState().people[id].first).join(', ');
    if (form.mode === 'new' && made.length) {
      const ui = useUI.getState();
      const newFams = [...new Set(made.map(id => fam(useData.getState().people[id])))];
      ui.set({ view: 'tree', fams: [...new Set([...(ui.view === 'tree' ? ui.fams : []), ...newFams])], fitTick: ui.fitTick + 1 });
      if (form.first) useData.getState().setMe(made[0]);   // "Add yourself" → that's you
      if (!more) goTo(made[0], false);
    } else if (made.length) {
      useUI.getState().set({ focus: { id: made[0], tick: Date.now() } });
    }
    if (more) {
      setV(x => ({ ...x, first: '', born: '', died: '', notes: '', photo: '' }));
      setFlash(tr('addedKeepGoing', { n: names }));
      nameRef.current?.focus();
    } else {
      close();
      toast.success(form.mode === 'edit' ? tr('saved') : form.first ? tr('welcomeYou', { n: names }) : tr('added', { n: names }));
    }
  };

  const surnames = Object.keys(families(people));
  const lbl = 'mb-1.5 block text-[13px] font-semibold';

  return (
    <Sheet
      open={!!form}
      onOpenChange={o => !o && close()}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={close}>{tt('cancel')}</Button>
          <div className="flex-1" />
          {multi && <Button onClick={() => save(true)}>{tt('saveMore')}</Button>}
          <Button variant="primary" onClick={() => save(false)}>{tt('save')}</Button>
        </div>
      }
    >
      <form className="px-5 pb-6 pt-3 sm:pt-6" onSubmit={e => { e.preventDefault(); save(false); }}>
        <div className="flex items-start gap-3">
          <Icon3D name={icon} size={44} />
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[24px] font-semibold leading-tight tracking-tight">{title}</h2>
            {ctx && <p className="mt-0.5 text-[14px] text-muted">{ctx}</p>}
          </div>
        </div>

        {/* optional photo */}
        <div className="mt-5 flex items-center gap-3">
          <button type="button" onClick={() => photoRef.current?.click()}
            className={cn('relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full', v.photo ? '' : 'border border-dashed border-line bg-paper')}>
            {v.photo ? <img src={v.photo} alt="" className="h-full w-full object-cover" /> : <Icon3D name="camera" size={30} />}
          </button>
          <div className="text-[14px]">
            <button type="button" onClick={() => photoRef.current?.click()} className="font-medium hover:underline">{v.photo ? tt('changePhoto') : tt('addPhoto')}</button>
            <span className="text-muted"> · {tt('optional')}</span>
            {v.photo && <button type="button" onClick={() => setV({ ...v, photo: '' })} className="ml-2 inline-flex items-center gap-1 text-muted hover:text-ink"><X size={13} />{tt('removePhoto')}</button>}
            <div className="text-[12.5px] text-muted">{tt('photoHint')}</div>
          </div>
          <input ref={photoRef} type="file" accept="image/*" hidden onChange={async e => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (f) try { const photo = await fileToAvatar(f); setV(x => ({ ...x, photo })); } catch { toast.error(tr('imgErr')); }
          }} />
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className={lbl}>{tt('name')}</span>
            <input ref={nameRef} className="field" value={v.first} onChange={e => setV({ ...v, first: e.target.value })}
              placeholder={multi ? 'Anu 1990, Ravi 1993' : tt('namePh')} autoComplete="off" enterKeyHint="done" />
            {multi && <span className="mt-1.5 block text-[12.5px] text-muted">{tt('multiHint')}</span>}
          </label>

          <label className="block">
            <span className={lbl}>{tt('familyName')}</span>
            <input className="field" list="surnames" value={v.surname} onChange={e => setV({ ...v, surname: e.target.value })} placeholder={tt('familyNamePh')} autoComplete="off" />
            <datalist id="surnames">{surnames.map(s => <option key={s} value={s} />)}</datalist>
            <span className="mt-1.5 block text-[12.5px] text-muted">{tt('familyNameHint')}</span>
          </label>

          <div>
            <span className={lbl}>{tt('gender')}</span>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-soft p-1">
              {([['f', tt('female')], ['m', tt('male')], ['', tt('notSet')]] as [Sex, string][]).map(([k, t]) => (
                <button type="button" key={t} onClick={() => setV({ ...v, sex: k })}
                  className={cn('h-10 rounded-xl text-[14px] font-medium transition', v.sex === k ? 'bg-card shadow-sm' : 'text-muted')}>{t}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={lbl}>{tt('bornL')}</span>
              <input className="field" inputMode="numeric" value={v.born} onChange={e => setV({ ...v, born: e.target.value })} placeholder={tt('year')} /></label>
            <label className="block"><span className={lbl}>{tt('diedL')}</span>
              <input className="field" inputMode="numeric" value={v.died} onChange={e => setV({ ...v, died: e.target.value })} placeholder={tt('optionalCap')} /></label>
          </div>

          {form.mode === 'child' && o && o.spouses.some(s => people[s]) && (
            <label className="block"><span className={lbl}>{tt('otherParent')}</span>
              <select className="field" value={v.co} onChange={e => setV({ ...v, co: e.target.value })}>
                {o.spouses.filter(s => people[s]).map(s => <option key={s} value={s}>{fullName(people[s])}</option>)}
                <option value="">{tt('someoneElse')}</option>
              </select>
            </label>
          )}

          <label className="block"><span className={lbl}>{tt('notes')}</span>
            <textarea className="field min-h-[88px] resize-y" value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} placeholder={tt('notesPh')} />
          </label>
          {flash && <p className="text-[13.5px] font-medium text-accent">{flash}</p>}
        </div>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
