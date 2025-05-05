import { useState, FC } from 'react';
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
import Loader from '@/view/components/loaders/Loader';

const MindMap: FC = () => {
	// Add a render counter for debugging - remove in production

	const { statementId } = useParams();
	const statement = useSelector(statementSelector(statementId));

	// Safely access statement.statementId with optional chaining
	const userSubscription = useAppSelector(
		statementSubscriptionSelector(statement?.statementId)
	);

	// Use the fixed hook
	const { flat, results, loading, handleCluster, handleRecoverSnapshot } = useMindMap();

	const role = userSubscription ? userSubscription.role : Role.member;
	const _isAdmin = isAdmin(role);

	const { t } = useUserConfig();
	const { mapContext, setMapContext } = useMapContext();

	const [filterBy, setFilterBy] = useState<FilterType>(
		FilterType.questionsResultsOptions
	);

	const toggleModal = (show: boolean) => {
		setMapContext((prev) => ({
			...prev,
			showModal: show,
		}));
	};

	// Only render if we have the necessary data
	if (!statement) {
		return <div>Loading statement...</div>;
	}	

	return (
		<main className='page__main'>
			<ReactFlowProvider>
				<div className="btns">
					{loading && <Loader />}
					{flat && !loading  && <button onClick={handleCluster} className='btn'>Cluster</button>}
					{!flat && !loading && <button onClick={handleRecoverSnapshot} className='btn'>Flat</button>}
				</div>
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

export default MindMap;
