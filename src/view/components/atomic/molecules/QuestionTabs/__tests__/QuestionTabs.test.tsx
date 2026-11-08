import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import QuestionTabs, { QuestionTabItem } from '../QuestionTabs';

const TABS: QuestionTabItem[] = [
	{ id: 'background', label: 'Background' },
	{ id: 'chat', label: 'Discussion', count: 4, unreadCount: 2 },
	{ id: 'options', label: 'Answers', count: 7 },
];

function Harness({ dir = 'ltr' as 'ltr' | 'rtl', onChange = jest.fn() }) {
	const [active, setActive] = useState('chat');

	return (
		<QuestionTabs
			tabs={TABS}
			activeId={active}
			dir={dir}
			ariaLabel="Question sections"
			unreadLabel={(n) => `${n} unread`}
			onChange={(id) => {
				onChange(id);
				setActive(id);
			}}
		/>
	);
}

describe('QuestionTabs', () => {
	beforeEach(() => {
		Element.prototype.scrollIntoView = jest.fn();
	});

	it('renders an accessible tablist with one selected, focusable tab', () => {
		render(<Harness />);
		expect(screen.getByRole('tablist', { name: 'Question sections' })).toBeInTheDocument();
		const tabs = screen.getAllByRole('tab');
		expect(tabs).toHaveLength(3);
		expect(screen.getByRole('tab', { name: /Discussion/ })).toHaveAttribute(
			'aria-selected',
			'true',
		);
		expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
		expect(screen.getByLabelText('2 unread')).toBeInTheDocument();
	});

	it('ArrowRight / ArrowLeft move and activate in LTR, wrapping at the ends', () => {
		const onChange = jest.fn();
		render(<Harness onChange={onChange} />);
		const discussion = screen.getByRole('tab', { name: /Discussion/ });
		fireEvent.keyDown(discussion, { key: 'ArrowRight' });
		expect(onChange).toHaveBeenLastCalledWith('options');
		expect(screen.getByRole('tab', { name: /Answers/ })).toHaveFocus();

		fireEvent.keyDown(screen.getByRole('tab', { name: /Answers/ }), { key: 'ArrowRight' });
		expect(onChange).toHaveBeenLastCalledWith('background');

		fireEvent.keyDown(screen.getByRole('tab', { name: /Background/ }), { key: 'ArrowLeft' });
		expect(onChange).toHaveBeenLastCalledWith('options');
	});

	it('mirrors the arrows in RTL', () => {
		const onChange = jest.fn();
		render(<Harness dir="rtl" onChange={onChange} />);
		fireEvent.keyDown(screen.getByRole('tab', { name: /Discussion/ }), { key: 'ArrowLeft' });
		expect(onChange).toHaveBeenLastCalledWith('options');
		fireEvent.keyDown(screen.getByRole('tab', { name: /Answers/ }), { key: 'ArrowRight' });
		expect(onChange).toHaveBeenLastCalledWith('chat');
	});

	it('Home and End jump to the first and last tab', () => {
		const onChange = jest.fn();
		render(<Harness onChange={onChange} />);
		fireEvent.keyDown(screen.getByRole('tab', { name: /Discussion/ }), { key: 'End' });
		expect(onChange).toHaveBeenLastCalledWith('options');
		fireEvent.keyDown(screen.getByRole('tab', { name: /Answers/ }), { key: 'Home' });
		expect(onChange).toHaveBeenLastCalledWith('background');
		expect(screen.getByRole('tab', { name: /Background/ })).toHaveFocus();
	});

	it('ignores other keys and activates on click', () => {
		const onChange = jest.fn();
		render(<Harness onChange={onChange} />);
		fireEvent.keyDown(screen.getByRole('tab', { name: /Discussion/ }), { key: 'a' });
		expect(onChange).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole('tab', { name: /Background/ }));
		expect(onChange).toHaveBeenCalledWith('background');
	});
});
