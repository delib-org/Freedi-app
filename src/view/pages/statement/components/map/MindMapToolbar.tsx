import { FC, useCallback } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { FilterType } from '@/controllers/general/sorting';
import { enhancedMindMapService } from '@/services/mindMap/EnhancedMindMapService';
import { logError } from '@/utils/errorHandling';

interface MindMapToolbarProps {
	filterBy: FilterType;
	setFilterBy: (filter: FilterType) => void;
	isAdmin: boolean;
	statementId: string | undefined;
}

const MindMapToolbar: FC<MindMapToolbarProps> = ({
	filterBy,
	setFilterBy,
	isAdmin,
	statementId,
}) => {
	const { t } = useTranslation();

	const handleExport = useCallback(
		async (format: 'json' | 'svg' | 'png') => {
			if (!statementId) return;

			try {
				const blob = await enhancedMindMapService.exportMindMap(statementId, format);

				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `mindmap-${statementId}.${format}`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);

				console.info(`[EnhancedMindMap] Exported as ${format}`);
			} catch (error) {
				logError(error, {
					operation: 'MindMapToolbar.handleExport',
					statementId,
					metadata: { format },
				});
			}
		},
		[statementId],
	);

	const handleValidate = useCallback(async () => {
		if (!statementId) return;

		try {
			const validation = await enhancedMindMapService.validateHierarchy(statementId);

			if (validation.isValid) {
				console.info('[EnhancedMindMap] Hierarchy is valid:', validation.stats);
			} else {
				logError(new Error('[EnhancedMindMap] Hierarchy validation issues:'), {
					operation: 'MindMapToolbar.handleValidate',
					metadata: { detail: validation.issues },
				});
			}
		} catch (error) {
			logError(error, {
				operation: 'MindMapToolbar.handleValidate',
				statementId,
			});
		}
	}, [statementId]);

	const handleCacheStats = useCallback(() => {
		const stats = enhancedMindMapService.getCacheStats();
		console.info('[EnhancedMindMap] Cache statistics:', stats);
	}, []);

	return (
		<div
			style={{
				position: 'absolute',
				top: '1rem',
				right: '1rem',
				zIndex: 100,
				display: 'flex',
				flexDirection: 'column',
				gap: '0.5rem',
			}}
		>
			{/* Filter selector */}
			<select
				aria-label="Select filter type"
				onChange={(ev) => setFilterBy(ev.target.value as FilterType)}
				value={filterBy}
				style={{
					padding: '0.5rem',
					borderRadius: '4px',
					border: '1px solid var(--border-color)',
					background: 'white',
				}}
			>
				<option value={FilterType.questionsResults}>{t('Questions and Results')}</option>
				<option value={FilterType.questionsResultsOptions}>
					{t('Questions, options and Results')}
				</option>
			</select>

			{/* Export buttons */}
			{isAdmin && (
				<div
					style={{
						display: 'flex',
						gap: '0.5rem',
						background: 'white',
						padding: '0.5rem',
						borderRadius: '4px',
						border: '1px solid var(--border-color)',
					}}
				>
					<button
						onClick={() => handleExport('json')}
						style={{
							padding: '0.25rem 0.5rem',
							fontSize: '0.875rem',
							cursor: 'pointer',
						}}
					>
						Export JSON
					</button>
					<button
						onClick={() => handleExport('svg')}
						disabled
						style={{
							padding: '0.25rem 0.5rem',
							fontSize: '0.875rem',
							cursor: 'not-allowed',
							opacity: 0.5,
						}}
					>
						Export SVG
					</button>
				</div>
			)}

			{/* Dev tools */}
			{process.env.NODE_ENV === 'development' && (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: '0.25rem',
						background: 'white',
						padding: '0.5rem',
						borderRadius: '4px',
						border: '1px solid var(--border-color)',
						fontSize: '0.75rem',
					}}
				>
					<button onClick={handleValidate}>Validate</button>
					<button onClick={handleCacheStats}>Cache Stats</button>
					<button onClick={() => enhancedMindMapService.clearAll()}>Clear Cache</button>
				</div>
			)}
		</div>
	);
};

export default MindMapToolbar;
