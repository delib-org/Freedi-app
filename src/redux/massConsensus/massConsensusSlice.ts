import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { Statement } from '@/types/statement/StatementTypes';
import { GeneratedStatement, MassConsensus } from '@/types/massConsensus/massConsensusTypes';
import { updateArray } from '@/controllers/general/helpers';

export enum Status {
	idle = 'idle',
	loading = 'loading',
	failed = 'failed',
}

// Define a type for the slice state
interface MassConsensusState {
	similarStatements: Statement[] | GeneratedStatement[];
	massConsensusStatusTexts: MassConsensus[];
}

// Define the initial state using that type
const initialState: MassConsensusState = {
	similarStatements: [],
	massConsensusStatusTexts: [],
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
		setMassConsensusTexts: (
			state,
			action: PayloadAction<MassConsensus>
		) => {
			state.massConsensusStatusTexts = updateArray(
				state.massConsensusStatusTexts, action.payload, 'statementId'
			);
		},
		deleteMassConsensusTexts: (
			state,
			action: PayloadAction<string>
		) => {
			state.massConsensusStatusTexts = state.massConsensusStatusTexts.filter(
				(massConsensus) => massConsensus.statementId !== action.payload
			);
		},
	},
});

export const { setSimilarStatements, setMassConsensusTexts, deleteMassConsensusTexts } = massConsensusSlice.actions;

export const selectSimilarStatements = (state: RootState) =>
	state.massConsensus.similarStatements;
export const selectSimilarStatementsByStatementId =
	(statementId: string) => (state: RootState) =>
		state.massConsensus.similarStatements.filter(
			(statement: Statement | GeneratedStatement) =>
				statement.statementId === statementId
		);

export const selectMassConsensusTexts = (statementId: string | undefined) => (state: RootState) => state.massConsensus.massConsensusStatusTexts.find(mc => mc.statementId === statementId);

export default massConsensusSlice.reducer;
