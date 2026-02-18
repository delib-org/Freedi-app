import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections, PolarizationIndex } from '@freedi/shared-types';
import { store } from '@/redux/store';
import {
	deletePolarizationIndex,
	setPolarizationIndexes,
} from '@/redux/userDemographic/userDemographicSlice';

export function listenToPolarizationIndex(statementId: string) {
	try {
		if (!statementId) {
			throw new Error('Statement ID is required to listen to polarization index.');
		}

		const dispatch = store.dispatch;

		const polarizationIndexRef = collection(FireStore, Collections.polarizationIndex);
		const q = query(polarizationIndexRef, where('parentId', '==', statementId));

		return onSnapshot(q, (polarizationIndexes) => {
			polarizationIndexes.docChanges().forEach((change) => {
				const data = change.doc.data() as PolarizationIndex;

				if (change.type === 'added' || change.type === 'modified') {
					dispatch(setPolarizationIndexes(data));
				} else if (change.type === 'removed') {
					dispatch(deletePolarizationIndex(data.statementId));
				}
			});
		});
	} catch (error) {
		console.error('Error listening to polarization index:', error);
	}
}
