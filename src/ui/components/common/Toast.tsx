import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 end-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none p-2">
      {toasts.map((toast) => {
        const styles = {
          success: {
            border: 'border-status-success-fg',
            bg: 'bg-surface-card',
            icon: <CheckCircle2 className="w-4 h-4 text-status-success-fg shrink-0" />,
            title: 'text-ink-primary',
          },
          error: {
            border: 'border-status-error-fg',
            bg: 'bg-surface-card',
            icon: <AlertCircle className="w-4 h-4 text-status-error-fg shrink-0" />,
            title: 'text-ink-primary',
          },
          info: {
            border: 'border-line-strong',
            bg: 'bg-surface-card',
            icon: <Info className="w-4 h-4 text-status-info-fg shrink-0" />,
            title: 'text-ink-primary',
          },
        };

        const config = styles[toast.type];

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto p-3.5 rounded-xl border ${config.border} ${config.bg} shadow-lg flex items-start justify-between gap-3 animate-in slide-in-from-bottom-2 duration-150`}
          >
            <div className="flex items-start gap-2.5">
              {config.icon}
              <div>
                <p className={`text-xs font-semibold ${config.title}`}>{toast.title}</p>
                {toast.message && (
                  <p className="text-[11px] text-ink-muted mt-0.5">{toast.message}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-ink-muted hover:text-ink-secondary p-0.5 rounded cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
