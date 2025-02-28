import { useUserConfig } from './useUserConfig';

export function useDecreaseLearningRemain() {
	const { learning, decrementLearning } = useUserConfig();

	return function decreaseLearning({
		evaluation,
		addOption,
	}: {
		evaluation?: boolean;
		addOption?: boolean;
	}): boolean {
		try {
			if (!evaluation && !addOption) {
				throw new Error('evaluation or addOption is required');
			}

			// Update local state
			if (evaluation && learning.evaluation > 0) {
				decrementLearning('evaluation');
			}

			if (addOption && learning.addOptions > 0) {
				decrementLearning('addOptions');
			}

			return true;
		} catch (error) {
			console.error('Error decreasing learning remain:', error);

			return false;
		}
	};
}
