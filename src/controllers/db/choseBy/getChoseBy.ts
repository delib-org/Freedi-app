import { FireStore } from '../config';
import { onSnapshot, Unsubscribe, doc } from 'firebase/firestore';
import { setChoseBy } from '@/redux/choseBy/choseBySlice';
import { store } from '@/redux/store';
import { Collections } from '@/types/TypeEnums';
import { ChoseBy, defaultChoseBySettings } from '@/types/choseBy/ChoseBy';

export function listenToChoseBy(statementId: string | undefined): Unsubscribe {
	try {
		if (!statementId) {
			return () => {
				return;
			};
		}

		const dispatch = store.dispatch;
		const choseByRef = doc(FireStore, Collections.choseBy, statementId);

		return onSnapshot(choseByRef, (choseBySnap) => {
			if (!choseBySnap.exists()) {
				dispatch(setChoseBy(defaultChoseBySettings(statementId)));

				return;
			}

			dispatch(setChoseBy(choseBySnap.data() as ChoseBy));
		});
	} catch (error) {
		console.error(error);

		return () => {
			return;
		};
	}
}
