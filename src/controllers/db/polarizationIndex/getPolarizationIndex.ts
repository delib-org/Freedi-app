import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { FireStore } from '../config';
import { listenWhenAuthenticated } from '../authGatedListener';
import { Collections, PolarizationIndex } from '@freedi/shared-types';
import { store } from '@/redux/store';
import {
	deletePolarizationIndex,
	setPolarizationIndexes,
} from '@/redux/userDemographic/userDemographicSlice';
import { logError } from '@/utils/errorHandling';

export function listenToPolarizationIndex(statementId: string) {
	try {
		if (!statementId) {
			throw new Error('Statement ID is required to listen to polarization index.');
		}

		const dispatch = store.dispatch;

		// `polarizationIndex` rules require an authenticated user. Attaching before
		// auth resolves produced unhandled `permission-denied` FirebaseErrors.
		return listenWhenAuthenticated(() => {
			const polarizationIndexRef = collection(FireStore, Collections.polarizationIndex);
			const q = query(polarizationIndexRef, where('parentId', '==', statementId));

			return onSnapshot(
				q,
				(polarizationIndexes) => {
					polarizationIndexes.docChanges().forEach((change) => {
						const data = change.doc.data() as PolarizationIndex;

						if (change.type === 'added' || change.type === 'modified') {
							dispatch(setPolarizationIndexes(data));
						} else if (change.type === 'removed') {
							dispatch(deletePolarizationIndex(data.statementId));
						}
					});
				},
				(error) => {
					// Without this callback the SDK escalates listener failures to an
					// unhandled rejection. Permission denials here are expected when a
					// user lacks access to the discussion, so they are logged, not thrown.
					logError(error, {
						operation: 'polarizationIndex.getPolarizationIndex.onSnapshot',
						statementId,
						metadata: { message: 'Polarization index listener failed' },
					});
				},
			);
		});
	} catch (error) {
		logError(error, {
			operation: 'polarizationIndex.getPolarizationIndex.listenToPolarizationIndex',
			metadata: { message: 'Error listening to polarization index:' },
		});
	}
}
