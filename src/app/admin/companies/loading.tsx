import { SkeletonBlock } from '@/components/admin/StateViews';

export default function CompaniesLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading companies">
      <SkeletonBlock className="h-8 w-40" />
      <SkeletonBlock className="h-10" />
      <SkeletonBlock className="h-64" />
    </div>
  );
}
