import { useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Drawer } from 'vaul';
import { X } from 'lucide-react';
import type { Person } from '../types';
import { initials } from '../lib/family';

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 720px)') : null;
export function useIsMobile() {
  return useSyncExternalStore(
    cb => { mq?.addEventListener('change', cb); return () => mq?.removeEventListener('change', cb); },
    () => !!mq?.matches,
    () => false,
  );
}

export type Icon3DName =
  | 'tree' | 'seedling' | 'child' | 'partner' | 'sibling' | 'parent' | 'link'
  | 'camera' | 'home' | 'backup' | 'search' | 'people' | 'notes';

/** Fluent 3D icon (MIT, Microsoft) — used sparingly, for actions and empty states. */
export function Icon3D({ name, size = 28, className }: { name: Icon3DName; size?: number; className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icons/${name}.png`}
      width={size} height={size} alt="" draggable={false}
      className={cn('pointer-events-none select-none', className)}
    />
  );
}

export function Avatar({ p, size = 44, className }: { p: Person; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (p.photo)
    return <img src={p.photo} alt="" style={style} draggable={false} className={cn('shrink-0 rounded-full object-cover ring-1 ring-line', className)} />;
  return (
    <div
      style={{ ...style, fontSize: Math.round(size * 0.36) }}
      className={cn('grid shrink-0 place-items-center rounded-full bg-soft font-serif font-medium text-muted ring-1 ring-line', className)}
    >
      {initials(p)}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'danger'; size?: 'sm' | 'md' | 'lg' };
export function Button({ variant = 'outline', size = 'md', className, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-full font-medium transition active:scale-[.97] disabled:opacity-40',
        size === 'sm' && 'h-9 px-3.5 text-[13.5px]',
        size === 'md' && 'h-11 px-5 text-[15px]',
        size === 'lg' && 'h-12 px-6 text-[15.5px]',
        variant === 'primary' && 'bg-accent text-accent-ink hover:brightness-110',
        variant === 'outline' && 'border border-line bg-card text-ink hover:bg-soft',
        variant === 'ghost' && 'text-ink hover:bg-soft',
        variant === 'danger' && 'border border-line bg-card text-danger hover:bg-soft',
        className,
      )}
    />
  );
}

/** Bottom sheet on phones, side sheet on larger screens. */
export function Sheet({
  open, onOpenChange, title, children, footer, modal = true, closeOnOutside = true, closeLabel = 'Close',
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string;
  children: ReactNode; footer?: ReactNode; modal?: boolean;
  /** Non-modal panels: close when clicking elsewhere (other people on the tree still just switch). */
  closeOnOutside?: boolean;
  closeLabel?: string;
}) {
  const mobile = useIsMobile();
  // things that live outside the panel but belong to the same interaction
  const keepOpen = (t: EventTarget | null) =>
    t instanceof Element && !!t.closest('.react-flow__node, [role=dialog], [cmdk-root], [data-sonner-toaster], [data-sonner-toast]');
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={mobile ? 'bottom' : 'right'} modal={modal} noBodyStyles={!modal}>
      <Drawer.Portal>
        {modal && <Drawer.Overlay className="fixed inset-0 z-40 bg-black/25" />}
        <Drawer.Content
          aria-describedby={undefined}
          onPointerDownOutside={modal ? undefined : e => { if (closeOnOutside && !keepOpen(e.target)) onOpenChange(false); }}
          onInteractOutside={modal ? undefined : e => e.preventDefault()}
          className={cn(
            'fixed z-50 flex flex-col bg-card outline-none',
            mobile
              ? cn('inset-x-0 bottom-0 rounded-t-[28px] border-t border-line', modal ? 'max-h-[92dvh]' : 'max-h-[58dvh]')
              : 'bottom-3 right-3 top-3 w-[420px] rounded-[28px] border border-line shadow-2xl',
          )}
        >
          {mobile && <div className="mx-auto mb-1 mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line" />}
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          <button
            type="button" aria-label={closeLabel} title={closeLabel} onClick={() => onOpenChange(false)}
            className={cn('absolute right-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-soft text-muted hover:text-ink', mobile ? 'top-4' : 'top-3')}
          >
            <X size={17} />
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {footer && <div className="pb-safe border-t border-line px-5 pt-3">{footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
