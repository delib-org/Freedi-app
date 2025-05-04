import { useState, FC } from 'react';
import { useSelector } from 'react-redux';
import { ReactFlowProvider } from 'reactflow';
import CreateStatementModal from '../createStatementModal/CreateStatementModal';
import MindMapChart from './components/MindMapChart';
import { APIEndPoint, isAdmin } from '@/controllers/general/helpers';
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

	// Safely access statement.statementId with optional chaining
	const userSubscription = useAppSelector(
		statementSubscriptionSelector(statement?.statementId)
	);

	// Use the fixed hook
	const { results, descendants } = useMindMap();

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

	function handleCluster() {
		console.log("descendants", descendants);
		const endPoint = APIEndPoint('getCluster', {});
		fetch(endPoint, {
			method: 'POST',
			body: JSON.stringify({
				topic: statement,
				descendants: descendants
			}),
			headers: {
				'Content-Type': 'application/json',
			},
		})
			.then((response) => response.json())
			.then((data) => {
				console.log('Cluster data:', data);
			})
			.catch((error) => {
				console.error('Error fetching cluster data:', error);
			});
	}

	function handleRecoverSnapshot() {
		const endPoint = APIEndPoint('recoverLastSnapshot', {});
		fetch(endPoint, {
			method: 'POST',
			body: JSON.stringify({ snapshotId: statement.statementId }),
			headers: {
				'Content-Type': 'application/json',
			},
		})
			.then((response) => response.json())
			.then((data) => {
				console.log('Recover snapshot data:', data);
			})
			.catch((error) => {
				console.error('Error fetching recover snapshot data:', error);
			});
	}

	return (
		<main className='page__main'>
			<ReactFlowProvider>
				<div className="btns">
					<button onClick={handleCluster} className='btn'>Cluster</button>
					<button onClick={handleRecoverSnapshot} className='btn'>Recover Snapshot</button>
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
