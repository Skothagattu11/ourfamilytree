import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { parseInvite, useData, useUI } from './store';
import { FamiliesView } from './components/FamiliesView';
import { TreeView } from './components/TreeView';
import { PersonSheet } from './components/PersonSheet';
import { PersonForm } from './components/PersonForm';
import { RelationSheet } from './components/RelationSheet';
import { Search } from './components/Search';
import { VoicePanel } from './components/VoicePanel';
import { Loading, Welcome } from './components/Welcome';
import { BottomBar, Header, useShortcuts } from './components/Chrome';
import { useIsMobile } from './components/ui';
import { tr } from './lib/i18n';
import { toast } from 'sonner';

/** Open the tree from an invite link (#tree=…&key=…), else the one this device used last. */
function useBoot() {
  useEffect(() => {
    const inv = parseInvite(location.hash);
    if (inv) {
      history.replaceState(null, '', location.pathname + location.search);
      useData.getState().openTree(inv).then(ok => { if (!ok) toast.error(tr('badLink')); });
    } else if (useData.getState().tree) {
      useData.getState().reload();
    }
    // pick up changes made by other family members when coming back to the app
    const refresh = () => { if (document.visibilityState === 'visible' && useData.getState().status === 'ready') useData.getState().reload(); };
    document.addEventListener('visibilitychange', refresh);
    const iv = setInterval(refresh, 60_000);
    return () => { document.removeEventListener('visibilitychange', refresh); clearInterval(iv); };
  }, []);
}

export default function App() {
  const tree = useData(s => s.tree);
  const status = useData(s => s.status);
  const lang = useData(s => s.lang);
  const view = useUI(s => s.view);
  const mobile = useIsMobile();
  useShortcuts();
  useBoot();
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const toaster = (
    <Toaster
      position={mobile ? 'top-center' : 'bottom-right'}
      toastOptions={{ style: { borderRadius: 18, background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)' } }}
    />
  );

  if (!tree) return <>{status === 'loading' ? <Loading /> : <Welcome />}{toaster}</>;
  if (status !== 'ready') return <>{<Loading error={status === 'error'} />}{toaster}</>;

  return (
    <div className="flex h-full flex-col">
      <Header />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        {view === 'families' ? <div className="h-full overflow-y-auto overscroll-contain"><FamiliesView /></div> : <TreeView />}
      </main>
      <BottomBar />
      <PersonSheet />
      <PersonForm />
      <RelationSheet />
      <Search />
      <VoicePanel />
      {toaster}
    </div>
  );
}
