import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, Link2, Pencil, Spline, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useData, useUI, openForm, goTo, openFamilies } from '../store';
import { fam, fullName, kidsOf, sibsOf, yr } from '../lib/family';
import { fileToAvatar } from '../lib/image';
import { pathBetween } from '../lib/relations';
import { useT, tr } from '../lib/i18n';
import { RelationSentence, relationLabel } from './RelationText';
import { useVoice } from '../lib/voice/session';
import { Avatar, Button, Icon3D, Sheet, type Icon3DName } from './ui';

function PeopleRow({ ids, label }: { ids: string[]; label: string }) {
  const people = useData(s => s.people);
  const list = ids.map(id => people[id]).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="mt-5">
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[.1em] text-muted">{label}</h3>
      <div className="flex flex-wrap gap-2">
        {list.map(q => (
          <button key={q.id} onClick={() => goTo(q.id)} className="flex h-10 items-center gap-2 rounded-full border border-line bg-card pl-1 pr-3.5 text-[14px] hover:bg-soft">
            <Avatar p={q} size={30} />
            {fullName(q)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "This is me" + "How is X related to me?" */
function MeSection({ id }: { id: string }) {
  const t = useT();
  const people = useData(s => s.people);
  const me = useData(s => s.me);
  const setMe = useData(s => s.setMe);
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(false), [id, me]);
  const p = people[id];
  if (!p || p.placeholder) return null;
  const claim = () => { setMe(id); toast.success(tr('gotItYou', { n: p.first })); };

  if (me === id)
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-[14px]">
        <UserRound size={18} className="text-accent" />
        <span className="flex-1 font-medium">{t('thisIsYou')}</span>
        <button onClick={() => setMe(null)} className="text-[13px] text-muted hover:text-ink">{t('notMe')}</button>
      </div>
    );

  if (!me || !people[me])
    return (
      <button onClick={claim} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left text-[14px] hover:bg-soft">
        <UserRound size={18} className="text-muted" />
        <span className="flex-1"><span className="font-medium">{t('thisIsMe')}</span>
          <span className="block text-[12.5px] text-muted">{t('thisIsMeSub')}</span></span>
      </button>
    );

  const path = pathBetween(people, me, id);
  const showOnTree = () => {
    if (!path) return;
    const ui = useUI.getState();
    ui.set({
      sel: null, path, pathLabel: relationLabel(people, id, me, true),
      fams: [...new Set([...ui.fams, ...path.map(x => fam(people[x]))])],
      fitTick: ui.fitTick + 1,
    });
  };

  return (
    <div className="mt-4">
      {!shown ? (
        <button onClick={() => setShown(true)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-left hover:bg-soft">
          <Icon3D name="link" size={30} />
          <span className="flex-1 text-[14.5px] font-medium">{t('howRelatedToMe', { n: p.first })}</span>
          <ArrowRight size={16} className="text-muted" />
        </button>
      ) : (
        <div className="rounded-2xl bg-soft p-4">
          <RelationSentence a={id} b={me} youAreB />
          {path && path.length > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {path.map((x, i) => (
                <span key={x} className="flex items-center gap-1.5">
                  {i > 0 && <ArrowRight size={12} className="text-muted" />}
                  <span className="flex items-center gap-1.5 rounded-full bg-card py-1 pl-1 pr-2.5 text-[13px]">
                    <Avatar p={people[x]} size={22} />{x === me ? t('you') : people[x].first}
                  </span>
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            {path && path.length > 1 && <Button size="sm" variant="primary" onClick={showOnTree}>{t('showOnTree')}</Button>}
            <button onClick={claim} className="ml-auto text-[12.5px] text-muted hover:text-ink">{t('actuallyMe')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PersonSheet() {
  const t = useT();
  const { sel, view, set } = useUI();
  const people = useData(s => s.people);
  const p = sel ? people[sel] : undefined;
  const file = useRef<HTMLInputElement>(null);
  const voiceOpen = useVoice(s => s.open);
  const open = !!p && view === 'tree' && !voiceOpen;

  const pickPhoto = async (f?: File) => {
    if (!f || !p) return;
    try { useData.getState().update(p.id, { photo: await fileToAvatar(f) }); toast(tr('photoAdded')); }
    catch { toast.error(tr('imgErr')); }
  };

  const del = () => {
    if (!p) return;
    const snap = useData.getState().remove(p.id);
    set({ sel: null });
    toast(tr('removed', { n: p.first }), { action: { label: tr('undo'), onClick: () => { useData.getState().restore(snap); set({ sel: p.id }); } } });
  };

  const actions: { mode: 'child' | 'spouse' | 'parent' | 'sibling'; icon: Icon3DName; label: string; hide?: boolean }[] = p ? [
    { mode: 'child', icon: 'child', label: t('child') },
    { mode: 'spouse', icon: 'partner', label: t('partner') },
    { mode: 'parent', icon: 'parent', label: t('parent'), hide: p.parents.length >= 2 },
    // the new person's gender isn't known yet — it's chosen in the form
    { mode: 'sibling', icon: 'sibling', label: t('sibling') },
  ] : [];
  const b = p && (yr(p.born) || p.born), d = p && (yr(p.died) || p.died);

  return (
    <Sheet
      open={open}
      modal={false}
      onOpenChange={o => !o && set({ sel: null })}
      closeLabel={t('close')}
      title={p ? fullName(p) : ''}
      footer={p && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => openForm({ mode: 'edit', of: p.id })}><Pencil size={15} /> {t('edit')}</Button>
          <Button size="sm" className="flex-1" onClick={() => set({ linkReq: { a: p.id } })}><Spline size={15} /> {t('link')}</Button>
          <Button size="sm" className="flex-1" onClick={() => set({ rel: { a: p.id } })}><Link2 size={15} /> {t('related')}</Button>
          <Button size="sm" variant="danger" onClick={del} aria-label={t('del')}><Trash2 size={15} /></Button>
        </div>
      )}
    >
      {p && (
        <div className="px-5 pb-6 pt-3 sm:pt-6">
          <div className="flex items-center gap-4">
            <button onClick={() => file.current?.click()} className="group relative shrink-0" aria-label={p.photo ? t('changePhoto') : t('addPhoto')}>
              <Avatar p={p} size={76} />
              <span className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full border border-line bg-card text-muted shadow-sm group-hover:text-ink">
                <Camera size={14} />
              </span>
            </button>
            <input ref={file} type="file" accept="image/*" hidden onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="min-w-0 flex-1 pr-10">
              <h2 className="font-serif text-[25px] font-semibold leading-tight tracking-tight">{p.placeholder ? t('unknown') : fullName(p)}</h2>
              <p className="mt-0.5 text-[14px] text-muted">
                {[b ? t('born', { y: b }) : '', d ? t('died', { y: d }) : ''].filter(Boolean).join(' · ') || t('noDates')}
              </p>
              <button onClick={() => openFamilies([fam(p)])} className="mt-1.5 text-[13.5px] font-medium text-accent hover:underline">
                {t('familyLink', { f: fam(p) })}
              </button>
            </div>
          </div>

          {!p.photo && !p.placeholder && (
            <button onClick={() => file.current?.click()} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-left text-[14px] text-muted hover:bg-soft">
              <Icon3D name="camera" size={30} />
              <span>{t('addPhoto')} <span className="opacity-70">· {t('optional')}</span></span>
            </button>
          )}

          <MeSection id={p.id} />

          {p.notes && <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-soft px-4 py-3 text-[14.5px]">{p.notes}</p>}

          <div className="mt-5 grid grid-cols-4 gap-2">
            {actions.filter(a => !a.hide).map(a => (
              <button
                key={a.mode}
                onClick={() => openForm({ mode: a.mode, of: p.id })}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-card px-1 pb-2.5 pt-3 text-[13px] font-medium transition hover:bg-soft active:scale-[.97]"
              >
                <Icon3D name={a.icon} size={36} />
                <span className="flex items-center gap-0.5 text-center leading-tight"><span className="text-muted">+</span>{a.label}</span>
              </button>
            ))}
          </div>

          <PeopleRow label={t('parents')} ids={p.parents} />
          <PeopleRow label={p.spouses.length > 1 ? t('partners') : t('partnerOne')} ids={p.spouses} />
          <PeopleRow label={t('children')} ids={kidsOf(people, p.id)} />
          <PeopleRow label={t('siblings')} ids={sibsOf(people, p.id)} />
          {p.photo && (
            <button onClick={() => useData.getState().update(p.id, { photo: undefined })} className="mt-6 text-[13px] text-muted underline-offset-2 hover:underline">
              {t('removePhoto')}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
