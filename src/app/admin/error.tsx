'use client';
import { AdminErrorState } from '@/components/admin/StateViews';

// Unexpected render errors only. Next hides the real message in production; we never show error.message.
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminErrorState message="Something went wrong. Please try again." onRetry={reset} />;
}
