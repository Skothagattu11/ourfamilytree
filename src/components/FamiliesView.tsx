import { ArrowRight, Plus } from 'lucide-react';
import { useData, useUI, openFamilies, openForm, useLineColor } from '../store';
import { families, linkedFamilies, yr } from '../lib/family';
import { layout } from '../lib/layout';
import { useT } from '../lib/i18n';
import { Avatar, Button, Icon3D } from './ui';

export function FamiliesView() {
  const t = useT();
  const people = useData(s => s.people);
  const color = useLineColor();
  const fm = families(people);
  const names = Object.keys(fm).sort((a, b) => fm[b].length - fm[a].length || a.localeCompare(b));

  if (!names.length)
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 pb-32 pt-16 text-center">
        <Icon3D name="tree" size={120} />
        <h1 className="mt-6 font-serif text-[32px] font-semibold leading-tight tracking-tight">{t('startTitle')}</h1>
        <p className="mt-3 text-muted">{t('startBody')}</p>
        <div className="mt-8 flex w-full flex-col gap-3">
          <Button variant="primary" size="lg" onClick={() => openForm({ mode: 'new', first: true })}>{t('addYourself')}</Button>
        </div>
      </div>
    );

  const all = layout(people, Object.keys(people));
  const gens = new Set(Object.values(all.gen)).size;
  const total = Object.keys(people).length;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-32 pt-6 sm:px-6 sm:pt-10">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[.12em] text-muted">{t('yourFamilies')}</p>
          <h1 className="mt-1 font-serif text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[40px]">
            {t('peopleGens', { n: total, g: gens })}
          </h1>
          <p className="mt-2 text-muted">{t('lines', { n: names.length })}</p>
        </div>
        <Button variant="primary" size="lg" onClick={() => openFamilies(names)} className="w-full sm:w-auto">
          <Icon3D name="tree" size={24} className="-ml-1" /> {t('viewEveryone')}
        </Button>
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {names.map(n => {
          const list = fm[n].slice().sort((a, b) => (yr(a.born) || 0) - (yr(b.born) || 0));
          const ys = list.map(p => yr(p.born)).filter(Boolean) as number[];
          const linked = linkedFamilies(people, n);
          const gensHere = new Set(list.map(p => all.gen[p.id])).size;
          return (
            <article
              key={n}
              onClick={() => openFamilies([n])}
              className="shadow-card group cursor-pointer rounded-[24px] border border-line bg-card p-5 transition hover:-translate-y-0.5 active:scale-[.99]"
            >
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-soft font-serif text-[22px] font-semibold text-ink">{n[0]}</div>
                <div className="min-w-0 flex-1">
                  <h2 className="flex items-center gap-2 font-serif text-[21px] font-semibold leading-tight">
                    <span className="truncate">{n}</span>
                    <span className="h-1 w-5 shrink-0 rounded-full" style={{ background: color(n) }} />
                  </h2>
                  <p className="mt-0.5 text-[13.5px] text-muted">
                    {list.length === 1 ? t('personOne') : t('personCount', { n: list.length })} · {gensHere === 1 ? t('genOne') : t('gensCount', { n: gensHere })}
                    {ys.length ? ` · ${Math.min(...ys)}–${Math.max(...ys)}` : ''}
                  </p>
                </div>
                <ArrowRight size={18} className="mt-1 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
              </div>

              <div className="mt-4 flex items-center">
                {list.slice(0, 6).map((p, i) => (
                  <Avatar key={p.id} p={p} size={34} className={i ? '-ml-2 ring-2 ring-card' : 'ring-2 ring-card'} />
                ))}
                {list.length > 6 && <span className="ml-2 text-[13px] text-muted">+{list.length - 6}</span>}
                <button
                  onClick={e => { e.stopPropagation(); openForm({ mode: 'new', surname: n }); }}
                  className="ml-auto flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-medium text-muted hover:bg-soft hover:text-ink"
                >
                  <Plus size={14} /> {t('add')}
                </button>
              </div>

              {linked.length > 0 && (
                <p className="mt-4 border-t border-line pt-3 text-[13px] text-muted">
                  {t('joinedWith')} <span className="text-ink">{linked.join(', ')}</span>
                </p>
              )}
            </article>
          );
        })}
      </section>

      <button
        onClick={() => useUI.getState().set({ rel: {} })}
        className="shadow-card mt-6 flex w-full items-center gap-4 rounded-[24px] border border-line bg-card p-5 text-left transition hover:bg-soft"
      >
        <Icon3D name="link" size={44} />
        <div className="flex-1">
          <div className="font-semibold">{t('howRelatedQ')}</div>
          <div className="text-[13.5px] text-muted">{t('howRelatedSub')}</div>
        </div>
        <ArrowRight size={18} className="text-muted" />
      </button>
    </div>
  );
}
