import { FC } from 'react';

interface MindMapLoadingViewProps {
	showSkeleton: boolean;
	loadProgress: number;
	loadingMessage: string;
	nodeCount: number;
	isOffline: boolean;
}

const MindMapLoadingView: FC<MindMapLoadingViewProps> = ({
	showSkeleton,
	loadProgress,
	loadingMessage,
	nodeCount,
	isOffline,
}) => {
	return (
		<div
			className="enhanced-mind-map-loading"
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				height: '100vh',
				flexDirection: 'column',
				gap: '1.5rem',
				background: 'var(--background-primary)',
			}}
		>
			{showSkeleton && (
				<>
					<div
						className="skeleton-loader"
						style={{
							width: '80px',
							height: '80px',
							border: '6px solid var(--background-secondary)',
							borderTop: '6px solid var(--btn-primary)',
							borderRadius: '50%',
							animation: 'spin 1s linear infinite',
						}}
					></div>

					{loadProgress > 0 && (
						<div
							style={{
								width: '300px',
								height: '8px',
								background: 'var(--background-secondary)',
								borderRadius: '4px',
								overflow: 'hidden',
							}}
						>
							<div
								style={{
									width: `${loadProgress}%`,
									height: '100%',
									background: 'var(--btn-primary)',
									transition: 'width 0.3s ease',
									borderRadius: '4px',
								}}
							></div>
						</div>
					)}
				</>
			)}

			<div
				style={{
					color: 'var(--text-body)',
					fontSize: '1.1rem',
					textAlign: 'center',
				}}
			>
				<div>{loadingMessage}</div>
				{nodeCount > 0 && (
					<div style={{ fontSize: '0.9rem', marginTop: '0.5rem', opacity: 0.7 }}>
						{nodeCount} nodes loaded...
					</div>
				)}
			</div>

			{isOffline && (
				<div
					style={{
						padding: '0.5rem 1rem',
						background: 'var(--warning-bg)',
						color: 'var(--warning)',
						borderRadius: '4px',
						fontSize: '0.9rem',
					}}
				>
					Offline mode - Limited functionality
				</div>
			)}
		</div>
	);
};

export default MindMapLoadingView;
