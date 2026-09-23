import { act, renderHook, waitFor } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import { useCreateStatementFlow } from '../useCreateStatementFlow';

const dispatch = jest.fn();
const createWithSub = jest.fn();
const createLocal = jest.fn();
const detect = jest.fn();
const similar = jest.fn();
const evaluate = jest.fn();
const mockUx = {
	addAnswerStep: jest.fn(),
	addAnswerCompleted: jest.fn(),
	addAnswerAbandoned: jest.fn(),
	addAnswerStarted: jest.fn(),
};

jest.mock('react-redux', () => ({ useDispatch: () => dispatch }));
jest.mock('@/controllers/hooks/useAuthentication', () => ({
	useAuthentication: () => ({ user: { uid: 'u1', displayName: 'U' } }),
}));
jest.mock('@/controllers/hooks/useUserConfig', () => ({
	useUserConfig: () => ({ currentLanguage: 'en' }),
}));
jest.mock('@/controllers/db/statements/createStatementWithSubscription', () => ({
	createStatementWithSubscription: (...args: unknown[]) => createWithSub(...args),
}));
jest.mock('@/controllers/db/statements/createStatement', () => ({
	createStatement: (...args: unknown[]) => createLocal(...args),
}));
jest.mock('@/controllers/db/evaluation/setEvaluation', () => ({
	setEvaluationToDB: (...args: unknown[]) => evaluate(...args),
}));
jest.mock('@/services/multiSuggestionDetection', () => ({
	detectMultipleSuggestionsWithTimeout: (...args: unknown[]) => detect(...args),
}));
jest.mock('../../newStatement/components/01-form/GetInitialStatementDataCont', () => ({
	getSimilarOptions: (...args: unknown[]) => similar(...args),
}));
jest.mock('@/services/analytics', () => ({
	// Deferred so the hoisted factory never touches mockUx before it is initialised.
	uxAnalytics: {
		addAnswerStep: (...a: unknown[]) => mockUx.addAnswerStep(...a),
		addAnswerCompleted: (...a: unknown[]) => mockUx.addAnswerCompleted(...a),
		addAnswerAbandoned: (...a: unknown[]) => mockUx.addAnswerAbandoned(...a),
		addAnswerStarted: (...a: unknown[]) => mockUx.addAnswerStarted(...a),
	},
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	setStatement: (s: unknown) => ({ type: 'statements/setStatement', payload: s }),
}));
jest.mock('@/models/questionTypeDefaults', () => ({ getDefaultQuestionType: () => 'simple' }));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const question = (settings: Record<string, boolean> = {}) =>
	({
		statementId: 'q1',
		statement: 'Q',
		statementType: 'question',
		statementSettings: settings,
	}) as unknown as Statement;

function setup(settings: Record<string, boolean> = {}, extra: Record<string, unknown> = {}) {
	const onDone = jest.fn();
	const hook = renderHook(() =>
		useCreateStatementFlow({
			parentStatement: question(settings),
			intent: 'answer',
			origin: 'bar',
			onDone,
			...extra,
		}),
	);

	return { ...hook, onDone };
}

describe('useCreateStatementFlow', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		createWithSub.mockResolvedValue('new-1');
		createLocal.mockImplementation(({ text }: { text: string }) => ({
			statementId: `tmp-${text}`,
		}));
		detect.mockResolvedValue({ ok: true, isMultipleSuggestions: false, suggestions: [] });
		similar.mockResolvedValue({ similarStatements: [] });
		evaluate.mockResolvedValue(undefined);
	});

	it('plain answer: submit creates through createStatementWithSubscription and completes', async () => {
		const { result, onDone } = setup();
		act(() => result.current.setDraft({ title: 'Bike lanes', description: 'on Main St' }));
		act(() => result.current.submit());
		await waitFor(() => expect(result.current.state.step).toBe('done'));

		expect(createWithSub).toHaveBeenCalledTimes(1);
		expect(createWithSub.mock.calls[0][0]).toMatchObject({
			title: 'Bike lanes',
			newStatement: { statementType: 'option' },
			user: { uid: 'u1' },
		});
		expect(createWithSub.mock.calls[0][0].paragraphs[0].content).toBe('on Main St');
		expect(onDone).toHaveBeenCalledWith(['new-1']);
		expect(mockUx.addAnswerStep).toHaveBeenCalledWith('q1', 'create');
		expect(mockUx.addAnswerCompleted).toHaveBeenCalledWith('q1');
		expect(detect).not.toHaveBeenCalled();
		expect(similar).not.toHaveBeenCalled();
	});

	it('storeTemp: builds the statement locally and dispatches it, no database write', async () => {
		const { result } = setup({}, { commit: 'storeTemp' });
		act(() => result.current.setDraft({ title: 'Temp' }));
		act(() => result.current.submit());
		await waitFor(() => expect(result.current.state.step).toBe('done'));

		expect(createWithSub).not.toHaveBeenCalled();
		expect(createLocal).toHaveBeenCalledTimes(1);
		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'statements/setStatement' }),
		);
		expect(result.current.state.createdIds).toEqual(['tmp-Temp']);
	});

	it('similarity: offers matches, supporting one evaluates it and finishes without creating', async () => {
		similar.mockResolvedValue({ similarStatements: [{ statementId: 'a1', statement: 'Bikes' }] });
		const { result, onDone } = setup({ defaultLookForSimilarities: true });
		act(() => result.current.setDraft({ title: 'Bike lanes' }));
		act(() => result.current.submit());
		await waitFor(() => expect(result.current.state.similar).toHaveLength(1));
		expect(mockUx.addAnswerStep).toHaveBeenCalledWith('q1', 'similarity');

		await act(async () => {
			await result.current.similarity.support(result.current.state.similar[0]);
		});
		expect(evaluate).toHaveBeenCalledWith(
			expect.objectContaining({ statementId: 'a1' }),
			expect.anything(),
			1,
		);
		expect(result.current.state.step).toBe('done');
		expect(createWithSub).not.toHaveBeenCalled();
		expect(onDone).toHaveBeenCalledWith([]);
	});

	it('multi split: confirmed splits create one statement each', async () => {
		detect.mockResolvedValue({
			ok: true,
			isMultipleSuggestions: true,
			suggestions: [
				{ title: 'A', description: '', originalText: 'A' },
				{ title: 'B', description: 'b', originalText: 'B' },
			],
		});
		createWithSub.mockResolvedValueOnce('a').mockResolvedValueOnce('b');
		const { result, onDone } = setup({ enableMultiSuggestionDetection: true });
		act(() => result.current.setDraft({ title: 'A and B' }));
		act(() => result.current.submit());
		await waitFor(() => expect(result.current.state.splits).toHaveLength(2));
		expect(mockUx.addAnswerStep).toHaveBeenCalledWith('q1', 'split');

		act(() => result.current.multi.confirm(result.current.state.splits));
		await waitFor(() => expect(result.current.state.step).toBe('done'));
		expect(createWithSub).toHaveBeenCalledTimes(2);
		expect(onDone).toHaveBeenCalledWith(['a', 'b']);
	});

	it('pre-check: publish splits the refined text into title and paragraphs', async () => {
		const { result } = setup({ popperianDiscussionEnabled: true, popperianPreCheckEnabled: true });
		act(() => result.current.setDraft({ title: 'raw idea' }));
		act(() => result.current.submit());
		expect(result.current.state.step).toBe('structuredDebatePreCheck');
		expect(mockUx.addAnswerStep).toHaveBeenCalledWith('q1', 'precheck');

		act(() => result.current.preCheck.publish('Refined title\nline one\nline two'));
		await waitFor(() => expect(result.current.state.step).toBe('done'));
		expect(createWithSub.mock.calls[0][0].title).toBe('Refined title');
		expect(createWithSub.mock.calls[0][0].paragraphs).toHaveLength(2);
	});

	it('a failed write lands in error with the message, retry returns to the draft', async () => {
		createWithSub.mockRejectedValue(new Error('offline'));
		const { result, onDone } = setup();
		act(() => result.current.setDraft({ title: 'x' }));
		act(() => result.current.submit());
		await waitFor(() => expect(result.current.state.step).toBe('error'));
		expect(result.current.state.error).toBe('offline');
		expect(onDone).not.toHaveBeenCalled();
		act(() => result.current.retry());
		expect(result.current.state).toMatchObject({ step: 'draft', draft: { title: 'x' } });
	});

	it.each([
		['draft', {}, () => undefined],
		['similarity', { defaultLookForSimilarities: true }, undefined],
	])('abandon at %s reports once and never after completion', async (_step, settings, _noop) => {
		similar.mockResolvedValue({ similarStatements: [{ statementId: 'a1' }] });
		const { result } = setup(settings as Record<string, boolean>);
		act(() => result.current.setDraft({ title: 'x' }));
		if (_step === 'similarity') {
			act(() => result.current.submit());
			await waitFor(() => expect(result.current.state.similar).toHaveLength(1));
		}
		act(() => result.current.abandon());
		act(() => result.current.abandon());
		expect(mockUx.addAnswerAbandoned).toHaveBeenCalledTimes(1);
		expect(mockUx.addAnswerAbandoned).toHaveBeenCalledWith('q1');
	});

	it('abandon after done is a no-op', async () => {
		const { result } = setup();
		act(() => result.current.setDraft({ title: 'x' }));
		act(() => result.current.submit());
		await waitFor(() => expect(result.current.state.step).toBe('done'));
		act(() => result.current.abandon());
		expect(mockUx.addAnswerAbandoned).not.toHaveBeenCalled();
	});
});
