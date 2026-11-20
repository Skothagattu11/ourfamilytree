import { toCanvas } from 'html-to-image';
import { getNodesBounds, type Node } from '@xyflow/react';

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/**
 * Render the whole tree (not just what's on screen) to a PNG with a small title band.
 * Interactive bits (fold buttons, "+ family" pills) are left out.
 */
export async function renderTreeImage(nodes: Node[], title: string, subtitle: string): Promise<Blob> {
  const el = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!el || !nodes.length) throw new Error('nothing to draw');
  const b = getNodesBounds(nodes);
  const pad = 56;
  const w = Math.ceil(b.width + pad * 2), h = Math.ceil(b.height + pad * 2);
  // stay under mobile canvas limits (~16 MP)
  const ratio = Math.max(1, Math.min(2.5, Math.sqrt(14_000_000 / (w * h))));
  const paper = css('--paper') || '#f6f3ee', ink = css('--ink') || '#1d1a16', muted = css('--muted') || '#6d655c';

  const tree = await toCanvas(el, {
    backgroundColor: paper, width: w, height: h, pixelRatio: ratio, cacheBust: true,
    style: { width: `${w}px`, height: `${h}px`, transform: `translate(${pad - b.x}px, ${pad - b.y}px) scale(1)` },
    filter: n => !(n instanceof HTMLElement && n.classList.contains('nodrag')),
  });

  const head = 120 * ratio, foot = 54 * ratio;
  const out = document.createElement('canvas');
  out.width = tree.width;
  out.height = tree.height + head + foot;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  ctx.font = `600 ${44 * ratio}px "Fraunces Variable", "Noto Sans Telugu Variable", Georgia, serif`;
  ctx.fillText(title, pad * ratio, 72 * ratio);
  ctx.fillStyle = muted;
  ctx.font = `400 ${20 * ratio}px "Inter Variable", "Noto Sans Telugu Variable", system-ui, sans-serif`;
  ctx.fillText(subtitle, pad * ratio, 104 * ratio);
  ctx.drawImage(tree, 0, head);
  ctx.font = `500 ${16 * ratio}px "Inter Variable", system-ui, sans-serif`;
  ctx.fillText('Family Tree · వంశవృక్షం', pad * ratio, out.height - 22 * ratio);

  return await new Promise<Blob>((res, rej) => out.toBlob(x => (x ? res(x) : rej(new Error('toBlob failed'))), 'image/png'));
}

/** Native share sheet on phones (WhatsApp, Photos…), download everywhere else. */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/png' });
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; }
    catch (e) { if ((e as Error).name === 'AbortError') return 'shared'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'downloaded';
}
