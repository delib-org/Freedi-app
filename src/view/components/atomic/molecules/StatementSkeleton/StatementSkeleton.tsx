import React from 'react';
import { Skeleton } from '../../atoms/Skeleton';

interface StatementSkeletonProps {
	showNav?: boolean;
	cardCount?: number;
}

const StatementSkeleton: React.FC<StatementSkeletonProps> = ({ showNav = true, cardCount = 3 }) => {
	return (
		<div className="skeleton-statement">
			{/* Header */}
			<div className="skeleton-statement__header">
				<Skeleton variant="avatar" />
				<div className="skeleton-statement__title">
					<Skeleton variant="title" />
				</div>
				<Skeleton variant="button" width={40} height={40} />
			</div>

			{/* Content */}
			<div className="skeleton-statement__content">
				{/* Statement cards */}
				{Array.from({ length: cardCount }).map((_, index) => (
					<div key={index} className="skeleton-statement__card">
						<div className="skeleton-statement__card-header">
							<Skeleton variant="avatar" />
							<Skeleton variant="text" width="40%" />
						</div>
						<div className="skeleton-statement__card-body">
							<Skeleton variant="text" />
							<Skeleton variant="text" width="80%" />
							<Skeleton variant="text" width="60%" />
						</div>
					</div>
				))}
			</div>

			{/* FAB button */}
			<Skeleton variant="button" className="skeleton-statement__fab" />

			{/* Bottom navigation */}
			{showNav && (
				<div className="skeleton-statement__nav">
					{Array.from({ length: 4 }).map((_, index) => (
						<Skeleton key={index} variant="button" className="skeleton-statement__nav-item" />
					))}
				</div>
			)}
		</div>
	);
};

export default StatementSkeleton;
