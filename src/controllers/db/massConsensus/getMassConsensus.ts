// Adjust the path as necessary
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { FireStore } from '../config';
import { parse } from 'valibot';
import { MassConsensus, MassConsensusSchema } from '@/types/massConsensus/massConsensusTypes';
import { setMassConsensusTexts } from '@/redux/massConsensus/massConsensusSlice';
import { store } from '@/redux/store';

export const listenToMassConsensusQuestion = (statementId: string) => {
	const massConsensusCollection = collection(FireStore, 'massConsensus');
	const questionRef = doc(massConsensusCollection, statementId);
	const dispatch = store.dispatch;

	return onSnapshot(questionRef, (doc) => {
		if (doc.exists()) {
			const question = doc.data() as MassConsensus;
			parse(MassConsensusSchema, question);
			dispatch(setMassConsensusTexts(question));
		}
	});

};
