import { useUserConfig } from './useUserConfig';
import { logError } from '@/utils/errorHandling';

export function useDecreaseLearningRemain() {
	const { learning, decrementLearning } = useUserConfig();

	return function decreaseLearning({
		evaluation,
		addOption,
		communityVoiceLabel,
	}: {
		evaluation?: boolean;
		addOption?: boolean;
		communityVoiceLabel?: boolean;
	}): boolean {
		try {
			if (!evaluation && !addOption && !communityVoiceLabel) {
				throw new Error('evaluation, addOption, or communityVoiceLabel is required');
			}

			// Update local state
			if (evaluation && learning.evaluation > 0) {
				decrementLearning('evaluation');
			}

			if (addOption && learning.addOptions > 0) {
				decrementLearning('addOptions');
			}

			if (communityVoiceLabel && learning.communityVoiceLabels > 0) {
				decrementLearning('communityVoiceLabels');
			}

			return true;
		} catch (error) {
			logError(error, {
				operation: 'hooks.useDecreaseLearningRemain.decreaseLearning',
				metadata: { message: 'Error decreasing learning remain:' },
			});

			return false;
		}
	};
}
