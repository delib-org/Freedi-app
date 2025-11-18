import SkeletonLoader from '@/components/shared/SkeletonLoader';

/**
 * Loading state for question page
 * Shown during navigation and data fetching
 */
export default function Loading() {
  return (
    <div className="page">
      {/* Question header skeleton */}
      <div className="skeleton" style={{ height: '3rem', marginBottom: '1rem', width: '80%' }} />
      <div className="skeleton" style={{ height: '1.5rem', marginBottom: '2rem', width: '60%' }} />

      {/* Solution cards skeleton */}
      <SkeletonLoader count={5} />
    </div>
  );
}
