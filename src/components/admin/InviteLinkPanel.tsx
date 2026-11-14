'use client';
import { useState } from 'react';
import { fmtDateTime } from './format';

/** Shows an owner invite link once. No email provider exists yet, so the admin hands the link over personally. */
export function InviteLinkPanel({ url, expiresAt }: { url: string; expiresAt?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="space-y-2 rounded-xl border border-status-success-fg bg-status-success-bg p-4">
      <p className="text-sm font-semibold text-status-success-fg">Owner invite link</p>
      <p className="text-xs text-status-success-fg">
        Copy it now and send it to the owner yourself. It is not stored and cannot be shown again
        {expiresAt ? `; it expires ${fmtDateTime(expiresAt)}` : ''}.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input readOnly value={url} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-md border border-status-success-fg bg-surface-card px-3 py-2 text-xs" />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false); // clipboard blocked: the field is selectable, so the link can still be copied by hand
            }
          }}
          className="rounded-md border border-status-success-fg bg-surface-card px-3 py-2 text-xs font-medium text-status-success-fg hover:bg-status-success-bg"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
