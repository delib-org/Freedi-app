import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import StatementHeader from '../statement/components/header/StatementHeader';
import { useStageVM } from './StageVM';

const Stage = () => {
	const { stage, parentStatement } = useStageVM();
	const { loading, topParentStatement } = useAuthorization(
		stage?.statementId ?? ''
	);

	if (loading) return <div>Loading...</div>;

	return (
		<div>
			<StatementHeader
				statement={stage}
				topParentStatement={topParentStatement}
				parentStatement={parentStatement}
			/>
			<h1>{parentStatement?.statement}</h1>
			Stage: {stage?.statement}
		</div>
	);
};

export default Stage;
