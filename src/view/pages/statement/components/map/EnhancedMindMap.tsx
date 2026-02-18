import { useState, FC, useEffect, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { ReactFlowProvider } from 'reactflow';
import { useParams } from 'react-router';
import { StatementType, Role } from '@freedi/shared-types';
import { RootState } from '@/redux/store';

// Components
import CreateStatementModal from '../createStatementModal/CreateStatementModal';
import VirtualMindMapChart from './components/VirtualMindMapChart';
import { MindMapErrorBoundary } from './components/MindMapErrorBoundary';
import Modal from '@/view/components/modal/Modal';

// Hooks and utilities
import { isAdmin } from '@/controllers/general/helpers';
import { FilterType } from '@/controllers/general/sorting';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useMapContext } from '@/controllers/hooks/useMap';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { createMindMapTreeSelector } from '@/redux/statements/mindMapSelectors';

// Services
import { enhancedMindMapService } from '@/services/mindMap/EnhancedMindMapService';
import { offlineManager } from '@/services/mindMap/OfflineManager';
import { listenToMindMapData } from '@/controllers/db/statements/optimizedListeners';

// Constants and types
import { MindMapNode, MindMapData } from '@/services/mindMap/types';
import { MINDMAP_CONFIG } from '@/constants/mindMap';
import { MindMapLoadingState } from '@/services/mindMap/types';
import { logError } from '@/utils/errorHandling';
import { Results } from '@freedi/shared-types';

// Helper to convert MindMapNode to Results
function convertMindMapNodeToResults(node: MindMapNode): Results {
	return {
		top: node.statement,
		sub: node.children.map((child) => convertMindMapNodeToResults(child)),
	};
}

/**
 * Enhanced MindMap component with all performance and robustness improvements
 */
const EnhancedMindMap: FC = () => {
	const { statementId } = useParams();
	const statement = useSelector(statementSelector(statementId));
	const [statementParent, setStatementParent] = useState<typeof current>();

	// Subscription management
	const subscriptionStatementId = statementId;
	const userSubscription = useAppSelector(
		subscriptionStatementId
			? statementSubscriptionSelector(subscriptionStatementId)
			: () => undefined,
	);

	const rootStatementId = statement?.topParentId ?? statement?.statementId;
	const rootSubscription = useAppSelector(
		rootStatementId && !userSubscription
			? statementSubscriptionSelector(rootStatementId)
			: () => undefined,
	);

	const effectiveSubscription = userSubscription || rootSubscription;
	const role = effectiveSubscription ? effectiveSubscription.role : Role.member;
	const _isAdmin = isAdmin(role);

	// Hooks
	const { t } = useTranslation();
	const { mapContext, setMapContext } = useMapContext();
	const selectedId = mapContext?.selectedId ?? null;

	// State
	const [filterBy, setFilterBy] = useState<FilterType>(FilterType.questionsResultsOptions);
	const [loadingState, setLoadingState] = useState<MindMapLoadingState>(MindMapLoadingState.IDLE);
	const [, setError] = useState<Error | null>(null);
	const [results, setResults] = useState<MindMapNode | null>(null);
	const [isOffline, setIsOffline] = useState(!navigator.onLine);
	const [offlineDataAvailable, setOfflineDataAvailable] = useState(false);

	// Enhanced loading states
	const [loadingMessage, setLoadingMessage] = useState('Initializing mind map...');
	const [showSkeleton, setShowSkeleton] = useState(false);
	const [nodeCount, setNodeCount] = useState(0);
	const [loadProgress, setLoadProgress] = useState(0);

	// Use optimized selector
	const treeSelector = useMemo(() => createMindMapTreeSelector(), []);
	const treeData = useSelector((state: RootState) =>
		statementId ? treeSelector(state, statementId) : null,
	);

	// Monitor online/offline status
	useEffect(() => {
		const handleOnline = () => {
			setIsOffline(false);
			console.info('[EnhancedMindMap] Network online');
			// Sync pending updates
			offlineManager.syncPendingUpdates();
		};

		const handleOffline = () => {
			setIsOffline(true);
			console.info('[EnhancedMindMap] Network offline');
		};

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	}, []);

	// Load mind-map data with all enhancements
	useEffect(() => {
		if (!statementId) return;

		let unsubscribe: (() => void) | null = null;

		const loadData = async () => {
			try {
				setLoadingState(MindMapLoadingState.LOADING);
				setLoadingMessage('Loading mind map data...');

				// Show skeleton after delay
				const skeletonTimer = setTimeout(() => {
					setShowSkeleton(true);
				}, MINDMAP_CONFIG.LOADING.SKELETON_DELAY);

				// Check for offline data first
				if (isOffline) {
					const offlineData = await offlineManager.loadMindMap(statementId);
					if (offlineData) {
						setResults(offlineData.tree);
						setNodeCount(offlineData.nodeMap.size);
						setOfflineDataAvailable(true);
						setLoadingMessage('Loaded from offline storage');
						setLoadingState(MindMapLoadingState.FULLY_LOADED);
						clearTimeout(skeletonTimer);

						return;
					}
				}

				// Use consolidated listener
				unsubscribe = listenToMindMapData(statementId);

				// Subscribe to updates
				const updateCallback = (data: MindMapData) => {
					setResults(data.tree);
					setNodeCount(data.nodeMap?.size || 0);
					setLoadProgress(100);
					setLoadingState(data.loadingState);

					// Save for offline access
					if (data.loadingState === MindMapLoadingState.FULLY_LOADED) {
						offlineManager.saveMindMap(data).catch((error) => {
							console.info('[EnhancedMindMap] Failed to save offline:', error);
						});
					}
				};

				// Load hierarchy with enhanced service
				const data = await enhancedMindMapService.loadHierarchy(statementId, {
					useCache: true,
					retryOnError: true,
				});

				if (data) {
					updateCallback(data);
					setLoadingMessage(`Loaded ${data.nodeMap.size} nodes`);
				}

				// Subscribe to real-time updates
				const unsubscribeUpdates = enhancedMindMapService.subscribeToUpdates(
					statementId,
					updateCallback,
					{ useCache: true },
				);

				// Combine unsubscribes
				unsubscribe = () => {
					unsubscribeUpdates();
					if (unsubscribe) unsubscribe();
				};

				clearTimeout(skeletonTimer);
				setShowSkeleton(false);
				setLoadingState(MindMapLoadingState.FULLY_LOADED);
			} catch (error) {
				logError(error, {
					operation: 'EnhancedMindMap.loadData',
					statementId,
				});

				setError(error as Error);
				setLoadingState(MindMapLoadingState.ERROR);
				setLoadingMessage(MINDMAP_CONFIG.ERROR_MESSAGES.LOAD_FAILED);
			}
		};

		loadData();

		// Cleanup
		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	}, [statementId, isOffline]);

	// Update loading progress
	useEffect(() => {
		if (loadingState === MindMapLoadingState.LOADING && treeData) {
			const progress = Math.min((treeData.totalNodes / 100) * 100, 90);
			setLoadProgress(progress);
			setNodeCount(treeData.totalNodes);
		}
	}, [treeData, loadingState]);

	// Handle current selection
	const current = useSelector(selectedId ? statementSelector(selectedId) : () => undefined);

	useEffect(() => {
		if (current) {
			setStatementParent(current);
		}
	}, [current]);

	// Modal handling
	const toggleModal = useCallback(
		(show: boolean) => {
			setMapContext((prev) => ({
				...prev,
				showModal: show,
			}));
		},
		[setMapContext],
	);

	// Export functionality
	const handleExport = useCallback(
		async (format: 'json' | 'svg' | 'png') => {
			if (!statementId) return;

			try {
				const blob = await enhancedMindMapService.exportMindMap(statementId, format);

				// Download the file
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
					operation: 'EnhancedMindMap.handleExport',
					statementId,
					metadata: { format },
				});
			}
		},
		[statementId],
	);

	// Validate hierarchy
	const handleValidate = useCallback(async () => {
		if (!statementId) return;

		try {
			const validation = await enhancedMindMapService.validateHierarchy(statementId);

			if (validation.isValid) {
				console.info('[EnhancedMindMap] Hierarchy is valid:', validation.stats);
			} else {
				console.error('[EnhancedMindMap] Hierarchy validation issues:', validation.issues);
			}
		} catch (error) {
			logError(error, {
				operation: 'EnhancedMindMap.handleValidate',
				statementId,
			});
		}
	}, [statementId]);

	// Cache statistics
	const handleCacheStats = useCallback(() => {
		const stats = enhancedMindMapService.getCacheStats();
		console.info('[EnhancedMindMap] Cache statistics:', stats);
	}, []);

	// Determine allowed statement types
	const isDefaultOption = statementParent?.statementType === StatementType.question;
	const isOptionAllowed =
		mapContext.parentStatement &&
		typeof mapContext.parentStatement === 'object' &&
		'statementType' in mapContext.parentStatement
			? mapContext.parentStatement.statementType === StatementType.question
			: false;

	// Render loading state
	if (loadingState === MindMapLoadingState.LOADING || !statement) {
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
	}

	// Add spinner animation styles
	const spinnerStyle = `
		@keyframes spin {
			0% { transform: rotate(0deg); }
			100% { transform: rotate(360deg); }
		}
	`;

	// Main render
	return (
		<MindMapErrorBoundary statementId={statementId}>
			<main className="page__main" style={{ padding: 0, alignItems: 'stretch' }}>
				<style>{spinnerStyle}</style>
				<ReactFlowProvider>
					{/* Control panel */}
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
						{_isAdmin && (
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

					{/* Status indicators */}
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

					{/* Mind map chart */}
					<div
						style={{
							height: '100vh',
							width: '100vw',
							direction: 'ltr',
							position: 'relative',
						}}
					>
						{results ? (
							<VirtualMindMapChart
								descendants={convertMindMapNodeToResults(results)}
								isAdmin={_isAdmin}
								filterBy={filterBy}
							/>
						) : (
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									height: '100%',
									color: 'var(--text-secondary)',
								}}
							>
								No data available
							</div>
						)}
					</div>

					{/* Create statement modal */}
					{mapContext.showModal && (
						<Modal>
							<CreateStatementModal
								allowedTypes={[isOptionAllowed && StatementType.option, StatementType.question]}
								parentStatement={mapContext.parentStatement}
								isOption={isDefaultOption}
								setShowModal={toggleModal}
							/>
						</Modal>
					)}
				</ReactFlowProvider>
			</main>
		</MindMapErrorBoundary>
	);
};

export default EnhancedMindMap;
