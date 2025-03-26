import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { Statement, GeneratedStatement, MassConsensusProcess, updateArray } from 'delib-npm';

export enum Status {
	idle = 'idle',
	loading = 'loading',
	failed = 'failed',
}

// Define a type for the slice state
interface MassConsensusState {
	similarStatements: Statement[] | GeneratedStatement[];
	massConsensusProcess: MassConsensusProcess[];
}

// Define the initial state using that type
const initialState: MassConsensusState = {
	similarStatements: [],
	massConsensusProcess: [],
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
		setMassConsensusProcess: (
			state,
			action: PayloadAction<MassConsensusProcess>
		) => {
			state.massConsensusProcess = updateArray(
				state.massConsensusProcess, action.payload, 'statementId');
		},
		deleteMassConsensusProcess: (
			state,
			action: PayloadAction<string>
		) => {
			state.massConsensusProcess = state.massConsensusProcess.filter(
				(process) => process.statementId !== action.payload
			);
		}
	},
});

export const { setSimilarStatements, setMassConsensusProcess, deleteMassConsensusProcess } = massConsensusSlice.actions;

export const selectSimilarStatements = (state: RootState) =>
	state.massConsensus.similarStatements;
export const selectSimilarStatementsByStatementId =
	(statementId: string) => (state: RootState) =>
		state.massConsensus.similarStatements.filter(
			(statement: Statement | GeneratedStatement) =>
				statement.statementId === statementId
		);

export const massConsensusProcessSelector = (statementId: string) => (state: RootState) => state.massConsensus.massConsensusProcess.find((process) => process.statementId === statementId);

export default massConsensusSlice.reducer;
