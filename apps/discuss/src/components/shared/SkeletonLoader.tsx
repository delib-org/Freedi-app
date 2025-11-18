interface SkeletonLoaderProps {
  count?: number;
}

/**
 * Skeleton loading placeholder
 * Shown while content is being fetched
 */
export default function SkeletonLoader({ count = 3 }: SkeletonLoaderProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: '1.5rem',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
          }}
        >
          <div
            className="skeleton"
            style={{ height: '1.5rem', marginBottom: '0.75rem', width: '90%' }}
          />
          <div
            className="skeleton"
            style={{ height: '1rem', marginBottom: '0.5rem', width: '70%' }}
          />
          <div
            className="skeleton"
            style={{ height: '2.5rem', width: '100%' }}
          />
        </div>
      ))}
    </div>
  );
}
