import React from 'react';
import { render, screen } from '@testing-library/react';
import Collapse from '../Collapse';

describe('Collapse', () => {
	it('always renders its wrapper, but not the children, while closed', () => {
		const { container } = render(
			<Collapse id="body" isOpen={false}>
				<p>Body</p>
			</Collapse>,
		);
		const wrapper = container.querySelector('#body');

		expect(wrapper).toHaveClass('collapse');
		expect(wrapper).toHaveAttribute('hidden');
		expect(screen.queryByText('Body')).toBeNull();
	});

	it('renders the children inside collapse__inner when open', () => {
		const { container } = render(
			<Collapse id="body" isOpen>
				<p>Body</p>
			</Collapse>,
		);

		expect(container.querySelector('#body')).toHaveClass('collapse--open');
		expect(container.querySelector('.collapse__inner')).toContainElement(screen.getByText('Body'));
	});

	it('opens and closes at once when no CSS transition applies (jsdom)', () => {
		const { rerender, container } = render(
			<Collapse id="body" isOpen={false}>
				<p>Body</p>
			</Collapse>,
		);

		rerender(
			<Collapse id="body" isOpen>
				<p>Body</p>
			</Collapse>,
		);
		expect(screen.getByText('Body')).toBeTruthy();
		expect(container.querySelector('#body')).not.toHaveClass('collapse--moving');

		rerender(
			<Collapse id="body" isOpen={false}>
				<p>Body</p>
			</Collapse>,
		);
		expect(screen.queryByText('Body')).toBeNull();
	});
});
