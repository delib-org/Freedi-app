import { render, screen } from '@testing-library/react';
import StageProgress from '../StageProgress';

const stages = ['One', 'Two', 'Three', 'Four'];

describe('StageProgress', () => {
	it('marks the active stage', () => {
		render(<StageProgress stages={stages} activeIndex={1} ariaLabel="Stage" />);
		expect(screen.getByText('Two').closest('li')).toHaveAttribute('aria-current', 'step');
	});

	it('renders no caption unless one is given', () => {
		render(<StageProgress stages={stages} activeIndex={0} ariaLabel="Stage" />);
		expect(screen.queryByTestId('stage-progress-caption')).not.toBeInTheDocument();
	});

	it('renders the caption under the bar, outside the list', () => {
		render(
			<StageProgress stages={stages} activeIndex={0} ariaLabel="Stage" caption="What to do now" />,
		);
		const caption = screen.getByTestId('stage-progress-caption');
		expect(caption).toHaveTextContent('What to do now');
		expect(caption.closest('ol')).toBeNull();
	});
});
