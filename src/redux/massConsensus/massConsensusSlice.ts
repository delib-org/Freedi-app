import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { Statement } from '@/types/statement/Statement';
import { GeneratedStatement } from '@/types/massConsensus/massConsensusModel';

export enum Status {
	idle = 'idle',
	loading = 'loading',
	failed = 'failed',
}

// Define a type for the slice state
interface MassConsensusState {
	similarStatements: Statement[] | GeneratedStatement[];
}

// Define the initial state using that type
const initialState: MassConsensusState = {
	similarStatements: [],
};

export const massConsensusSlice = createSlice({
	name: 'mass-consensus',
	initialState,
	reducers: {
		setSimilarStatements: (
			state,
			action: PayloadAction<Statement[] | GeneratedStatement[]>
		) => {
			state.similarStatements = action.payload;
		},
	},
});

export const { setSimilarStatements } = massConsensusSlice.actions;

export const selectSimilarStatements = (state: RootState) =>
	state.massConsensus.similarStatements;
export const selectSimilarStatementsByStatementId =
	(statementId: string) => (state: RootState) =>
		state.massConsensus.similarStatements.filter(
			(statement: Statement | GeneratedStatement) =>
				statement.statementId === statementId
		);

export default massConsensusSlice.reducer;
