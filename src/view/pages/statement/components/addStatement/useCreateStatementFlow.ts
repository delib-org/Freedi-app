import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useDispatch } from 'react-redux';
import {
	CompoundPhase,
	ParagraphType,
	QuestionType,
	Statement,
	StatementType,
} from '@freedi/shared-types';
import type {
	AddStatementCommit,
	AddStatementIntent,
	AddStatementOrigin,
} from '@/redux/statements/newStatementSlice';
import { INTENT_TO_TYPE } from '@/redux/statements/newStatementSlice';
import { setStatement } from '@/redux/statements/statementsSlice';
import { createStatementWithSubscription } from '@/controllers/db/statements/createStatementWithSubscription';
import { createStatement } from '@/controllers/db/statements/createStatement';
import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { detectMultipleSuggestionsWithTimeout } from '@/services/multiSuggestionDetection';
import { getSimilarOptions } from '../newStatement/components/01-form/GetInitialStatementDataCont';
import { getDefaultQuestionType } from '@/models/questionTypeDefaults';
import { generateParagraphId } from '@/utils/paragraphUtils';
import { logError } from '@/utils/errorHandling';
import { uxAnalytics } from '@/services/analytics';
import {
	deriveFlowConfig,
	flowReducer,
	initialFlowState,
	toAnalyticsStep,
	type FlowConfig,
	type FlowDraft,
	type FlowEvent,
	type FlowState,
} from './createStatementFlow';

export interface CreateStatementFlowOptions {
	parentStatement: Statement | 'top';
	intent: AddStatementIntent;
	origin: AddStatementOrigin;
	commit?: AddStatementCommit;
	questionType?: QuestionType;
	/** Called once the flow reaches `done` (created ids, or [] when the person supported an existing answer). */
	onDone?: (createdIds: string[]) => void;
}

export interface CreateStatementFlow {
	state: FlowState;
	config: FlowConfig;
	parentId: string;
	setDraft: (draft: Partial<FlowDraft>) => void;
	submit: () => void;
	preCheck: { publish: (refinedText: string) => void; close: () => void };
	multi: { confirm: (splits: FlowDraft[]) => void; dismiss: () => void; cancel: () => void };
	similarity: {
		support: (statement: Statement) => Promise<void>;
		continueOwn: () => void;
		back: () => void;
	};
	retry: () => void;
	/** Close without finishing; reports how far the person got. No-op after `done`. */
	abandon: () => void;
}

export function textToParagraphs(text: string) {
	if (!text.trim()) return undefined;

	return text
		.split('\n')
		.filter((line) => line.trim())
		.map((line, index) => ({
			paragraphId: generateParagraphId(),
			type: ParagraphType.paragraph,
			content: line,
			order: index,
		}));
}

/** First line becomes the title, the rest the description (refinery output). */
export function splitRefinedText(refined: string): FlowDraft {
	const lines = refined.split('\n');

	return {
		title: lines[0].substring(0, 100),
		description: lines.slice(1).join('\n'),
	};
}

/**
 * The one creation flow: draft → structured-debate pre-check? → multi-split? →
 * similarity? → create → done. Transitions live in createStatementFlow.ts; this
 * hook runs the async work each step needs and reports the funnel to analytics.
 */
export function useCreateStatementFlow({
	parentStatement,
	intent,
	origin,
	commit = 'db',
	questionType,
	onDone,
}: CreateStatementFlowOptions): CreateStatementFlow {
	const dispatch = useDispatch();
	const { user } = useAuthentication();
	const { currentLanguage } = useUserConfig();
	const parentId = parentStatement === 'top' ? 'top' : parentStatement.statementId;
	const config = useMemo(
		() => deriveFlowConfig(parentStatement, intent, commit),
		[parentStatement, intent, commit],
	);
	const [state, rawDispatch] = useReducer(
		(s: FlowState, e: FlowEvent) => flowReducer(s, e, config),
		initialFlowState,
	);
	const send = useCallback((event: FlowEvent) => rawDispatch(event), []);
	const finishedRef = useRef(false);
	const onDoneRef = useRef(onDone);
	onDoneRef.current = onDone;

	// Funnel: one step event per transition, completion once.
	const lastStepRef = useRef(state.step);
	useEffect(() => {
		if (state.step === lastStepRef.current) return;
		lastStepRef.current = state.step;
		if (state.step === 'done') {
			finishedRef.current = true;
			uxAnalytics.addAnswerCompleted(parentId);
			onDoneRef.current?.(state.createdIds);
		} else if (state.step !== 'error') {
			uxAnalytics.addAnswerStep(parentId, toAnalyticsStep(state.step));
		}
	}, [state.step, state.createdIds, parentId]);

	// multiSplit: ask the detector once we enter the step.
	useEffect(() => {
		if (state.step !== 'multiSplit' || !state.pending) return;
		let cancelled = false;
		const { title, description } = state.draft;
		detectMultipleSuggestionsWithTimeout(
			title + (description ? `: ${description}` : ''),
			parentId,
			user?.uid ?? '',
		)
			.then((result) => {
				if (cancelled) return;
				const splits: FlowDraft[] =
					result.ok && result.isMultipleSuggestions
						? result.suggestions.map((s) => ({ title: s.title, description: s.description }))
						: [];
				send({ type: 'MULTI_RESULT', splits });
			})
			.catch((error: unknown) => {
				logError(error, {
					operation: 'addStatement.useCreateStatementFlow.multiSplit',
					statementId: parentId,
				});
				if (!cancelled) send({ type: 'MULTI_RESULT', splits: [] });
			});

		return () => {
			cancelled = true;
		};
	}, [state.step, state.pending, state.draft, parentId, user?.uid, send]);

	// similarity: look for existing statements that say the same thing.
	useEffect(() => {
		if (state.step !== 'similarity' || !state.pending) return;
		let cancelled = false;
		getSimilarOptions(parentId, state.draft.title, user?.uid ?? '', () => undefined)
			.then((result) => {
				if (cancelled) return;
				send({ type: 'SIMILARITY_RESULT', similar: result?.similarStatements ?? [] });
			})
			.catch(() => {
				if (!cancelled) send({ type: 'SIMILARITY_RESULT', similar: [] });
			});

		return () => {
			cancelled = true;
		};
	}, [state.step, state.pending, state.draft.title, parentId, user?.uid, send]);

	// create: write everything queued (one draft, or the confirmed splits).
	useEffect(() => {
		if (state.step !== 'create' || !state.pending) return;
		let cancelled = false;
		const statementType = INTENT_TO_TYPE[intent];
		const resolvedQuestionType = questionType ?? getDefaultQuestionType();

		const run = async (): Promise<string[]> => {
			if (!user) throw new Error('User is not defined');
			const ids: string[] = [];
			for (const draft of state.toCreate) {
				if (commit === 'storeTemp') {
					const temp = createStatement({
						parentStatement,
						text: draft.title,
						paragraphs: textToParagraphs(draft.description),
						statementType,
						questionType: intent === 'question' ? resolvedQuestionType : undefined,
					});
					if (!temp) throw new Error('Failed to build statement');
					dispatch(setStatement(temp));
					ids.push(temp.statementId);
				} else {
					const id = await createStatementWithSubscription({
						newStatementParent: parentStatement,
						title: draft.title,
						paragraphs: textToParagraphs(draft.description),
						newStatement:
							intent === 'question' && questionType === QuestionType.compound
								? {
										statementType,
										questionSettings: {
											questionType,
											compoundSettings: { currentPhase: CompoundPhase.defineQuestion },
										},
									}
								: { statementType },
						newStatementQuestionType: resolvedQuestionType,
						currentLanguage,
						user,
						dispatch,
					});
					ids.push(id);
				}
			}

			return ids;
		};

		run()
			.then((ids) => {
				if (!cancelled) send({ type: 'CREATE_OK', ids });
			})
			.catch((error: unknown) => {
				logError(error, {
					operation: 'addStatement.useCreateStatementFlow.create',
					statementId: parentId,
					userId: user?.uid,
					metadata: { intent, commit, origin },
				});
				if (!cancelled) {
					send({
						type: 'FAIL',
						message: error instanceof Error ? error.message : 'Failed to create statement',
					});
				}
			});

		return () => {
			cancelled = true;
		};
		// state.toCreate is set in the same transition that sets step=create.
	}, [state.step, state.pending]);

	const support = useCallback(
		async (statement: Statement) => {
			try {
				if (user) await setEvaluationToDB(statement, user, 1);
				send({ type: 'SIMILARITY_SUPPORTED' });
			} catch (error) {
				logError(error, {
					operation: 'addStatement.useCreateStatementFlow.support',
					statementId: statement.statementId,
					userId: user?.uid,
				});
				send({ type: 'FAIL', message: 'Failed to support answer' });
			}
		},
		[user, send],
	);

	const abandon = useCallback(() => {
		if (finishedRef.current) return;
		finishedRef.current = true;
		uxAnalytics.addAnswerAbandoned(parentId);
	}, [parentId]);

	return useMemo(
		() => ({
			state,
			config,
			parentId,
			setDraft: (draft: Partial<FlowDraft>) => send({ type: 'EDIT', draft }),
			submit: () => send({ type: 'SUBMIT' }),
			preCheck: {
				publish: (refinedText: string) =>
					send({ type: 'PRECHECK_PUBLISH', draft: splitRefinedText(refinedText) }),
				close: () => send({ type: 'PRECHECK_CLOSE' }),
			},
			multi: {
				confirm: (splits: FlowDraft[]) => send({ type: 'MULTI_CONFIRM', splits }),
				dismiss: () => send({ type: 'MULTI_DISMISS' }),
				cancel: () => send({ type: 'MULTI_CANCEL' }),
			},
			similarity: {
				support,
				continueOwn: () => send({ type: 'SIMILARITY_CONTINUE' }),
				back: () => send({ type: 'SIMILARITY_BACK' }),
			},
			retry: () => send({ type: 'RETRY' }),
			abandon,
		}),
		[state, config, parentId, send, support, abandon],
	);
}

/** The child StatementType an intent produces (re-exported for the sheet). */
export function typeForIntent(intent: AddStatementIntent): StatementType {
	return INTENT_TO_TYPE[intent];
}
