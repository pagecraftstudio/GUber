import { SkeletonBlock } from '@/components/admin/StateViews';

export default function AuditLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading audit log">
      <SkeletonBlock className="h-8 w-40" />
      <SkeletonBlock className="h-24" />
      <SkeletonBlock className="h-72" />
    </div>
  );
}
