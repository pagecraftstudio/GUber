import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  icon,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-ink-secondary mb-1.5">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-ink-muted">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          className={`w-full rounded-lg border bg-surface-card px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent disabled:bg-surface-page disabled:text-ink-muted ${
            icon ? 'ps-9' : ''
          } ${error ? 'border-status-error-fg focus:ring-status-error-fg' : 'border-line-strong hover:border-line-strong'} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-status-error-fg font-medium">{error}</p>}
      {!error && helperText && <p className="mt-1 text-xs text-ink-muted">{helperText}</p>}
    </div>
  );
};
