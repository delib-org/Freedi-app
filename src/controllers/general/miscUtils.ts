import { EnhancedEvaluationThumb } from '@/types/evaluation';

export function isProduction(): boolean {
	// In test environment, always return false
	if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
		return false;
	}

	return window.location.hostname !== 'localhost';
}

export const handleCloseInviteModal = (setShowModal: (show: boolean) => void) => {
	const inviteModal = document.querySelector('.inviteModal');
	if (inviteModal) {
		inviteModal.classList.add('closing');
		setTimeout(() => {
			setShowModal(false);
		}, 400);
	} else {
		setShowModal(false);
	}
};

export function getLastElements(array: Array<unknown>, number: number): Array<unknown> {
	return array.slice(Math.max(array.length - number, 1));
}

/**
 * Find the closest evaluation value in the array to a given target value
 * @param {Array} array - Array of objects with evaluation property
 * @param {number} targetValue - The value to find the closest match for (-1 to 1)
 * @returns {Object} - The object with the closest evaluation value
 */
export function findClosestEvaluation(array: EnhancedEvaluationThumb[], targetValue = 0) {
	// Validate input
	if (!Array.isArray(array) || array.length === 0) {
		throw new Error('Input must be a non-empty array');
	}

	if (targetValue < -1 || targetValue > 1) {
		throw new Error('Target value must be between -1 and 1');
	}

	// Sort the array by the absolute difference between evaluation and target value
	return array.reduce((closest, current) => {
		const currentDiff = Math.abs(current.evaluation - targetValue);
		const closestDiff = Math.abs(closest.evaluation - targetValue);

		return currentDiff < closestDiff ? current : closest;
	}, array[0]);
}
