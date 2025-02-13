import { useIsAuthorized } from '@/controllers/hooks/authHooks';
import StatementHeader from '../statement/components/header/StatementHeader';
import { useStageVM } from './StageVM';
import SuggestionCards from '../statement/components/evaluations/components/suggestionCards/SuggestionCards';

const Stage = () => {
	const { stage, parentStatement } = useStageVM();
	const { loading, topParentStatement } =
		useIsAuthorized(stage?.statementId ?? '');

	if (loading) return <div>Loading...</div>

	return (
		<div>
			<StatementHeader statement={stage} topParentStatement={topParentStatement} parentStatement={parentStatement} />
			<h1>{parentStatement?.statement}</h1>
			Stage: {stage?.statement}
			<SuggestionCards />
		</div>
	)
}

export default Stage