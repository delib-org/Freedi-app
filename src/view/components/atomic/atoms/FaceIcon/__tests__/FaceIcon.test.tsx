import React from 'react';
import { render, screen } from '@testing-library/react';
import FaceIcon, { FACE_MOUTHS } from '../FaceIcon';
import type { FaceKind } from '@/types/evaluation';

const FACES: FaceKind[] = ['strong-dislike', 'dislike', 'neutral', 'like', 'strong-like'];

describe('FaceIcon', () => {
	it.each(FACES)('draws the %s face with the shared head and eyes', (face) => {
		const { container } = render(<FaceIcon face={face} />);
		const svg = container.querySelector('svg');

		expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
		expect(svg).toHaveAttribute('width', '26');
		expect(svg).toHaveAttribute('stroke', 'currentColor');
		expect(container.querySelectorAll('circle')).toHaveLength(3);
		expect(container.querySelector('path')).toHaveAttribute('d', FACE_MOUTHS[face].d);
	});

	it('fills only the strong-like mouth', () => {
		FACES.forEach((face) => {
			const { container, unmount } = render(<FaceIcon face={face} />);
			const expected = face === 'strong-like' ? 'currentColor' : 'none';
			expect(container.querySelector('path')).toHaveAttribute('fill', expected);
			unmount();
		});
	});

	it('is decorative by default and named when a title is given', () => {
		const { container, rerender } = render(<FaceIcon face="like" />);
		expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

		rerender(<FaceIcon face="like" title="Like" size={32} />);
		const img = screen.getByRole('img', { name: 'Like' });
		expect(img).toHaveAttribute('width', '32');
	});
});
