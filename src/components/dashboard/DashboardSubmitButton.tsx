'use client';

import { useFormStatus } from 'react-dom';

type Props = {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
};

export function DashboardSubmitButton({
  children,
  className = '',
  pendingText = 'Saving…',
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`${className} disabled:cursor-wait disabled:opacity-60`}
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span
            aria-hidden="true"
            className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
          {pendingText}
        </span>
      ) : children}
    </button>
  );
}
