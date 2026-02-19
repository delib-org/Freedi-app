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
import MindMapToolbar from './MindMapToolbar';
import MindMapStatusBar from './MindMapStatusBar';
import MindMapLoadingView from './MindMapLoadingView';

// Hooks and utilities
import { isAdmin } from '@/controllers/general/helpers';
import { FilterType } from '@/controllers/general/sorting';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
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

				const skeletonTimer = setTimeout(() => {
					setShowSkeleton(true);
				}, MINDMAP_CONFIG.LOADING.SKELETON_DELAY);

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

				unsubscribe = listenToMindMapData(statementId);

				const updateCallback = (data: MindMapData) => {
					setResults(data.tree);
					setNodeCount(data.nodeMap?.size || 0);
					setLoadProgress(100);
					setLoadingState(data.loadingState);

					if (data.loadingState === MindMapLoadingState.FULLY_LOADED) {
						offlineManager.saveMindMap(data).catch((error) => {
							console.info('[EnhancedMindMap] Failed to save offline:', error);
						});
					}
				};

				const data = await enhancedMindMapService.loadHierarchy(statementId, {
					useCache: true,
					retryOnError: true,
				});

				if (data) {
					updateCallback(data);
					setLoadingMessage(`Loaded ${data.nodeMap.size} nodes`);
				}

				const unsubscribeUpdates = enhancedMindMapService.subscribeToUpdates(
					statementId,
					updateCallback,
					{ useCache: true },
				);

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
			<MindMapLoadingView
				showSkeleton={showSkeleton}
				loadProgress={loadProgress}
				loadingMessage={loadingMessage}
				nodeCount={nodeCount}
				isOffline={isOffline}
			/>
		);
	}

	// Spinner animation styles
	const spinnerStyle = `
		@keyframes spin {
			0% { transform: rotate(0deg); }
			100% { transform: rotate(360deg); }
		}
	`;

	return (
		<MindMapErrorBoundary statementId={statementId}>
			<main className="page__main" style={{ padding: 0, alignItems: 'stretch' }}>
				<style>{spinnerStyle}</style>
				<ReactFlowProvider>
					<MindMapToolbar
						filterBy={filterBy}
						setFilterBy={setFilterBy}
						isAdmin={_isAdmin}
						statementId={statementId}
					/>

					<MindMapStatusBar
						isOffline={isOffline}
						offlineDataAvailable={offlineDataAvailable}
						nodeCount={nodeCount}
					/>

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
