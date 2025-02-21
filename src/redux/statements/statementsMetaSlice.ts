import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { updateArray } from '@/controllers/general/helpers';
import {
	StatementMetaData,
	StatementMetaDataSchema,
} from '@/types/statement/Statement';
import { parse } from 'valibot';

// Define a type for the slice state
interface StatementMetaDataState {
	statementsMetaData: StatementMetaData[];
}

// Define the initial state using that type
const initialState: StatementMetaDataState = {
	statementsMetaData: [],
};

export const statementMetaData = createSlice({
	name: 'statements-meta-data',
	initialState,
	reducers: {
		setStatementMetaData: (
			state,
			action: PayloadAction<StatementMetaData>
		) => {
			try {
				const statementMetaData = parse(
					StatementMetaDataSchema,
					action.payload
				);

				state.statementsMetaData = updateArray(
					state.statementsMetaData,
					statementMetaData,
					'statementId'
				);
			} catch (error) {
				console.error(error);
			}
		},
	},
});

export const { setStatementMetaData } = statementMetaData.actions;

// Other code such as selectors can use the imported `RootState` type
export const statementMetaDataSelector =
	(statementId: string) => (state: RootState) =>
		state.statementMetaData.statementsMetaData.find(
			(statementMetaData) => statementMetaData.statementId === statementId
		);

export default statementMetaData.reducer;
