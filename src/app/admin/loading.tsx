import { SkeletonBlock } from '@/components/admin/StateViews';

export default function AdminLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <SkeletonBlock className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => <SkeletonBlock key={i} className="h-24" />)}
      </div>
      <SkeletonBlock className="h-40" />
    </div>
  );
}
