'use client';
import { Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useDsText } from '../lang';
import { buttonClass } from './button-class';
import { useFieldControl } from './Field';

export type RejectReason = 'type' | 'size';
/** Client-side feedback only (type and size). The server and Storage policies are the authority; SVG is not accepted by default. */
export function FileUpload({ accept = 'image/png,image/jpeg,image/webp', maxBytes = 2_000_000, onFile, onReject, label }: { accept?: string; maxBytes?: number; onFile: (file: File) => void; onReject?: (r: RejectReason, file: File) => void; label?: string }) {
  const t = useDsText();
  const ref = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const f = useFieldControl({});
  const allowed = accept.split(',').map((s) => s.trim());
  const change = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!allowed.includes(file.type)) { e.target.value = ''; setName(null); onReject?.('type', file); return; }
    if (file.size > maxBytes) { e.target.value = ''; setName(null); onReject?.('size', file); return; }
    setName(file.name);
    onFile(file);
  };
  return (
    <div className="flex items-center gap-3">
      <input ref={ref} id={f.id} type="file" accept={accept} onChange={change} className="sr-only" aria-describedby={f['aria-describedby']} aria-invalid={f['aria-invalid']} />
      <label htmlFor={f.id} className={buttonClass('secondary', 'md', false, 'cursor-pointer has-[:focus-visible]:outline-2')}><Upload size={16} strokeWidth={1.5} aria-hidden="true" />{label ?? t.chooseFile}</label>
      <span className="text-[13px] text-ink-muted" dir="auto">{name ?? t.noFile}</span>
    </div>
  );
}
