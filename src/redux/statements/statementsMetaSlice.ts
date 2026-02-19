import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { updateArray, StatementMetaData, StatementMetaDataSchema } from '@freedi/shared-types';
import { parse } from 'valibot';
import { logError } from '@/utils/errorHandling';

// Define a type for the slice state
interface StatementMetaDataState {
	statementsMetaData: StatementMetaData[];
}

// Define the initial state using that type
const initialState: StatementMetaDataState = {
	statementsMetaData: [],
};

export const statementsMetaSlice = createSlice({
	name: 'statements-meta-data',
	initialState,
	reducers: {
		setStatementMetaData: (state, action: PayloadAction<StatementMetaData>) => {
			try {
				const statementMetaData = parse(StatementMetaDataSchema, action.payload);

				state.statementsMetaData = updateArray(
					state.statementsMetaData,
					statementMetaData,
					'statementId',
				);
			} catch (error) {
				logError(error, { operation: 'redux.statements.statementsMetaSlice.unknown' });
			}
		},
	},
});

export const { setStatementMetaData } = statementsMetaSlice.actions;

// Other code such as selectors can use the narrowly-typed state parameter
export const statementMetaDataSelector =
	(statementId: string) => (state: { statementMetaData: StatementMetaDataState }) =>
		state.statementMetaData.statementsMetaData.find(
			(statementMetaData) => statementMetaData.statementId === statementId,
		);

export default statementsMetaSlice.reducer;
