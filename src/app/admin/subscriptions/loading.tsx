import { SkeletonBlock } from '@/components/admin/StateViews';

export default function SubscriptionsLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading subscriptions">
      <SkeletonBlock className="h-8 w-48" />
      <SkeletonBlock className="h-10" />
      <SkeletonBlock className="h-64" />
    </div>
  );
}
