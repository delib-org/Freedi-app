import { useEffect } from 'react';
import { listenToRoomSettingsByTopParent } from '@/controllers/db/roomAssignment';
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';
import { selectAllRoomSettings } from '@/redux/roomAssignment/roomAssignmentSlice';
import { countActiveRooms } from './roomsLogic';

/**
 * How many rooms a question's answers are split into, live. Listens only
 * while `isListening` (joining is on), so a question without joining costs
 * no reads.
 */
export function useActiveRoomCount(questionId: string, isListening: boolean): number {
	const dispatch = useAppDispatch();
	const settings = useAppSelector(selectAllRoomSettings);

	useEffect(() => {
		if (!isListening) return;

		return listenToRoomSettingsByTopParent(questionId, dispatch);
	}, [questionId, isListening, dispatch]);

	return isListening ? countActiveRooms(settings, questionId) : 0;
}
