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

	const rootStatementId = statement?.topParentId ?? statement?.statementId;

	const userSubscription = useAppSelector(
		rootStatementId
			? statementSubscriptionSelector(rootStatementId)
			: () => undefined
	);

	// Use the fixed hook
	const { results } = useMindMap();

	const role = userSubscription ? userSubscription.role : Role.member;
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
		<main className='page__main'>
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
						flex: 'auto',
						height: '20vh',
						width: '100%',
						direction: 'ltr',
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
