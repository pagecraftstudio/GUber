'use client';
import { InlineAlert } from '@/ds/feedback/InlineAlert';

export function Alert({ kind, children }: { kind: 'error' | 'info'; children: React.ReactNode }) {
  return <InlineAlert tone={kind}>{children}</InlineAlert>;
}
