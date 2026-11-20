import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useData, useUI } from '../store';
import { fam, fullName, yearsTxt } from '../lib/family';
import { pathBetween } from '../lib/relations';
import { useT } from '../lib/i18n';
import { RelationSentence, relationLabel } from './RelationText';
import { Avatar, Button, Icon3D, Sheet, cn } from './ui';

function Picker({ value, onChange, label }: { value?: string; onChange: (id: string) => void; label: string }) {
  const t = useT();
  const people = useData(s => s.people);
  const me = useData(s => s.me);
  const [open, setOpen] = useState(!value);
  const p = value ? people[value] : undefined;
  useEffect(() => setOpen(!value), [value]);
  const list = Object.values(people).filter(x => !x.placeholder).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  return (
    <div className="rounded-2xl border border-line bg-paper">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        {p ? <Avatar p={p} size={36} /> : <span className="h-9 w-9 rounded-full border border-dashed border-line" />}
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold uppercase tracking-[.08em] text-muted">{label}</div>
          <div className="truncate font-medium">{p ? `${fullName(p)}${p.id === me ? ` (${t('you')})` : ''}` : t('choose')}</div>
        </div>
        <ChevronDown size={18} className={cn('text-muted transition', open && 'rotate-180')} />
      </button>
      {open && (
        <Command className="border-t border-line" loop>
          <Command.Input autoFocus placeholder={t('typeName')} className="!px-4 !py-3" />
          <Command.List className="!max-h-56 !border-t-0">
            <Command.Empty>{t('noMatch')}</Command.Empty>
            {list.map(x => (
              <Command.Item key={x.id} value={`${fullName(x)} ${x.id}`} onSelect={() => { onChange(x.id); setOpen(false); }}>
                <Avatar p={x} size={30} />
                <span className="flex-1 truncate">{fullName(x)}{x.id === me ? ` (${t('you')})` : ''}</span>
                <span className="text-[12px] text-muted">{yearsTxt(x)}</span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      )}
    </div>
  );
}

export function RelationSheet() {
  const t = useT();
  const rel = useUI(s => s.rel);
  const set = useUI(s => s.set);
  const people = useData(s => s.people);
  const me = useData(s => s.me);
  const [a, setA] = useState<string>();
  const [b, setB] = useState<string>();
  useEffect(() => {
    if (!rel) return;
    const first = rel.a ?? (me || undefined);
    setA(first);
    setB(rel.b ?? (me && me !== first ? me : undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rel]);

  const A = a ? people[a] : undefined, B = b ? people[b] : undefined;
  const path = A && B ? pathBetween(people, A.id, B.id) : null;

  const show = () => {
    if (!path || !A || !B) return;
    const ui = useUI.getState();
    ui.set({
      rel: null, view: 'tree', sel: null,
      fams: [...new Set([...(ui.view === 'tree' ? ui.fams : []), ...path.map(id => fam(people[id]))])],
      path, pathLabel: relationLabel(people, A.id, B.id, B.id === me),
      fitTick: ui.fitTick + 1,
    });
  };

  return (
    <Sheet
      open={!!rel}
      onOpenChange={o => !o && set({ rel: null })}
      title={t('howRelatedQ')}
      footer={<div className="flex gap-2"><Button variant="ghost" onClick={() => set({ rel: null })}>{t('close')}</Button><div className="flex-1" />
        <Button variant="primary" disabled={!path || path.length < 2} onClick={show}>{t('showOnTree')}</Button></div>}
    >
      <div className="px-5 pb-6 pt-3 sm:pt-6">
        <div className="flex items-start gap-3 pr-10">
          <Icon3D name="link" size={44} />
          <div>
            <h2 className="font-serif text-[24px] font-semibold leading-tight tracking-tight">{t('howRelatedQ')}</h2>
            <p className="mt-0.5 text-[14px] text-muted">{t('pickTwo')}</p>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <Picker label={t('firstPerson')} value={a} onChange={setA} />
          <Picker label={t('secondPerson')} value={b} onChange={setB} />
        </div>

        {A && B && (
          <div className="mt-6 rounded-3xl bg-soft p-5 text-center">
            <RelationSentence a={A.id} b={B.id} youAreB={B.id === me} />
            {path && path.length > 1 && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                {path.map((id, i) => (
                  <span key={id} className="flex items-center gap-1.5">
                    {i > 0 && <ArrowRight size={13} className="text-muted" />}
                    <span className="flex items-center gap-1.5 rounded-full bg-card py-1 pl-1 pr-2.5 text-[13px]">
                      <Avatar p={people[id]} size={22} />{id === me ? t('you') : people[id].first}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
