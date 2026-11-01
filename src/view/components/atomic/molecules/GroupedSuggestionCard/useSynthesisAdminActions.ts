import { useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	reverseIntegration,
	regenerateSynthesisProposal,
} from '@/controllers/db/integration/integrationController';
import { logError } from '@/utils/errorHandling';

interface SynthesisAdminActions {
	isReversing: boolean;
	isRegenerating: boolean;
	handleRegenerateProposal: () => Promise<void>;
	handleReverseSynthesis: () => Promise<void>;
}

/**
 * The two admin actions of a synthesized proposal: redraft it from its source
 * ideas, or reverse it back into those ideas. Both confirm first and report
 * failures through logError plus an alert.
 */
export function useSynthesisAdminActions(
	clusterStatementId: string,
	sourceCount: number,
): SynthesisAdminActions {
	const { t } = useTranslation();
	const [isReversing, setIsReversing] = useState(false);
	const [isRegenerating, setIsRegenerating] = useState(false);

	const handleRegenerateProposal = async (): Promise<void> => {
		const confirmCopy = t(
			'Regenerate this synthesized proposal? The AI will redraft the title, description, and sections from the {count} source ideas. Existing evaluations on the proposal stay intact.',
		).replace('{count}', String(sourceCount));
		if (!window.confirm(confirmCopy)) return;
		setIsRegenerating(true);
		try {
			const result = await regenerateSynthesisProposal({ clusterStatementId });
			if (result.cannotSynthesize) {
				const reason = result.splitReason || t('The source ideas span incompatible directions.');
				window.alert(
					t(
						'The AI declined to synthesize this group: {reason} Consider reversing this synthesis and re-running the pipeline so the group can be split.',
					).replace('{reason}', reason),
				);
			}
		} catch (error) {
			logError(error, {
				operation: 'GroupedSuggestionCard.handleRegenerateProposal',
				statementId: clusterStatementId,
			});
			window.alert(t('Regenerating proposal failed. Please try again.'));
		} finally {
			setIsRegenerating(false);
		}
	};

	const handleReverseSynthesis = async (): Promise<void> => {
		const confirmCopy = t(
			'Reverse this synthesis? The {count} source ideas will be restored as separate proposals and the synthesized proposal will be hidden. Direct evaluations on the synthesis will be deleted; evaluations on each source idea remain intact.',
		).replace('{count}', String(sourceCount));
		if (!window.confirm(confirmCopy)) return;
		setIsReversing(true);
		try {
			await reverseIntegration({ clusterStatementId });
		} catch (error) {
			logError(error, {
				operation: 'GroupedSuggestionCard.handleReverseSynthesis',
				statementId: clusterStatementId,
			});
			window.alert(t('Reversing synthesis failed. Please try again.'));
		} finally {
			setIsReversing(false);
		}
	};

	return { isReversing, isRegenerating, handleRegenerateProposal, handleReverseSynthesis };
}
