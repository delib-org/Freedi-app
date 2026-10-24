import { fireEvent, render, screen } from '@testing-library/react';
import OtherIdeasFooter from '../OtherIdeasFooter';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

describe('OtherIdeasFooter', () => {
	it('renders nothing when no idea is left out', () => {
		const { container } = render(<OtherIdeasFooter count={0} onShowAll={jest.fn()} />);
		expect(container).toBeEmptyDOMElement();
	});

	it('states the count and switches to All when pressed', () => {
		const onShowAll = jest.fn();
		render(<OtherIdeasFooter count={3} onShowAll={onShowAll} />);

		fireEvent.click(screen.getByRole('button', { name: '3 other ideas are not in a theme' }));
		expect(onShowAll).toHaveBeenCalledTimes(1);
	});
});
