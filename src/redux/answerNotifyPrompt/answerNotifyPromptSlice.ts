import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/** A published answer the notification-choices prompt may be shown for. */
export interface PublishedAnswer {
	questionId: string;
	answerId: string;
}

export interface AnswerNotifyPromptState {
	/** The latest answer published; the host decides whether to ask (once per question). */
	pending: PublishedAnswer | null;
}

const initialState: AnswerNotifyPromptState = { pending: null };

/**
 * Add paths only report "answer published"; one host (AnswerNotifyPromptHost)
 * owns the prompt, so it survives the add sheet closing and navigation.
 * A multi-split publish raises one prompt: the last report wins.
 */
export const answerNotifyPromptSlice = createSlice({
	name: 'answerNotifyPrompt',
	initialState,
	reducers: {
		answerPublished: (state, action: PayloadAction<PublishedAnswer>) => {
			state.pending = action.payload;
		},
		answerPromptHandled: (state) => {
			state.pending = null;
		},
	},
});

export const { answerPublished, answerPromptHandled } = answerNotifyPromptSlice.actions;

export const selectPendingAnswerPrompt = (state: {
	answerNotifyPrompt: AnswerNotifyPromptState;
}): PublishedAnswer | null => state.answerNotifyPrompt.pending;
