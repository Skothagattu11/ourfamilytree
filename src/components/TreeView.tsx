import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Handle, Position, useReactFlow, getViewportForBounds,
  type Edge, type Node, type NodeProps,
} from '@xyflow/react';
import { Minus, Plus, Maximize2, X, ChevronDown, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useData, useUI, openForm, goTo, useLineColor } from '../store';
import type { Person } from '../types';
import { descendantsOf, fam, families, kidsOf, lineage, visibleIds, yearsTxt } from '../lib/family';
import { layout, NH, NW } from '../lib/layout';
import { Avatar, Button, Icon3D, cn, useIsMobile } from './ui';
import { tr, useT } from '../lib/i18n';
import { renderTreeImage, shareOrDownload } from '../lib/shareImage';

type PersonData = {
  p: Person; isMe: boolean; inFam: boolean; toggle: boolean; collapsed: boolean; hidden: number;
  selected: boolean; dim: boolean;
};
type PersonNodeT = Node<PersonData, 'person'>;
type CoupleNodeT = Node<{ dim: boolean }, 'couple'>;

const PersonNode = memo(({ data }: NodeProps<PersonNodeT>) => {
  const { p, isMe, inFam, toggle, collapsed, hidden, selected, dim } = data;
  const t = useT();
  const f = fam(p);
  const sub = p.placeholder ? t('tapToAdd') : yearsTxt(p);
  return (
    <div
      className={cn(
        'relative flex items-center gap-3 rounded-[20px] border bg-card px-3 transition-[opacity,box-shadow,border-color] duration-200',
        selected ? 'border-accent shadow-[0_0_0_4px_var(--accent-soft)]' : 'shadow-card border-line',
        !inFam && !selected && 'border-dashed',
        dim && 'opacity-25',
      )}
      style={{ width: NW, height: NH }}
    >
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="target" position={Position.Left} id="l" />
      <Avatar p={p} size={44} className={p.died ? 'grayscale-[.6]' : ''} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold leading-tight">{p.placeholder ? t('unknown') : p.first || '?'}</div>
        <div className="mt-0.5 truncate text-[12.5px] text-muted">{sub || ' '}</div>
      </div>
      {isMe && (
        <span className="absolute -top-3 left-3 rounded-full bg-accent px-2.5 py-0.5 text-[11.5px] font-semibold text-accent-ink shadow-sm">{t('you')}</span>
      )}
      {!inFam && (
        <button
          title={t('showFamilyToo', { f })}
          className="nodrag nopan absolute -top-3 right-3 max-w-[140px] truncate rounded-full border border-line bg-card px-2.5 py-0.5 text-[11.5px] font-medium text-muted shadow-sm hover:text-ink"
          onClick={e => { e.stopPropagation(); const ui = useUI.getState(); ui.set({ fams: [...ui.fams, f] }); }}
        >
          + {f}
        </button>
      )}
      {toggle && (
        <button
          title={collapsed ? t('showDesc') : t('hideDesc')}
          className={cn(
            'nodrag nopan absolute -bottom-3.5 left-1/2 flex h-7 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-card text-muted shadow-sm hover:text-ink',
            collapsed ? 'px-2.5 text-[12px] font-semibold' : 'w-7',
          )}
          onClick={e => { e.stopPropagation(); useData.getState().toggleCollapsed(p.id); }}
        >
          {collapsed ? <>+{hidden}<ChevronDown size={13} className="ml-0.5" /></> : <Minus size={14} />}
        </button>
      )}
    </div>
  );
});

const CoupleNode = memo(({ data }: NodeProps<CoupleNodeT>) => (
  <div className={cn('h-2 w-2 rounded-full bg-[var(--edge)] transition-opacity', data.dim && 'opacity-20')}>
    <Handle type="source" position={Position.Bottom} id="b" />
  </div>
));

const nodeTypes = { person: PersonNode, couple: CoupleNode };
type XY = { x: number; y: number };

function Canvas() {
  const people = useData(s => s.people);
  const collapsed = useData(s => s.collapsed);
  const { fams, sel, hover, path, fitTick, focus, set, shareTick } = useUI();
  const colors = useData(s => s.colors);
  const me = useData(s => s.me);
  const mobile = useIsMobile();
  const rf = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);

  const famSet = useMemo(() => new Set(fams), [fams]);
  const ids = useMemo(() => visibleIds(people, famSet, collapsed), [people, famSet, collapsed]);
  const L = useMemo(() => layout(people, ids), [people, ids]);

  // --- animate cards from where they were to where they belong
  const cur = useRef<Record<string, XY>>({});
  const [pos, setPos] = useState<Record<string, XY>>(L.pos);
  useEffect(() => {
    const from: Record<string, XY> = {};
    for (const id of ids) {
      if (cur.current[id]) { from[id] = cur.current[id]; continue; }
      const p = people[id];
      const rel = [...p.parents, ...p.spouses, ...kidsOf(people, id)].find(r => cur.current[r]);
      from[id] = rel ? cur.current[rel] : L.pos[id];
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now(), dur = reduce ? 1 : 480;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      const next: Record<string, XY> = {};
      for (const id of ids) {
        const a = from[id], b = L.pos[id];
        next[id] = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
      }
      cur.current = next;
      setPos(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L]);

  // --- fit the open families into view
  useEffect(() => {
    if (!ids.length || !wrap.current) return;
    const xs = ids.map(id => L.pos[id].x), ys = ids.map(id => L.pos[id].y);
    const bounds = { x: Math.min(...xs) - NW / 2, y: Math.min(...ys) - 20, width: Math.max(...xs) - Math.min(...xs) + NW, height: Math.max(...ys) - Math.min(...ys) + NH + 40 };
    const { clientWidth: w, clientHeight: h } = wrap.current;
    const minZoom = mobile ? 0.6 : 0.2;
    const vp = getViewportForBounds(bounds, w, h, minZoom, 1.05, 0.1);
    // too big for a phone even at a readable zoom: start at the eldest generation and let people pan
    if (vp.zoom <= minZoom + 0.001 && bounds.height * vp.zoom > h) vp.y = 48 - bounds.y * vp.zoom;
    rf.setViewport(vp, { duration: 550 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTick]);

  // --- bring one person into view (above the sheet on phones, left of the panel on desktop)
  useEffect(() => {
    if (!focus || !wrap.current) return;
    const id = focus.id;
    const t = setTimeout(() => {
      const q = L.pos[id];
      if (!q) return;
      const zoom = Math.max(rf.getZoom(), mobile ? 0.8 : 0.9);
      const h = wrap.current!.clientHeight;
      const dy = mobile && useUI.getState().sel ? (0.5 - 0.22) * h / zoom : 0;
      const dx = !mobile && useUI.getState().sel ? 216 / zoom : 0;
      rf.setCenter(q.x + dx, q.y + NH / 2 + dy, { zoom, duration: 500 });
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // --- share the whole visible tree as a picture
  useEffect(() => {
    if (!shareTick) return;
    let cancelled = false;
    (async () => {
      const ui = useUI.getState();
      ui.set({ sel: null, hover: null, path: null });
      const tid = toast.loading(tr('makingImage'));
      await new Promise(r => setTimeout(r, 700));         // let highlights fade and cards settle
      if (cancelled) return;
      try {
        const st = useData.getState();
        const te = st.lang === 'te';
        const shown = ui.fams;
        const title = shown.length === 1 ? `${shown[0]} ${te ? 'కుటుంబం' : 'family'}` : st.tree?.name || tr('ourFamily');
        const subtitle = [
          tr('personCount', { n: ids.length }),
          shown.length > 1 ? shown.join(' · ') : '',
          new Date().toLocaleDateString(te ? 'te-IN' : undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
        ].filter(Boolean).join('   ·   ');
        const blob = await renderTreeImage(rf.getNodes(), title, subtitle);
        const how = await shareOrDownload(blob, `${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'family-tree'}.png`, title);
        if (how === 'downloaded') toast.success(tr('imageSaved'), { id: tid }); else toast.dismiss(tid);
      } catch (e) {
        console.error(e);
        toast.error(tr('imageErr'), { id: tid });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareTick]);

  const lit = useMemo(() => {
    if (hover && people[hover]) return lineage(people, hover);
    if (path) return new Set(path);
    if (sel && people[sel]) return lineage(people, sel);
    return null;
  }, [hover, path, sel, people]);

  const nodes = useMemo(() => {
    const set = new Set(ids);
    const out: (PersonNodeT | CoupleNodeT)[] = [];
    for (const id of ids) {
      const p = people[id], q = pos[id] || L.pos[id];
      const inFam = famSet.has(fam(p));
      const kids = kidsOf(people, id);
      const isColl = !!collapsed[id];
      const sharer = p.spouses.find(s => {
        if (!set.has(s) || !kidsOf(people, s).some(k => kids.includes(k))) return false;
        const sIn = famSet.has(fam(people[s]));
        return (sIn && !inFam) || (sIn === inFam && s < id && !isColl);
      });
      out.push({
        id, type: 'person', position: { x: q.x - NW / 2, y: q.y }, width: NW, height: NH,
        data: {
          p, isMe: me === id, inFam, collapsed: isColl, selected: sel === id, dim: !!lit && !lit.has(id),
          toggle: kids.length > 0 && !sharer && (isColl || kids.some(k => set.has(k))),
          hidden: isColl ? descendantsOf(people, id).size : 0,
        },
      });
    }
    for (const [a, b] of L.couples) {
      const A = pos[a] || L.pos[a], B = pos[b] || L.pos[b];
      out.push({
        id: `c:${a}:${b}`, type: 'couple', selectable: false, width: 8, height: 8,
        position: { x: (A.x + B.x) / 2 - 4, y: A.y + NH / 2 - 4 },
        data: { dim: !!lit && !(lit.has(a) && lit.has(b)) },
      });
    }
    return out;
  }, [ids, people, pos, L, famSet, collapsed, sel, lit, me]);

  const edges = useMemo(() => {
    const out: Edge[] = [];
    const cls = (ok: boolean) => (lit ? (ok ? 'lit' : 'dim') : '');
    for (const [a, b] of L.couples) {
      const [l, r] = (pos[a] || L.pos[a]).x < (pos[b] || L.pos[b]).x ? [a, b] : [b, a];
      out.push({ id: `s:${a}:${b}`, source: l, sourceHandle: 'r', target: r, targetHandle: 'l', type: 'straight', className: cls(!!lit?.has(a) && !!lit?.has(b)) });
    }
    const coupleOf = new Set(L.couples.map(([a, b]) => `${a}:${b}`));
    for (const { c, ps } of L.kids) {
      const key = ps.length === 2 ? [...ps].sort().join(':') : '';
      const ok = !!lit?.has(c) && ps.some(p => lit.has(p));
      // a child's line is drawn in the colour of the family line they carry on
      const style = { stroke: colors[fam(people[c])] || 'var(--edge)' };
      if (key && coupleOf.has(key)) out.push({ id: `k:${c}`, source: `c:${key}`, sourceHandle: 'b', target: c, targetHandle: 't', className: cls(ok), style });
      else ps.forEach(p => out.push({ id: `k:${c}:${p}`, source: p, sourceHandle: 'b', target: c, targetHandle: 't', className: cls(ok), style }));
    }
    return out;
  }, [L, pos, lit, people, colors]);

  return (
    <div ref={wrap} className="absolute inset-0">
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
        minZoom={0.15} maxZoom={2.2} zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: false }}
        attributionPosition="top-right"
        onNodeClick={(_, n) => {
          if (n.type !== 'person') return;
          set({ sel: n.id, path: null });
          if (mobile) set({ focus: { id: n.id, tick: Date.now() } });
        }}
        onNodeDoubleClick={(_, n) => n.type === 'person' && openForm({ mode: 'edit', of: n.id })}
        onNodeMouseEnter={(e, n) => (e as unknown as PointerEvent).pointerType !== 'touch' && n.type === 'person' && set({ hover: n.id })}
        onNodeMouseLeave={() => set({ hover: null })}
        onPaneMouseMove={() => useUI.getState().hover && set({ hover: null })}
        onPaneClick={() => set({ sel: null, path: null, hover: null })}
      />
      <Zoom />
    </div>
  );
}

function Zoom() {
  const rf = useReactFlow();
  const t = useT();
  const sheetOpen = useUI(s => !!s.sel);
  const mobile = useIsMobile();
  const fit = () => useUI.getState().set({ fitTick: useUI.getState().fitTick + 1 });
  if (mobile && sheetOpen) return null;
  return (
    <div className={cn('absolute left-4 z-10 flex overflow-hidden rounded-full border border-line bg-card shadow-card', mobile ? 'bottom-[calc(84px+env(safe-area-inset-bottom))]' : 'bottom-4')}>
      <button aria-label={t('zoomIn')} title={t('zoomIn')} onClick={() => rf.zoomIn({ duration: 200 })} className="grid h-11 w-11 place-items-center hover:bg-soft"><Plus size={18} /></button>
      <button aria-label={t('zoomOut')} title={t('zoomOut')} onClick={() => rf.zoomOut({ duration: 200 })} className="grid h-11 w-11 place-items-center border-x border-line hover:bg-soft"><Minus size={18} /></button>
      <button aria-label={t('fit')} title={t('fit')} onClick={fit} className="grid h-11 w-11 place-items-center border-r border-line hover:bg-soft"><Maximize2 size={16} /></button>
      <button aria-label={t('shareImage')} title={t('shareImage')} onClick={() => useUI.getState().set({ shareTick: Date.now() })} className="flex h-11 items-center gap-2 px-4 text-[14px] font-medium hover:bg-soft">
        <Share2 size={16} /><span className="max-sm:hidden">{t('shareImage')}</span>
      </button>
    </div>
  );
}

function FamilyChips() {
  const people = useData(s => s.people);
  const { fams, set, fitTick } = useUI();
  const t = useT();
  const color = useLineColor();
  const fm = families(people);
  const names = Object.keys(fm).sort();
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => { // keep the first open family's chip on screen
    row.current?.querySelector('[data-on="1"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [fams]);
  const allOn = names.every(n => fams.includes(n));
  const chip = (on: boolean) =>
    cn('h-9 shrink-0 rounded-full border px-3.5 text-[13.5px] font-medium transition',
      on ? 'border-ink bg-ink text-paper' : 'border-line bg-card text-muted hover:text-ink');
  return (
    <div ref={row} className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2.5">
      <button className={chip(allOn)} onClick={() => set({ fams: allOn ? [names[0]] : names, fitTick: fitTick + 1 })}>{t('everyone')}</button>
      {names.map(n => {
        const on = fams.includes(n);
        return (
          <button key={n} data-on={on && !allOn ? '1' : undefined} className={chip(on && !allOn)} onClick={() => {
            const next = on ? (fams.length > 1 ? fams.filter(x => x !== n) : fams) : [...fams, n];
            set({ fams: allOn ? [n] : next, fitTick: fitTick + 1 });
          }}>
            <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-[1px]" style={{ background: color(n) }} />
            {n} <span className="ml-1 opacity-60">{fm[n].length}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TreeView() {
  const people = useData(s => s.people);
  const { path, pathLabel, set, fams } = useUI();
  const t = useT();
  const empty = !Object.keys(people).length;
  return (
    <div className="flex h-full flex-col">
      {!empty && <FamilyChips />}
      <div className="relative min-h-0 flex-1">
        {empty ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              <Icon3D name="seedling" size={88} className="mx-auto" />
              <p className="mt-3 text-muted">{t('noOneYet')}</p>
              <Button variant="primary" className="mt-4" onClick={() => openForm({ mode: 'new', first: true, surname: fams[0] })}>{t('addFirst')}</Button>
            </div>
          </div>
        ) : (
          <ReactFlowProvider><Canvas /></ReactFlowProvider>
        )}
        {path && (
          <div className="absolute left-1/2 top-3 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 rounded-full bg-ink py-2 pl-4 pr-2 text-[13.5px] font-medium text-paper shadow-lg">
            <span className="truncate">{pathLabel}</span>
            <button aria-label={t('clear')} onClick={() => set({ path: null })} className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/10"><X size={15} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

export { goTo };
