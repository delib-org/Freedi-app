import { useIsAuthorized } from '@/controllers/hooks/authHooks';
import StatementHeader from '../statement/components/header/StatementHeader';
import { useStageVM } from './StageVM';
import { Statement } from '@/types/statement/StatementTypes';
import { StageSelectionType } from '@/types/stage/stageTypes';
import VotingSuggestions from '../massConsensus/votingSuggestions/VotingSuggestions';
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
			<div>Stage: {stage?.statement}</div>
			<StageSwitch statement={stage} />
		</div>
	)
}

export default Stage

interface StageSwitchProps {
	readonly statement: Statement;
}

function StageSwitch({ statement }: StageSwitchProps) {
	if (statement.stageSelectionType === StageSelectionType.checkbox) {
		return <p>Checkboxes</p>
	} else if (statement.stageSelectionType === StageSelectionType.consensus) {
		return <SuggestionCards />
	} else if (statement.stageSelectionType === StageSelectionType.voting) {
		return <VotingSuggestions />
	} else {
		return <SuggestionCards />
	}
}
