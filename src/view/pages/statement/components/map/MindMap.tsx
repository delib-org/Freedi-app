import { useState, FC, memo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { ReactFlowProvider } from 'reactflow';
import CreateStatementModal from '../createStatementModal/CreateStatementModal';
import MindMapChart from './components/MindMapChart';
import { isAdmin } from '@/controllers/general/helpers';
import {
	FilterType
} from '@/controllers/general/sorting';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import { useMapContext } from '@/controllers/hooks/useMap';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import Modal from '@/view/components/modal/Modal';
import { StatementType } from '@/types/TypeEnums';
import { Role } from '@/types/user/UserSettings';
import { useParams } from 'react-router';
import { useMindMap } from './MindMapMV';

const MindMap: FC = () => {
	// Get core data
	const { statementId } = useParams();
	const statement = useSelector(statementSelector(statementId));

	// Safely access statement.statementId with optional chaining
	const userSubscription = useAppSelector(
		statementSubscriptionSelector(statement?.statementId)
	);

	// Use the optimized mind map hook
	const { results } = useMindMap();

	const role = userSubscription ? userSubscription.role : Role.member;
	const _isAdmin = isAdmin(role);

	const { t } = useLanguage();
	const { mapContext, setMapContext } = useMapContext();

	const [filterBy, setFilterBy] = useState<FilterType>(
		FilterType.questionsResultsOptions
	);

	// Memoize callback functions to prevent unnecessary re-renders
	const toggleModal = useCallback((show: boolean) => {
		setMapContext((prev) => ({
			...prev,
			showModal: show,
		}));
	}, [setMapContext]);

	const handleFilterChange = useCallback((ev: React.ChangeEvent<HTMLSelectElement>) => {
		setFilterBy(ev.target.value as FilterType);
	}, []);

	// Only render if we have the necessary data
	if (!statement) {
		return <div>Loading statement...</div>;
	}

	return (
		<main className='page__main'>
			<ReactFlowProvider>
				<select
					aria-label='Select filter type for'
					onChange={handleFilterChange}
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
						<MemoizedMindMapChart
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
								StatementType.option,
								StatementType.question,
							]}
							parentStatement={mapContext.parentStatement}
							isOption={mapContext.isOption}
							setShowModal={toggleModal}
						/>
					</Modal>
				)}
			</ReactFlowProvider>
		</main>
	);
};

// Memoize the MindMapChart component to prevent unnecessary re-renders
const MemoizedMindMapChart = memo(MindMapChart, (prevProps, nextProps) => {
	// Only re-render if these specific props change
	return (
		prevProps.isAdmin === nextProps.isAdmin &&
		prevProps.descendants === nextProps.descendants &&
		prevProps.filterBy === nextProps.filterBy
	);
});

// Wrap the entire MindMap component in memo for additional performance
export default memo(MindMap);