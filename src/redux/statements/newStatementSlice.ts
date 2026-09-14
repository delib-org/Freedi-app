import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { CompoundPhase, QuestionType, Statement, StatementType } from '@freedi/shared-types';
import { getDefaultQuestionType } from '@/models/questionTypeDefaults';

/** What the person is adding; maps 1:1 to a child StatementType. */
export type AddStatementIntent = 'answer' | 'question' | 'group';
/** Where the flow was opened from (analytics + return behaviour). */
export type AddStatementOrigin =
	| 'bar'
	| 'rail'
	| 'hero'
	| 'aside'
	| 'fab'
	| 'chat-mark'
	| 'mindmap'
	| 'banner'
	| 'home'
	| 'url'
	| 'toast'
	| 'prompt'
	| 'legacy';
/** `db` writes through createStatementWithSubscription; `storeTemp` only adds to Redux. */
export type AddStatementCommit = 'db' | 'storeTemp';

export const INTENT_TO_TYPE: Record<AddStatementIntent, StatementType> = {
	answer: StatementType.option,
	question: StatementType.question,
	group: StatementType.group,
};

export function intentFromType(type: StatementType | undefined): AddStatementIntent {
	if (type === StatementType.question) return 'question';
	if (type === StatementType.group) return 'group';

	return 'answer';
}

export interface NewStatementState {
	parentStatement: Statement | null | 'top';
	newStatement: Partial<Statement> | null;
	isLoading: boolean;
	error: string | null;
	showModal: boolean;
	intent: AddStatementIntent | null;
	origin: AddStatementOrigin | null;
	commit: AddStatementCommit;
}

/** What the legacy callers dispatch; intent/origin/commit are derived when absent. */
export type LegacyNewStatementPayload = Omit<NewStatementState, 'intent' | 'origin' | 'commit'> &
	Partial<Pick<NewStatementState, 'intent' | 'origin' | 'commit'>>;

export interface OpenAddStatementPayload {
	parentStatement: Statement | 'top';
	intent: AddStatementIntent;
	origin: AddStatementOrigin;
	commit?: AddStatementCommit;
	/** Only for intent `question`; compound gets its phase settings pre-filled. */
	questionType?: QuestionType;
}

const initialState: NewStatementState = {
	parentStatement: null,
	newStatement: null,
	isLoading: false,
	error: null,
	showModal: false,
	intent: null,
	origin: null,
	commit: 'db',
};

export const newStatementSlice = createSlice({
	name: 'newStatement',
	initialState,
	reducers: {
		/** Legacy opener (bottom nav, phases, stages). Prefer openAddStatement. */
		setNewStatementModal: (state, action: PayloadAction<LegacyNewStatementPayload>) => {
			const { parentStatement, newStatement, isLoading, showModal, error } = action.payload;
			state.parentStatement = parentStatement || null;
			state.newStatement = newStatement || null;
			state.isLoading = isLoading || false;
			state.error = error || null;
			state.showModal = showModal || false;
			state.intent = action.payload.intent ?? intentFromType(newStatement?.statementType);
			state.origin = action.payload.origin ?? 'legacy';
			state.commit = action.payload.commit ?? 'db';
		},
		setParentStatement: (state, action: PayloadAction<Statement | null | 'top'>) => {
			state.parentStatement = action.payload;
			state.intent = null;
			state.origin = null;
			state.commit = 'db';
		},
		setNewStatementType: (state, action: PayloadAction<StatementType>) => {
			state.intent = intentFromType(action.payload);
			state.newStatement = {
				...state.newStatement,
				statementType: action.payload,
			};
		},
		setNewQuestionType: (state, action: PayloadAction<QuestionType | null>) => {
			state.newStatement = {
				...state.newStatement,
				questionSettings: {
					...state.newStatement?.questionSettings,
					questionType: action.payload || getDefaultQuestionType(), // Use centralized default
				},
			};
		},
		clearNewStatement: (state) => {
			state.parentStatement = null;
			state.newStatement = null;
			state.isLoading = false;
			state.error = null;
			state.showModal = false;
			state.intent = null;
			state.origin = null;
			state.commit = 'db';
		},
		/** The one way to open the add flow (sheet under the new shell, modal in legacy). */
		openAddStatement: (state, action: PayloadAction<OpenAddStatementPayload>) => {
			const { parentStatement, intent, origin, commit, questionType } = action.payload;
			state.parentStatement = parentStatement;
			state.intent = intent;
			state.origin = origin;
			state.commit = commit ?? 'db';
			state.isLoading = false;
			state.error = null;
			state.showModal = true;
			const statementType = INTENT_TO_TYPE[intent];
			state.newStatement =
				intent === 'question' && questionType
					? {
							statementType,
							questionSettings: {
								questionType,
								...(questionType === QuestionType.compound
									? { compoundSettings: { currentPhase: CompoundPhase.defineQuestion } }
									: {}),
							},
						}
					: { statementType };
		},
		closeAddStatement: (state) => {
			state.showModal = false;
			state.parentStatement = null;
			state.newStatement = null;
			state.isLoading = false;
			state.error = null;
			state.intent = null;
			state.origin = null;
			state.commit = 'db';
		},
		setLoading: (state, action: PayloadAction<boolean>) => {
			state.isLoading = action.payload;
		},
		setError: (state, action: PayloadAction<string | null>) => {
			state.error = action.payload;
		},
		setShowNewStatementModal: (state, action: PayloadAction<boolean>) => {
			state.showModal = action.payload;
		},
	},
});

export const {
	setNewStatementModal,
	setParentStatement,
	setNewStatementType,
	setNewQuestionType,
	clearNewStatement,
	setLoading,
	setError,
	setShowNewStatementModal,
	openAddStatement,
	closeAddStatement,
} = newStatementSlice.actions;

export const selectAddStatementIntent = (state: { newStatement: NewStatementState }) =>
	state.newStatement.intent;

export const selectAddStatementOrigin = (state: { newStatement: NewStatementState }) =>
	state.newStatement.origin;

export const selectAddStatementCommit = (state: { newStatement: NewStatementState }) =>
	state.newStatement.commit;

export const selectParentStatementForNewStatement = (state: { newStatement: NewStatementState }) =>
	state.newStatement.parentStatement;

export const selectNewStatementLoading = (state: { newStatement: NewStatementState }) =>
	state.newStatement.isLoading;

export const selectNewStatementError = (state: { newStatement: NewStatementState }) =>
	state.newStatement.error;

export const selectNewStatementShowModal = (state: { newStatement: NewStatementState }) =>
	state.newStatement.showModal;

export const selectNewStatement = (state: { newStatement: NewStatementState }) =>
	state.newStatement.newStatement;
