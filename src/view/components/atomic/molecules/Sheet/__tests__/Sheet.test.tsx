import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Sheet from '../Sheet';

describe('Sheet', () => {
	afterEach(() => {
		document.body.classList.remove('modal-open');
	});

	it('renders nothing while closed', () => {
		render(
			<Sheet isOpen={false} onClose={() => {}} title="Your answer">
				<p>body</p>
			</Sheet>,
		);
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('opens as a labelled modal dialog with body scroll locked', () => {
		render(
			<Sheet isOpen onClose={() => {}} title="Your answer" footer={<button>Add</button>}>
				<p>body</p>
			</Sheet>,
		);
		const dialog = screen.getByRole('dialog');
		expect(dialog).toHaveAttribute('aria-modal', 'true');
		expect(dialog).toHaveAccessibleName('Your answer');
		expect(screen.getByText('body')).toBeInTheDocument();
		expect(document.querySelector('.sheet__footer')).toHaveTextContent('Add');
		expect(document.body).toHaveClass('modal-open');
	});

	it('closes on Escape, backdrop click and the close button', () => {
		const onClose = jest.fn();
		render(
			<Sheet isOpen onClose={onClose} title="Sheet">
				<p>body</p>
			</Sheet>,
		);
		fireEvent.keyDown(document, { key: 'Escape' });
		fireEvent.click(screen.getByTestId('sheet-backdrop'));
		fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(onClose).toHaveBeenCalledTimes(3);
	});

	it('does not close on backdrop when closeOnBackdrop is false', () => {
		const onClose = jest.fn();
		render(
			<Sheet isOpen onClose={onClose} title="Sheet" closeOnBackdrop={false}>
				<p>body</p>
			</Sheet>,
		);
		fireEvent.click(screen.getByTestId('sheet-backdrop'));
		expect(onClose).not.toHaveBeenCalled();
	});

	it('moves focus into the panel and returns it to the opener on close', () => {
		const Harness: React.FC = () => {
			const [open, setOpen] = useState(false);

			return (
				<>
					<button onClick={() => setOpen(true)}>open</button>
					<Sheet isOpen={open} onClose={() => setOpen(false)} title="Sheet">
						<button>inside</button>
					</Sheet>
				</>
			);
		};
		render(<Harness />);
		const opener = screen.getByRole('button', { name: 'open' });
		opener.focus();
		fireEvent.click(opener);
		expect(screen.getByRole('dialog')).toHaveFocus();
		fireEvent.keyDown(document, { key: 'Escape' });
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		expect(opener).toHaveFocus();
		expect(document.body).not.toHaveClass('modal-open');
	});

	it('keeps Tab inside the panel', () => {
		render(
			<Sheet isOpen onClose={() => {}} title="Sheet">
				<button>first</button>
				<button>last</button>
			</Sheet>,
		);
		screen.getByRole('button', { name: 'last' }).focus();
		fireEvent.keyDown(document, { key: 'Tab' });
		// The close button is the first focusable element in the panel.
		expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
		fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
		expect(screen.getByRole('button', { name: 'last' })).toHaveFocus();
	});
});

it('Escape only closes the top dialog and keeps the outer scroll lock', () => {
	function Nested() {
		const [outer, setOuter] = useState(true);
		const [inner, setInner] = useState(false);

		return (
			<>
				<Sheet isOpen={outer} title="Outer" onClose={() => setOuter(false)}>
					<button onClick={() => setInner(true)}>Refine</button>
				</Sheet>
				<Sheet isOpen={inner} title="Inner" onClose={() => setInner(false)}>
					Refinement
				</Sheet>
			</>
		);
	}
	render(<Nested />);
	fireEvent.click(screen.getByText('Refine'));
	expect(screen.getAllByRole('dialog')).toHaveLength(2);
	fireEvent.keyDown(document, { key: 'Escape' });
	expect(screen.getByRole('dialog')).toHaveAccessibleName('Outer');
	expect(document.body).toHaveClass('modal-open');
	fireEvent.keyDown(document, { key: 'Escape' });
	expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	expect(document.body).not.toHaveClass('modal-open');
});
