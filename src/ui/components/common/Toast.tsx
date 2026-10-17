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
            border: 'border-emerald-200',
            bg: 'bg-white',
            icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
            title: 'text-slate-900',
          },
          error: {
            border: 'border-red-200',
            bg: 'bg-white',
            icon: <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />,
            title: 'text-slate-900',
          },
          info: {
            border: 'border-blue-200',
            bg: 'bg-white',
            icon: <Info className="w-4 h-4 text-[#3563E9] shrink-0" />,
            title: 'text-slate-900',
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
                  <p className="text-[11px] text-slate-500 mt-0.5">{toast.message}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
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
