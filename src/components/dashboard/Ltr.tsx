/** Phone numbers, emails, plates and references keep left-to-right order inside Arabic text (digits and "+" would otherwise reorder). */
export function Ltr({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span dir="ltr" className={`inline-block ${className}`}>{children}</span>;
}
