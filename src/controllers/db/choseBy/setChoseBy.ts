import { ChoseBy } from '@/types/choseBy';
import { DB } from '../config';
import { doc, setDoc } from 'firebase/firestore';
import { Collections } from '@/types/enums';

export async function setChoseByToDB(choseBy: ChoseBy) {
	try {
		const choseByRef = doc(DB, Collections.choseBy, choseBy.statementId);
		await setDoc(choseByRef, choseBy);
	} catch (error) {
		console.error(error);
	}
}
