/**
 * Tests for the suggestion card's picture
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import StatementImage from '../StatementImage';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, dir: 'ltr' }),
}));

jest.mock('@/view/components/uploadImage/UploadImage', () => ({
	__esModule: true,
	default: () => <div data-testid="upload-image" />,
}));

const STATEMENT = { statementId: 's1', statement: 'A shared street' } as Statement;

function renderImage(isAdmin: boolean) {
	const onRemove = jest.fn();
	render(
		<StatementImage
			statement={STATEMENT}
			image="https://example.com/street.jpg"
			setImage={jest.fn()}
			displayMode="above"
			onRemove={onRemove}
			isAdmin={isAdmin}
		/>,
	);

	return { onRemove };
}

describe('StatementImage', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	describe('for a participant', () => {
		it('shows the picture as a button, with no upload or remove control', () => {
			renderImage(false);

			expect(
				screen.getByRole('button', { name: 'Enlarge image: A shared street' }),
			).toBeInTheDocument();
			expect(screen.queryByTestId('upload-image')).not.toBeInTheDocument();
			expect(screen.queryByTitle('Remove Image')).not.toBeInTheDocument();
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		});

		it('opens the picture full screen when pressed, and closes it again', () => {
			renderImage(false);

			fireEvent.click(screen.getByRole('button', { name: 'Enlarge image: A shared street' }));

			const dialog = screen.getByRole('dialog', { name: 'A shared street' });
			expect(dialog.querySelector('img')).toHaveAttribute('src', 'https://example.com/street.jpg');

			fireEvent.click(screen.getByRole('button', { name: 'Close' }));
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		});

		it('returns to the card when zoomed out from the fitted size', () => {
			renderImage(false);

			fireEvent.click(screen.getByRole('button', { name: 'Enlarge image: A shared street' }));
			fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));

			expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		});
	});

	describe('for an admin', () => {
		it('keeps the upload drop zone and the remove button, and does not enlarge', () => {
			const { onRemove } = renderImage(true);

			expect(screen.getByTestId('upload-image')).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: /Enlarge image/ })).not.toBeInTheDocument();

			fireEvent.click(screen.getByTitle('Remove Image'));
			expect(onRemove).toHaveBeenCalledTimes(1);
		});
	});
});
