import { FC } from 'react';

interface MindMapStatusBarProps {
	isOffline: boolean;
	offlineDataAvailable: boolean;
	nodeCount: number;
}

const MindMapStatusBar: FC<MindMapStatusBarProps> = ({
	isOffline,
	offlineDataAvailable,
	nodeCount,
}) => {
	return (
		<div
			style={{
				position: 'absolute',
				bottom: '1rem',
				left: '1rem',
				zIndex: 100,
				display: 'flex',
				gap: '0.5rem',
			}}
		>
			{isOffline && (
				<div
					style={{
						background: 'var(--warning-bg)',
						color: 'var(--warning)',
						padding: '0.25rem 0.5rem',
						borderRadius: '4px',
						fontSize: '0.75rem',
					}}
				>
					Offline
				</div>
			)}

			{offlineDataAvailable && (
				<div
					style={{
						background: 'var(--info-bg)',
						color: 'var(--info)',
						padding: '0.25rem 0.5rem',
						borderRadius: '4px',
						fontSize: '0.75rem',
					}}
				>
					Cached Data
				</div>
			)}

			{nodeCount > 0 && (
				<div
					style={{
						background: 'rgba(255, 255, 255, 0.9)',
						color: 'var(--text-secondary)',
						padding: '0.25rem 0.5rem',
						borderRadius: '4px',
						fontSize: '0.75rem',
					}}
				>
					{nodeCount} nodes
				</div>
			)}
		</div>
	);
};

export default MindMapStatusBar;
