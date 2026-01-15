import { useState, FC, useEffect } from 'react';
import { useSelector } from 'react-redux';
import CreateStatementModal from '../createStatementModal/CreateStatementModal';
import MindElixirMap from './components/MindElixirMap';
import { isAdmin } from '@/controllers/general/helpers';
import { FilterType } from '@/controllers/general/sorting';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useMapContext } from '@/controllers/hooks/useMap';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import Modal from '@/view/components/modal/Modal';
import { StatementType, Role } from '@freedi/shared-types';
import { useParams } from 'react-router';
import { useMindMap } from './MindMapMV';
import { MINDMAP_CONFIG } from '@/constants/mindMap';

const MindMap: FC = () => {
	// Add a render counter for debugging - remove in production

	const { statementId } = useParams();
	const statement = useSelector(statementSelector(statementId));
	const [statementParent, setStatementParent] = useState<typeof current>();

	// Fix: Use statementId directly for subscription lookup
	// The subscription should be based on the current statement, not the root
	const subscriptionStatementId = statementId;

	const userSubscription = useAppSelector(
		subscriptionStatementId
			? statementSubscriptionSelector(subscriptionStatementId)
			: () => undefined
	);

	// Also try to get subscription from root if current doesn't have one
	const rootStatementId = statement?.topParentId ?? statement?.statementId;
	const rootSubscription = useAppSelector(
		rootStatementId && !userSubscription
			? statementSubscriptionSelector(rootStatementId)
			: () => undefined
	);

	// Use whichever subscription is available
	const effectiveSubscription = userSubscription || rootSubscription;

	// Use the fixed hook
	const { results } = useMindMap();

	const role = effectiveSubscription ? effectiveSubscription.role : Role.member;
	const _isAdmin = isAdmin(role);

	const { t } = useTranslation();
	const { mapContext, setMapContext } = useMapContext();
	const selectedId = mapContext?.selectedId ?? null;

	const [filterBy, setFilterBy] = useState<FilterType>(
		FilterType.questionsResultsOptions
	);

	// Add loading state tracking
	const [isInitialLoad, setIsInitialLoad] = useState(true);
	const [loadingMessage, setLoadingMessage] = useState('Loading mind map...');
	const [showSkeleton, setShowSkeleton] = useState(false);

	const toggleModal = (show: boolean) => {
		setMapContext((prev) => ({
			...prev,
			showModal: show,
		}));
	};
	const current = useSelector(
		selectedId ? statementSelector(selectedId) : () => undefined
	);

	useEffect(() => {
		if (current) {
			setStatementParent(current);
		}
	}, [current]);

	// Track loading state with skeleton loader delay
	useEffect(() => {
		if (!statement || !results) {
			// Show skeleton loader after delay to prevent flash
			const skeletonTimer = setTimeout(() => {
				setShowSkeleton(true);
			}, MINDMAP_CONFIG.LOADING.SKELETON_DELAY);

			// Update loading message after longer delay
			const messageTimer = setTimeout(() => {
				setLoadingMessage('Still loading... This might take a moment for large mind maps.');
			}, 5000);

			return () => {
				clearTimeout(skeletonTimer);
				clearTimeout(messageTimer);
			};
		} else {
			// Data loaded, clear loading state
			setIsInitialLoad(false);
			setShowSkeleton(false);
		}
	}, [statement, results]);

	const isDefaultOption: boolean =
		mapContext.parentStatement && typeof mapContext.parentStatement === 'object' && 'statementType' in mapContext.parentStatement
			? mapContext.parentStatement.statementType === StatementType.question
			: statementParent?.statementType === StatementType.question;
	// Options are allowed only under questions (not under groups or other options)
	const isOptionAllowed =
		mapContext.parentStatement && typeof mapContext.parentStatement === 'object' && 'statementType' in mapContext.parentStatement
			? mapContext.parentStatement.statementType === StatementType.question
			: false;

	// Enhanced loading states
	if (!statement) {
		return (
			<div className="mind-map-loading" style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				height: '100vh',
				flexDirection: 'column',
				gap: '1rem'
			}}>
				{showSkeleton && (
					<div className="skeleton-loader" style={{
						width: '60px',
						height: '60px',
						border: '5px solid #f3f3f3',
						borderTop: '5px solid var(--btn-primary)',
						borderRadius: '50%',
						animation: 'spin 1s linear infinite'
					}}></div>
				)}
				<div style={{ color: 'var(--text-body)', fontSize: '1.1rem' }}>
					{loadingMessage}
				</div>
			</div>
		);
	}

	// Add CSS for spinner animation
	const spinnerStyle = `
		@keyframes spin {
			0% { transform: rotate(0deg); }
			100% { transform: rotate(360deg); }
		}
	`;

	return (
		<main className='page__main' style={{ padding: 0, position: 'relative' }}>
			<style>{spinnerStyle}</style>
			<select
				aria-label='Select filter type for'
				onChange={(ev) =>
					setFilterBy(ev.target.value as FilterType)
				}
				value={filterBy}
				style={{
					maxWidth: '300px',
					position: 'absolute',
					top: '1rem',
					right: '1rem',
					zIndex: 100,
				}}
			>
				<option value={FilterType.questionsResults}>
					{t('Questions and Results')}
				</option>
				<option value={FilterType.questionsResultsOptions}>
					{t('Questions, options and Results')}
				</option>
			</select>
			<div
				style={{
					width: '100%',
					height: '100%',
					direction: 'ltr',
				}}
			>
				{/* Only render map when results are available */}
				{results ? (
					<MindElixirMap
						descendants={results}
						isAdmin={_isAdmin}
						filterBy={filterBy}
					/>
				) : (
					<div style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						height: '100%',
						flexDirection: 'column',
						gap: '1rem'
					}}>
						{showSkeleton && (
							<div className="skeleton-loader" style={{
								width: '60px',
								height: '60px',
								border: '5px solid #f3f3f3',
								borderTop: '5px solid var(--btn-primary)',
								borderRadius: '50%',
								animation: 'spin 1s linear infinite'
							}}></div>
						)}
						<div style={{ color: 'var(--text-body)', fontSize: '1.1rem' }}>
							{isInitialLoad ? 'Building mind map...' : 'Updating mind map...'}
						</div>
					</div>
				)}
			</div>

			{mapContext.showModal && (
				<Modal>
					<CreateStatementModal
						allowedTypes={[
							isOptionAllowed && StatementType.option,
							StatementType.question,
						]}
						parentStatement={mapContext.parentStatement}
						isOption={isDefaultOption}
						setShowModal={toggleModal}
					/>
				</Modal>
			)}
		</main>
	);
};

export default MindMap;
