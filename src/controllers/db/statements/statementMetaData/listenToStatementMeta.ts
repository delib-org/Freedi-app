import { Dispatch } from '@reduxjs/toolkit';
import { Unsubscribe, onSnapshot } from 'firebase/firestore';
import { setStatementMetaData } from '@/redux/statements/statementsMetaSlice';
import { store } from '@/redux/store';
import { StatementMetaDataSchema, Collections } from '@freedi/shared-types';
import { parse } from 'valibot';
import { createDocRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

export function listenToStatementMetaData(statementId: string): Unsubscribe {
	try {
		const dispatch = store.dispatch as Dispatch;
		if (!statementId) {
			throw new Error('Statement ID is missing');
		}

		const statementMetaDataRef = createDocRef(Collections.statementsMetaData, statementId);

		return onSnapshot(statementMetaDataRef, (statementMetaDataDB) => {
			try {
				if (!statementMetaDataDB.exists()) {
					throw new Error('Statement meta does not exist');
				}
				const statementMetaData = parse(StatementMetaDataSchema, statementMetaDataDB.data());

				dispatch(setStatementMetaData(statementMetaData));
			} catch (error) {
				logError(error, {
					operation: 'statements.statementMetaData.listenToStatementMeta.listenToStatementMetaData',
				});
			}
		});
	} catch (error) {
		logError(error, {
			operation: 'statements.statementMetaData.listenToStatementMeta.listenToStatementMetaData',
		});

		//@ts-ignore
		return () => {
			logError(new Error('Unsubscribe function not returned'), {
				operation: 'statements.statementMetaData.listenToStatementMeta.not',
			});
		};
	}
}
