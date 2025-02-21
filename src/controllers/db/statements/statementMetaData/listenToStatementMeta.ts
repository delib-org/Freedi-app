import { Dispatch } from '@reduxjs/toolkit';
import { Unsubscribe, doc, onSnapshot } from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import { setStatementMetaData } from '@/redux/statements/statementsMetaSlice';
import { store } from '@/redux/store';
import { Collections } from '@/types/TypeEnums';
import { StatementMetaDataSchema } from '@/types/statement/Statement';
import { parse } from 'valibot';

export function listenToStatementMetaData(statementId: string): Unsubscribe {
	try {
		const dispatch = store.dispatch as Dispatch;
		if (!statementId) {
			throw new Error('Statement ID is missing');
		}

		const statementMetaDataRef = doc(
			FireStore,
			Collections.statementsMetaData,
			statementId
		);

		return onSnapshot(statementMetaDataRef, (statementMetaDataDB) => {
			try {
				if (!statementMetaDataDB.exists()) {
					throw new Error('Statement meta does not exist');
				}
				const statementMetaData = parse(
					StatementMetaDataSchema,
					statementMetaDataDB.data()
				);

				dispatch(setStatementMetaData(statementMetaData));
			} catch (error) {
				console.error(error);
			}
		});
	} catch (error) {
		console.error(error);

		//@ts-ignore
		return () => {
			console.error('Unsubscribe function not returned');
		};
	}
}
