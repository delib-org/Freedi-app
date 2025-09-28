import { useState, FC, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { ReactFlowProvider } from 'reactflow';
import CreateStatementModal from '../createStatementModal/CreateStatementModal';
import MindMapChart from './components/MindMapChart';
import { isAdmin } from '@/controllers/general/helpers';
import { FilterType } from '@/controllers/general/sorting';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useMapContext } from '@/controllers/hooks/useMap';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import Modal from '@/view/components/modal/Modal';
import { StatementType, Role } from 'delib-npm';
import { useParams } from 'react-router';
import { useMindMap } from './MindMapMV';

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

	const { t } = useUserConfig();
	const { mapContext, setMapContext } = useMapContext();
	const selectedId = mapContext?.selectedId ?? null;

	const [filterBy, setFilterBy] = useState<FilterType>(
		FilterType.questionsResultsOptions
	);

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

	const isDefaultOption: boolean =
		statementParent?.statementType === StatementType.question;
	const isOptionAllowed =
		statementParent?.statementType !== StatementType.group;

	// Only render if we have the necessary data
	if (!statement) {
		return <div>Loading statement...</div>;
	}

	return (
		<main className='page__main' style={{ padding: 0, alignItems: 'stretch' }}>
			<ReactFlowProvider>
				<select
					aria-label='Select filter type for'
					onChange={(ev) =>
						setFilterBy(ev.target.value as FilterType)
					}
					value={filterBy}
					style={{
						width: '100vw',
						maxWidth: '300px',
						margin: '1rem auto',
						position: 'absolute',
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
						height: '100vh',
						width: '100vw',
						direction: 'ltr',
						position: 'relative',
					}}
				>
					{/* Only render chart when results are available */}
					{results ? (
						<MindMapChart
							descendants={results}
							isAdmin={_isAdmin}
							filterBy={filterBy}
						/>
					) : (
						<div>Loading mind map data...</div>
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
			</ReactFlowProvider>
		</main>
	);
};

export default MindMap;
