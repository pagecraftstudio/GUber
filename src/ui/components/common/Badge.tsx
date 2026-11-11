import React from 'react';
import { useLocale } from '../../context/LocaleContext';

type StatusType =
  | 'active'
  | 'scheduled'
  | 'boarding'
  | 'in_transit'
  | 'completed'
  | 'no_show'
  | 'cancelled'
  | 'cancellation_requested'
  | 'confirmed'
  | 'pending'
  | 'boarded'
  | 'trial'
  | 'suspended'
  | 'verified'
  | 'maintenance'
  | 'idle'
  | 'on_trip'
  | 'off_duty';

interface BadgeProps {
  status: StatusType;
  label?: string;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, label, className = '' }) => {
  const { t } = useLocale();

  const styles: Record<StatusType, { bg: string; text: string; dot: string }> = {
    active: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-600' },
    verified: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-600' },
    confirmed: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-600' },
    completed: { bg: 'bg-slate-100 border-slate-200', text: 'text-slate-700', dot: 'bg-slate-500' },
    no_show: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', dot: 'bg-red-600' },
    boarded: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', dot: 'bg-blue-600' },
    boarding: { bg: 'bg-sky-50 border-sky-200', text: 'text-sky-700', dot: 'bg-sky-600' },
    in_transit: { bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-600' },
    scheduled: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400' },
    pending: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-600' },
    cancellation_requested: { bg: 'bg-amber-50 border-amber-300', text: 'text-amber-800', dot: 'bg-amber-600' },
    trial: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-600' },
    maintenance: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-600' },
    idle: { bg: 'bg-slate-100 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400' },
    on_trip: { bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-600' },
    off_duty: { bg: 'bg-slate-100 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400' },
    cancelled: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', dot: 'bg-red-600' },
    suspended: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', dot: 'bg-red-600' },
  };

  const style = styles[status] || styles.scheduled;
  
  // Resolve displayLabel ensuring localization in Arabic and English
  let displayLabel: string;
  if (!label || label.toLowerCase() === status.toLowerCase()) {
    displayLabel = t(status as any);
  } else {
    const rawKey = label.toLowerCase().replace(/[\s-]+/g, '_');
    const translated = (t as any)(rawKey);
    displayLabel = translated && translated !== rawKey ? translated : label;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium border ${style.bg} ${style.text} ${className} whitespace-nowrap shrink-0`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot} shrink-0`} aria-hidden="true" />
      <span>{displayLabel}</span>
    </span>
  );
};
