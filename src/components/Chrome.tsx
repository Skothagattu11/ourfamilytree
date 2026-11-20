import { useEffect, useRef, useState } from 'react';
import { Ellipsis, Mic, Network, Plus, Search as SearchIcon, Share2, Users } from 'lucide-react';
import { startVoice, useVoice } from '../lib/voice/session';
import { toast } from 'sonner';
import { useData, useUI, openFamilies, openForm, goTo, inviteLink } from '../store';
import { families } from '../lib/family';
import { sampleData } from '../lib/sample';
import { tr, useT } from '../lib/i18n';
import type { TreeData } from '../types';
import { LangSwitch } from './Welcome';
import { Avatar, Button, Icon3D, Sheet, cn, useIsMobile, type Icon3DName } from './ui';

function addPerson() {
  const { people } = useData.getState();
  const ui = useUI.getState();
  if (!Object.keys(people).length) return openForm({ mode: 'new', first: true });
  if (ui.view === 'tree' && ui.sel) return openForm({ mode: 'child', of: ui.sel });
  openForm({ mode: 'new', surname: ui.view === 'tree' && ui.fams.length === 1 ? ui.fams[0] : '' });
}

function goTree() {
  const ui = useUI.getState();
  if (ui.view === 'tree') return;
  const names = Object.keys(families(useData.getState().people));
  if (ui.fams.length) ui.set({ view: 'tree', fitTick: ui.fitTick + 1 }); else openFamilies(names);
}

/** Share the tree picture — opens the tree first if we're on the families page. */
export function shareTreeImage() {
  const ui = useUI.getState();
  if (!Object.keys(useData.getState().people).length) return;
  if (ui.view !== 'tree') {
    openFamilies(ui.fams.length ? ui.fams : Object.keys(families(useData.getState().people)));
    setTimeout(() => useUI.getState().set({ shareTick: Date.now() }), 900);
  } else ui.set({ shareTick: Date.now() });
}

async function copyInvite() {
  const link = inviteLink();
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(link);
    else {
      const ta = document.createElement('textarea');
      ta.value = link; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    toast.success(tr('linkCopied'));
  } catch {
    toast(link, { duration: 15000 });
  }
}

// ---------------- More menu ----------------
function MenuItems({ done }: { done: () => void }) {
  const t = useT();
  const file = useRef<HTMLInputElement>(null);
  const [armed, setArmed] = useState(false);
  const me = useData(s => s.me);
  const meP = useData(s => (s.me ? s.people[s.me] : undefined));
  const relTe = useData(s => s.relTe);
  const setRelTe = useData(s => s.setRelTe);
  const treeName = useData(s => s.tree?.name);

  const item = (icon: Icon3DName | React.ReactNode, title: string, sub: string, onClick: () => void, danger = false) => (
    <button onClick={onClick} className="flex w-full items-center gap-3.5 rounded-2xl px-3 py-2.5 text-left hover:bg-soft">
      {typeof icon === 'string' ? <Icon3D name={icon as Icon3DName} size={34} /> : icon}
      <div className="min-w-0">
        <div className={cn('font-medium', danger && 'text-danger')}>{title}</div>
        <div className="text-[13px] text-muted">{sub}</div>
      </div>
    </button>
  );
  const reset = () => useUI.getState().set({ view: 'families', sel: null, path: null, fams: [] });

  const exportData = () => {
    const { people, colors, me, tree } = useData.getState();
    const blob = new Blob([JSON.stringify({ name: tree?.name, people, colors, me, collapsed: {} }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `family-tree-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast.success(tr('backupSaved'));
    done();
  };
  const importData = (f?: File) => {
    if (!f) return;
    f.text().then(txt => {
      const d = JSON.parse(txt) as TreeData;
      if (!d || typeof d.people !== 'object') throw new Error();
      useData.getState().replace(d);
      reset();
      toast.success(tr('loadedN', { n: Object.keys(d.people).length }));
      done();
    }).catch(() => toast.error(tr('notBackup')));
  };

  return (
    <div className="p-2">
      <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-1">
        <div className="min-w-0">
          <div className="truncate font-serif text-[18px] font-semibold">{treeName}</div>
        </div>
        <LangSwitch />
      </div>
      {me && meP && item(<Avatar p={meP} size={34} />, t('goToMe'), `${meP.first} ${meP.surname}`, () => { done(); goTo(me); })}
      {item('link', t('howRelatedQ'), t('howRelatedSub'), () => { done(); useUI.getState().set({ rel: { a: useUI.getState().sel || undefined } }); })}
      {item(<span className="grid h-[34px] w-[34px] place-items-center rounded-xl bg-soft"><Share2 size={17} /></span>, t('shareImage'), t('shareImageSub'), () => { done(); shareTreeImage(); })}
      {item('people', t('inviteFamily'), t('inviteSub'), () => { done(); copyInvite(); })}

      <label className="flex cursor-pointer items-center gap-3.5 rounded-2xl px-3 py-2.5 hover:bg-soft">
        <span className="grid h-[34px] w-[34px] place-items-center rounded-xl bg-soft font-semibold">అ</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t('relTe')}</span>
          <span className="block text-[13px] text-muted">{t('relTeSub')}</span>
        </span>
        <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={relTe} onChange={e => setRelTe(e.target.checked)} />
      </label>

      <div className="my-1 border-t border-line" />
      {item('backup', t('saveBackup'), t('saveBackupSub'), exportData)}
      {item('home', t('restore'), t('restoreSub'), () => file.current?.click())}
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => { importData(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="my-1 border-t border-line" />
      {item('people', t('loadExample'), t('replacesSub'), () => { useData.getState().replace(sampleData()); reset(); toast(tr('exampleLoaded')); done(); })}
      {item('seedling', armed ? t('blankArm') : t('blank'), armed ? t('blankArmSub') : t('blankSub'), () => {
        if (!armed) return setArmed(true);
        useData.getState().replace({ people: {}, collapsed: {} }); reset(); toast(tr('blankDone')); done();
      }, armed)}
      {item('tree', t('switchTree'), t('switchTreeSub'), () => { done(); reset(); useData.getState().closeTree(); })}
    </div>
  );
}

function MoreMenu({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const mobile = useIsMobile();
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || mobile) return;
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    setTimeout(() => document.addEventListener('pointerdown', h));
    return () => document.removeEventListener('pointerdown', h);
  }, [open, mobile, setOpen]);
  if (mobile) return <Sheet open={open} onOpenChange={setOpen} title={t('more')}><MenuItems done={() => setOpen(false)} /></Sheet>;
  if (!open) return null;
  return (
    <div ref={ref} className="absolute right-4 top-[60px] z-30 max-h-[calc(100dvh-80px)] w-[360px] overflow-y-auto rounded-3xl border border-line bg-card shadow-2xl">
      <MenuItems done={() => setOpen(false)} />
    </div>
  );
}

// ---------------- header (desktop) + bottom bar (phone) ----------------
export function Header() {
  const t = useT();
  const view = useUI(s => s.view);
  const set = useUI(s => s.set);
  const mobile = useIsMobile();
  const [menu, setMenu] = useState(false);

  return (
    <header className="pt-safe relative z-20 flex items-center gap-3 border-b border-line bg-paper/90 px-4 pb-2.5 backdrop-blur sm:px-6">
      <button onClick={() => set({ view: 'families', sel: null })} className="flex min-w-0 items-center gap-2">
        <Icon3D name="tree" size={30} />
        <span className="truncate font-serif text-[20px] font-semibold tracking-tight">{t('appName')}</span>
      </button>
      {!mobile && (
        <div className="ml-4 flex rounded-full bg-soft p-1">
          {(['families', 'tree'] as const).map(v => (
            <button key={v} onClick={() => (v === 'tree' ? goTree() : set({ view: 'families', sel: null }))}
              className={cn('h-8 rounded-full px-4 text-[14px] font-medium transition', view === v ? 'bg-card shadow-sm' : 'text-muted hover:text-ink')}>
              {v === 'families' ? t('families') : t('tree')}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1" />
      {!mobile && (
        <button onClick={() => set({ searchOpen: true })} className="flex h-10 w-60 items-center gap-2 rounded-full border border-line bg-card px-4 text-[14px] text-muted hover:text-ink">
          <SearchIcon size={16} /> {t('findSomeone')} <kbd className="ml-auto rounded-md border border-line px-1.5 text-[11px]">/</kbd>
        </button>
      )}
      {!mobile && <Button size="sm" className="h-10" onClick={shareTreeImage}><Share2 size={15} /> {t('shareImage')}</Button>}
      {!mobile && <Button size="sm" className="h-10" onClick={() => startVoice()}><Mic size={15} /> {t('talk')}</Button>}
      {!mobile && <Button variant="primary" size="sm" className="h-10" onClick={addPerson}><Plus size={16} /> {t('addPerson')}</Button>}
      <button aria-label={t('more')} onClick={() => setMenu(!menu)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-card hover:bg-soft"><Ellipsis size={18} /></button>
      <MoreMenu open={menu} setOpen={setMenu} />
    </header>
  );
}

export function BottomBar() {
  const t = useT();
  const view = useUI(s => s.view);
  const sel = useUI(s => s.sel);
  const set = useUI(s => s.set);
  const mobile = useIsMobile();
  const voiceOpen = useVoice(s => s.open);
  if (!mobile || (view === 'tree' && sel) || voiceOpen) return null;
  const tab = (on: boolean) => cn('flex flex-1 flex-col items-center gap-0.5 pt-2 text-[11px] font-medium', on ? 'text-ink' : 'text-muted');
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 flex items-start border-t border-line bg-paper/92 px-2 backdrop-blur">
      <button className={tab(view === 'families')} onClick={() => set({ view: 'families', sel: null })}><Users size={22} />{t('families')}</button>
      <button className={tab(view === 'tree')} onClick={goTree}><Network size={22} />{t('tree')}</button>
      <div className="flex flex-1 flex-col items-center">
        <button aria-label={t('talk')} onClick={() => startVoice()} className="-mt-5 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-ink shadow-lg active:scale-95"><Mic size={24} /></button>
        <span className="mt-0.5 text-[11px] font-medium text-muted">{t('talk')}</span>
      </div>
      <button className={tab(false)} onClick={() => set({ searchOpen: true })}><SearchIcon size={22} />{t('search')}</button>
      <button className={tab(false)} onClick={addPerson}><Plus size={22} />{t('add')}</button>
    </nav>
  );
}

export function useShortcuts() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input,textarea,select,[role=dialog]')) return;
      const ui = useUI.getState();
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); ui.set({ searchOpen: true }); }
      else if (e.key.toLowerCase() === 'n') { e.preventDefault(); addPerson(); }
      else if (e.key === 'Escape') ui.set({ sel: null, path: null });
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, []);
}
