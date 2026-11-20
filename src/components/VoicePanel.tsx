import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, RotateCcw, SendHorizontal } from 'lucide-react';
import { useT } from '../lib/i18n';
import { useData } from '../store';
import { sendText, setMuted, startVoice, stopVoice, tapCancel, tapConfirm, useVoice } from '../lib/voice/session';
import { useProposals } from '../lib/voice/tools';
import { Button, Icon3D, Sheet, cn } from './ui';

function Orb() {
  const { status, level } = useVoice();
  const scale = status === 'listening' ? 1 + Math.min(level * 2.2, 0.55) : 1;
  return (
    <div className="relative grid h-14 w-14 shrink-0 place-items-center">
      <span className={cn('absolute inset-0 rounded-full bg-accent-soft', status === 'speaking' && 'animate-ping opacity-60')} />
      {status === 'thinking' || status === 'connecting'
        ? <span className="absolute inset-1 animate-spin rounded-full border-[3px] border-accent/20 border-t-accent" />
        : null}
      <span className="relative h-7 w-7 rounded-full bg-accent transition-transform duration-75" style={{ transform: `scale(${scale})` }} />
    </div>
  );
}

const MISSING_TE: Record<string, string> = { family_name: 'ఇంటి పేరు', gender: 'లింగం', born_year: 'పుట్టిన సంవత్సరం', other_parent: 'మరో తల్లి/తండ్రి' };
const MISSING_EN: Record<string, string> = { family_name: 'family name', gender: 'gender', born_year: 'birth year', other_parent: 'other parent' };

function Proposals() {
  const t = useT();
  const lang = useData(s => s.lang);
  const list = useProposals(s => s.list);
  const shown = list.filter(p => p.state === 'pending').concat(list.filter(p => p.state !== 'pending').slice(-2).reverse());
  if (!shown.length) return null;
  return (
    <div className="space-y-2">
      {shown.map(p => (
        <div key={p.id} className={cn('rounded-2xl border p-3', p.state === 'pending' ? 'border-accent bg-card shadow-card' : 'border-line bg-paper opacity-70')}>
          <div className="flex items-start gap-3">
            <Icon3D name={p.icon} size={34} />
            <p className="flex-1 text-[14.5px] leading-snug">{p.summary}</p>
          </div>
          {p.state === 'pending' && p.missing.length > 0 && (
            <p className="mt-2 text-[12.5px] text-muted">
              {t('stillNeeded')} {p.missing.map(m => { const k = m.split(' ')[0]; return (lang === 'te' ? MISSING_TE : MISSING_EN)[k] || k; }).join(', ')}
            </p>
          )}
          {p.state === 'pending' ? (
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant={p.kind === 'remove' ? 'danger' : 'primary'} className={cn('flex-1', p.armed && '!bg-danger !text-white')} onClick={() => tapConfirm(p.id)}>
                {p.armed ? t('confirmRemove') : t('confirm')}
              </Button>
              <Button size="sm" className="flex-1" onClick={() => tapCancel(p.id)}>{t('cancel')}</Button>
            </div>
          ) : (
            <p className={cn('mt-2 text-[12.5px] font-semibold', p.state === 'saved' ? 'text-accent' : 'text-muted')}>
              {p.state === 'saved' ? `✓ ${t('savedChip')}` : `✕ ${t('cancelledChip')}`}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function VoicePanel() {
  const t = useT();
  const { open, status, error, lines, muted } = useVoice();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [lines.length, lines[lines.length - 1]?.text]);
  const live = status !== 'off' && status !== 'error';

  const statusText = {
    off: t('vOff'), connecting: t('vConnecting'), listening: muted ? t('vMuted') : t('vListening'),
    thinking: t('vThinking'), speaking: t('vSpeaking'),
    error: error === 'needs_https' ? t('vNeedsHttps') : error === 'mic_denied' ? t('vMicDenied') : t('vError'),
  }[status];

  return (
    <Sheet
      open={open}
      modal={false}
      closeOnOutside={false}
      closeLabel={t('close')}
      onOpenChange={o => { if (!o) stopVoice(); }}
      title={t('voiceTitle')}
      footer={
        <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); sendText(text); setText(''); }}>
          <button type="button" aria-label={muted ? t('unmute') : t('mute')} onClick={() => setMuted(!muted)} disabled={!live}
            className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line', muted ? 'bg-ink text-paper' : 'bg-card')}>
            {muted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <input className="field !rounded-full !py-2.5" value={text} onChange={e => setText(e.target.value)} placeholder={t('typeInstead')} disabled={!live} />
          <button aria-label={t('send')} disabled={!live || !text.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink disabled:opacity-40">
            <SendHorizontal size={18} />
          </button>
        </form>
      }
    >
      <div className="px-5 pb-4 pt-3 sm:pt-6">
        <div className="flex items-center gap-3 pr-10">
          <Orb />
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[21px] font-semibold leading-tight">{t('voiceTitle')}</h2>
            <p className={cn('text-[13.5px]', status === 'error' ? 'text-danger' : 'text-muted')}>{statusText}</p>
          </div>
          {live
            ? <Button size="sm" variant="danger" onClick={() => stopVoice(true)}><PhoneOff size={15} /> {t('endChat')}</Button>
            : <Button size="sm" variant="primary" onClick={() => startVoice()}><RotateCcw size={15} /> {t('restart')}</Button>}
        </div>

        {!lines.length && live && <p className="mt-4 rounded-2xl bg-soft px-4 py-3 text-[14px] text-muted">{t('voiceHint')}</p>}

        <div className="mt-4 space-y-2">
          {lines.map((l, i) => (
            <div key={i} className={cn('flex', l.who === 'user' ? 'justify-end' : 'justify-start')}>
              {l.who === 'note'
                ? <span className="mx-auto text-[12.5px] font-medium text-muted">{l.text}</span>
                : <p className={cn('max-w-[85%] rounded-2xl px-3.5 py-2 text-[14.5px] leading-snug',
                    l.who === 'user' ? 'rounded-br-md bg-accent text-accent-ink' : 'rounded-bl-md bg-soft')}>{l.text}</p>}
            </div>
          ))}
          <div ref={end} />
        </div>

        <div className="mt-4"><Proposals /></div>
        <p className="mt-4 text-center text-[11.5px] text-muted">{t('voicePrivacy')}</p>
      </div>
    </Sheet>
  );
}
