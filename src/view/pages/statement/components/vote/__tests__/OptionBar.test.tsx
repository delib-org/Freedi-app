/**
 * OptionBar text treatment: the vertical layout shows an upright name that the
 * vote button is described by, and keeps the count readable on short bars.
 */
import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import { OptionBar } from '../components/optionBar/OptionBar';

const LONG_NAME = 'Build a long dedicated protected bike lane network across the entire downtown';

const makeOption = (statement: string): Statement =>
	({
		statementId: 'option-1',
		parentId: 'question-1',
		statement,
		order: 0,
		color: '#85d697',
	}) as unknown as Statement;

const renderBar = (selections: number, totalVotes: number, name = 'Free lunch') =>
	render(
		<OptionBar
			option={makeOption(name)}
			selections={selections}
			isSelected={false}
			castVote={jest.fn().mockResolvedValue(undefined)}
			totalVotes={totalVotes}
			order={0}
			setStatementInfo={jest.fn()}
			setShowInfo={jest.fn()}
			isVertical={true}
			optionsCount={2}
			screenWidth={390}
		/>,
	);

describe('OptionBar (vertical)', () => {
	it('describes the vote button with the option name', () => {
		renderBar(5, 10);
		const button = screen.getByRole('button', { name: 'Vote button' });
		const describedBy = button.getAttribute('aria-describedby');

		expect(describedBy).toBeTruthy();
		expect(document.getElementById(describedBy as string)?.textContent).toBe('Free lunch');
	});

	it('exposes the full name as a title when the visible text is shortened', () => {
		const { container } = renderBar(5, 10, LONG_NAME);
		const text = container.querySelector(`[title="${LONG_NAME}"]`);

		expect(text).not.toBeNull();
		expect(text?.textContent?.endsWith('...')).toBe(true);
	});

	it('shows the count on a tall bar and next to the percentage on a short one', () => {
		const tall = renderBar(8, 10);
		expect(tall.container.textContent).toContain('80%');
		tall.unmount();

		const short = renderBar(1, 20);
		expect(short.container.textContent).toContain('5% · 1');
	});
});
