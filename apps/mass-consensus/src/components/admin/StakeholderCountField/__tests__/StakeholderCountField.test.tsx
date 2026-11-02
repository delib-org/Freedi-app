/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StakeholderCountField from '../StakeholderCountField';

const mockCallable = jest.fn();
const mockCallableOptions = jest.fn();
const mockAuthedFetch = jest.fn();

jest.mock('@freedi/shared-i18n/next', () => ({
	useTranslation: () => ({ t: (key: string) => key, dir: 'ltr' }),
}));
jest.mock('firebase/functions', () => ({
	httpsCallable: (_fn: unknown, _name: string, options: unknown) => {
		mockCallableOptions(options);

		return (data: unknown) => mockCallable(data);
	},
}));
jest.mock('@/lib/firebase/functionsClient', () => ({ functions: {} }));
jest.mock('@/lib/api/authedFetch', () => ({
	authedFetch: (...args: unknown[]) => mockAuthedFetch(...args),
}));
jest.mock('@/lib/utils/errorHandling', () => ({ logError: jest.fn() }));

function funnel(rated: string[], unrated: string[]): void {
	mockAuthedFetch.mockResolvedValue({
		ok: true,
		json: async () => ({
			questionFunnel: [
				...rated.map((questionId) => ({ questionId, usersEvaluated: 3 })),
				...unrated.map((questionId) => ({ questionId, usersEvaluated: 0 })),
			],
		}),
	});
}

describe('StakeholderCountField', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCallable.mockResolvedValue({ data: { success: true } });
	});

	it('is optional: shows the tag and an empty input, and reports a typed number', () => {
		const onChange = jest.fn();
		render(<StakeholderCountField value={undefined} onChange={onChange} questionIds={[]} isSaved={false} />);

		const input = screen.getByLabelText('Number of stakeholders') as HTMLInputElement;
		expect(input.value).toBe('');
		expect(screen.getByText('Optional')).toBeTruthy();

		fireEvent.change(input, { target: { value: '300' } });
		expect(onChange).toHaveBeenCalledWith(300);
	});

	it('reports undefined for 0, negatives and an emptied field', () => {
		const onChange = jest.fn();
		render(<StakeholderCountField value={300} onChange={onChange} questionIds={[]} isSaved={false} />);
		const input = screen.getByLabelText('Number of stakeholders');

		for (const raw of ['0', '-2', '']) {
			fireEvent.change(input, { target: { value: raw } });
			expect(onChange).toHaveBeenLastCalledWith(undefined);
		}
	});

	it('shows no stale note when nothing has ratings', async () => {
		funnel([], ['q1']);
		const { rerender } = render(
			<StakeholderCountField value={100} onChange={jest.fn()} surveyId="s1" questionIds={['q1']} isSaved />,
		);
		rerender(<StakeholderCountField value={200} onChange={jest.fn()} surveyId="s1" questionIds={['q1']} isSaved />);

		await waitFor(() => expect(mockAuthedFetch).toHaveBeenCalled());
		expect(screen.queryByText('survey.stakeholders.stale')).toBeNull();
	});

	it('after a change on a rated survey: shows the note and recalculates once per rated question', async () => {
		funnel(['q1', 'q3'], ['q2']);
		const props = { onChange: jest.fn(), surveyId: 's1', questionIds: ['q1', 'q2', 'q3'], isSaved: true };
		const { rerender } = render(<StakeholderCountField value={100} {...props} />);
		await waitFor(() => expect(mockAuthedFetch).toHaveBeenCalled());
		rerender(<StakeholderCountField value={200} {...props} />);

		fireEvent.click(await screen.findByText('survey.stakeholders.recalculate'));

		await waitFor(() => expect(mockCallable).toHaveBeenCalledTimes(2));
		// the server may run for 300 s; the SDK default of 70 s would show a false failure
		expect(mockCallableOptions).toHaveBeenCalledWith({ timeout: 310_000 });
		expect(mockCallable).toHaveBeenCalledWith({ statementId: 'q1', surveyId: 's1' });
		expect(mockCallable).toHaveBeenCalledWith({ statementId: 'q3', surveyId: 's1' });
		expect(await screen.findByText('survey.stakeholders.recalculated')).toBeTruthy();
		expect(screen.queryByText('survey.stakeholders.stale')).toBeNull();
	});

	it('waits for the save: the action is disabled until the edit is saved', async () => {
		funnel(['q1'], []);
		const props = { onChange: jest.fn(), surveyId: 's1', questionIds: ['q1'] };
		const { rerender } = render(<StakeholderCountField value={100} isSaved={false} {...props} />);
		await waitFor(() => expect(mockAuthedFetch).toHaveBeenCalled());
		rerender(<StakeholderCountField value={200} isSaved={false} {...props} />);

		const button = (await screen.findByText('survey.stakeholders.recalculate')) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
	});

	it('shows a plain error and keeps the note when the server refuses', async () => {
		funnel(['q1'], []);
		mockCallable.mockRejectedValue(new Error('permission-denied'));
		const props = { onChange: jest.fn(), surveyId: 's1', questionIds: ['q1'], isSaved: true };
		const { rerender } = render(<StakeholderCountField value={100} {...props} />);
		await waitFor(() => expect(mockAuthedFetch).toHaveBeenCalled());
		rerender(<StakeholderCountField value={200} {...props} />);

		fireEvent.click(await screen.findByText('survey.stakeholders.recalculate'));

		expect(await screen.findByText('survey.stakeholders.recalculateFailed')).toBeTruthy();
		expect(screen.getByText('survey.stakeholders.stale')).toBeTruthy();
	});

	it('says plainly when the number could not be set on some questions', () => {
		render(<StakeholderCountField value={100} onChange={jest.fn()} questionIds={[]} isSaved skippedCount={2} />);

		expect(screen.getByText('survey.stakeholders.skipped'.replace('{{count}}', '2'))).toBeTruthy();
	});
});
