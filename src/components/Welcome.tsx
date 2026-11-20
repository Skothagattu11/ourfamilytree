import { useState } from 'react';
import { toast } from 'sonner';
import { parseInvite, useData } from '../store';
import { useT } from '../lib/i18n';
import { Button, Icon3D, cn } from './ui';

export function LangSwitch({ className }: { className?: string }) {
  const lang = useData(s => s.lang);
  const setLang = useData(s => s.setLang);
  return (
    <div className={cn('inline-flex rounded-full bg-soft p-1 text-[13.5px] font-medium', className)}>
      {(['en', 'te'] as const).map(l => (
        <button key={l} onClick={() => setLang(l)} className={cn('h-8 rounded-full px-3.5 transition', lang === l ? 'bg-card shadow-sm' : 'text-muted')}>
          {l === 'en' ? 'English' : 'తెలుగు'}
        </button>
      ))}
    </div>
  );
}

/** Shown when this device hasn't opened a tree yet. */
export function Welcome() {
  const t = useT();
  const createTree = useData(s => s.createTree);
  const openTree = useData(s => s.openTree);
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try { await createTree(name.trim() || t('ourFamily')); }
    catch (e) { console.error(e); toast.error(t('offline')); }
    finally { setBusy(false); }
  };
  const join = async () => {
    const inv = parseInvite(link);
    if (!inv) return toast.error(t('badLink'));
    setBusy(true);
    const okd = await openTree(inv);
    setBusy(false);
    if (!okd) toast.error(t('badLink'));
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="pt-safe mx-auto flex min-h-full max-w-md flex-col px-6 pb-10">
        <div className="flex justify-end pt-2"><LangSwitch /></div>
        <div className="flex flex-1 flex-col justify-center py-8">
          <Icon3D name="tree" size={112} className="mx-auto" />
          <h1 className="mt-6 text-center font-serif text-[32px] font-semibold leading-tight tracking-tight">{t('welcomeTitle')}</h1>
          <p className="mt-3 text-center text-muted">{t('welcomeBody')}</p>

          {mode === 'create' ? (
            <form className="mt-8 space-y-3" onSubmit={e => { e.preventDefault(); create(); }}>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold">{t('treeName')}</span>
                <input className="field" value={name} onChange={e => setName(e.target.value)} placeholder={t('treeNamePh')} />
              </label>
              <Button variant="primary" size="lg" className="w-full" disabled={busy}>{t('create')}</Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setMode('join')}>{t('haveLink')}</Button>
            </form>
          ) : (
            <form className="mt-8 space-y-3" onSubmit={e => { e.preventDefault(); join(); }}>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold">{t('pasteLink')}</span>
                <input className="field" value={link} onChange={e => setLink(e.target.value)} placeholder="https://…#tree=…" autoFocus />
              </label>
              <Button variant="primary" size="lg" className="w-full" disabled={busy || !link.trim()}>{t('open')}</Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setMode('create')}>{t('create')}</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function Loading({ error }: { error?: boolean }) {
  const t = useT();
  const reload = useData(s => s.reload);
  const closeTree = useData(s => s.closeTree);
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div>
        <Icon3D name="tree" size={72} className={cn('mx-auto', !error && 'animate-pulse')} />
        <p className="mt-4 text-muted">{error ? t('offline') : t('loading')}</p>
        {error && (
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="primary" onClick={() => reload()}>{t('retry')}</Button>
            <Button onClick={closeTree}>{t('switchTree')}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
