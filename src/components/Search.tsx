import { useState } from 'react';
import { Command } from 'cmdk';
import { Plus } from 'lucide-react';
import { useData, useUI, goTo, openForm } from '../store';
import { fullName, yearsTxt } from '../lib/family';
import { useT } from '../lib/i18n';
import { Avatar, Icon3D } from './ui';

export function Search() {
  const t = useT();
  const open = useUI(s => s.searchOpen);
  const set = useUI(s => s.set);
  const people = useData(s => s.people);
  const [q, setQ] = useState('');
  const list = Object.values(people).filter(p => !p.placeholder).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const close = () => { set({ searchOpen: false }); setQ(''); };

  return (
    <Command.Dialog open={open} onOpenChange={o => (o ? set({ searchOpen: true }) : close())} label={t('findSomeone')}>
      <div className="flex items-center gap-2 pl-4">
        <Icon3D name="search" size={24} />
        <Command.Input value={q} onValueChange={setQ} placeholder={t('findSomeone')} autoFocus />
      </div>
      <Command.List>
        <Command.Empty>{t('noOneByName')}</Command.Empty>
        <Command.Group heading={q ? t('people') : t('everyone')}>
          {list.map(p => (
            <Command.Item key={p.id} value={`${fullName(p)} ${p.id}`} onSelect={() => { close(); goTo(p.id); }}>
              <Avatar p={p} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{fullName(p)}</div>
                <div className="truncate text-[12.5px] text-muted">{yearsTxt(p)}</div>
              </div>
            </Command.Item>
          ))}
        </Command.Group>
        {q.trim() && (
          <Command.Item value={`__add ${q}`} forceMount onSelect={() => { close(); openForm({ mode: 'new', name: q.trim() }); }}>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-soft"><Plus size={16} /></span>
            <span>{t('addQ', { q: q.trim() })}</span>
          </Command.Item>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
