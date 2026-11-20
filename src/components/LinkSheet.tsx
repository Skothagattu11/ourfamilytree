import { toast } from 'sonner';
import { useData, useUI } from '../store';
import { fullName, linkProblem, type LinkRel } from '../lib/family';
import { tr, useT } from '../lib/i18n';
import { Picker } from './RelationSheet';
import { Avatar, Button, Icon3D, Sheet, cn, type Icon3DName } from './ui';

/** "How is A related to B?" → Parent / Child / Partner. Opened by dragging between cards or from the person panel. */
export function LinkSheet() {
  const t = useT();
  const req = useUI(s => s.linkReq);
  const set = useUI(s => s.set);
  const people = useData(s => s.people);
  const A = req ? people[req.a] : undefined, B = req?.b ? people[req.b] : undefined;
  const close = () => set({ linkReq: null });

  const problemText = (rel: LinkRel) => {
    if (!A || !B) return null;
    const p = linkProblem(people, A.id, rel, B.id);
    if (!p) return null;
    const child = rel === 'child' ? A : B;
    return p === 'same' ? t('linkSame') : p === 'exists' ? t('linkExists') : p === 'twoParents' ? t('linkTwoParents', { n: child.first }) : t('linkAncestor');
  };

  const choose = (rel: LinkRel) => {
    if (!A || !B || problemText(rel)) return;
    useData.getState().link(A.id, rel, B.id);
    toast.success(tr('linked', { a: A.first, b: B.first }));
    close();
    set({ sel: A.id, focus: { id: A.id, tick: Date.now() } });
  };

  const options: { rel: LinkRel; icon: Icon3DName; label: string }[] = B ? [
    { rel: 'parent', icon: 'parent', label: t('linkParentOf', { b: B.first }) },
    { rel: 'child', icon: 'child', label: t('linkChildOf', { b: B.first }) },
    { rel: 'partner', icon: 'partner', label: t('linkPartnerOf', { b: B.first }) },
  ] : [];

  return (
    <Sheet open={!!req && !!A} onOpenChange={o => !o && close()} title={t('linkTitle')} closeLabel={t('close')}>
      {A && (
        <div className="px-5 pb-6 pt-3 sm:pt-6">
          <div className="flex items-start gap-3 pr-10">
            <Icon3D name="link" size={44} />
            <div className="min-w-0">
              <h2 className="font-serif text-[24px] font-semibold leading-tight tracking-tight">{t('linkTitle')}</h2>
              <p className="mt-0.5 text-[14px] text-muted">{B ? t('linkHow', { a: fullName(A), b: fullName(B) }) : t('linkPick', { a: fullName(A) })}</p>
            </div>
          </div>

          {!B ? (
            <div className="mt-5">
              <Picker label={t('choose')} onChange={b => set({ linkReq: { a: A.id, b } })} />
              <p className="mt-3 text-[12.5px] text-muted">{t('linkHint')}</p>
            </div>
          ) : (
            <>
              <div className="mt-5 flex items-center justify-center gap-3 text-[14px]">
                <span className="flex items-center gap-2 font-medium"><Avatar p={A} size={36} />{A.first}</span>
                <span className="text-muted">→</span>
                <span className="flex items-center gap-2 font-medium"><Avatar p={B} size={36} />{B.first}</span>
              </div>
              <div className="mt-5 space-y-2">
                {options.map(o => {
                  const why = problemText(o.rel);
                  return (
                    <button key={o.rel} disabled={!!why} onClick={() => choose(o.rel)}
                      className={cn('flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-left transition',
                        why ? 'opacity-50' : 'hover:bg-soft active:scale-[.99]')}>
                      <Icon3D name={o.icon} size={34} />
                      <span className="flex-1">
                        <span className="block font-medium">{A.first} — {o.label}</span>
                        {why && <span className="block text-[12.5px] text-muted">{why}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** Tapped a line on the tree: confirm removing that link (with Undo). */
export function UnlinkSheet() {
  const t = useT();
  const req = useUI(s => s.unlinkReq);
  const set = useUI(s => s.set);
  const people = useData(s => s.people);
  const close = () => set({ unlinkReq: null });

  const run = (pairs: [string, LinkRel, string][]) => {
    const d = useData.getState();
    const snap = d.unlink(...pairs[0]);
    pairs.slice(1).forEach(p => useData.getState().unlink(...p));
    close();
    toast(tr('unlinked'), { action: { label: tr('undo'), onClick: () => useData.getState().restore(snap) } });
  };

  let body = null;
  if (req?.kind === 'partner' && people[req.a] && people[req.b]) {
    const A = people[req.a], B = people[req.b];
    body = (
      <>
        <p className="mt-4 text-[15px]">{t('unlinkPartner', { a: fullName(A), b: fullName(B) })}</p>
        <Button variant="danger" className="mt-5 w-full" onClick={() => run([[A.id, 'partner', B.id]])}>{t('unlinkDo')}</Button>
      </>
    );
  } else if (req?.kind === 'parent' && people[req.child]) {
    const C = people[req.child];
    const ps = req.parents.filter(p => people[p]);
    body = (
      <>
        <p className="mt-4 text-[15px]">{t('unlinkParent', { c: fullName(C) })}</p>
        <div className="mt-4 space-y-2">
          {ps.map(p => (
            <button key={p} onClick={() => run([[p, 'parent', C.id]])}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-left text-danger hover:bg-soft">
              <Avatar p={people[p]} size={32} /> {t('unlinkOne', { p: fullName(people[p]) })}
            </button>
          ))}
          {ps.length > 1 && (
            <Button variant="danger" className="w-full" onClick={() => run(ps.map(p => [p, 'parent', C.id] as [string, LinkRel, string]))}>{t('unlinkBoth')}</Button>
          )}
        </div>
      </>
    );
  }

  return (
    <Sheet open={!!req && !!body} onOpenChange={o => !o && close()} title={t('unlinkTitle')} closeLabel={t('close')}>
      <div className="px-5 pb-6 pt-3 sm:pt-6">
        <div className="flex items-start gap-3 pr-10">
          <Icon3D name="link" size={44} />
          <h2 className="font-serif text-[24px] font-semibold leading-tight tracking-tight">{t('unlinkTitle')}</h2>
        </div>
        {body}
      </div>
    </Sheet>
  );
}
