/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import EvaluationFace from '../EvaluationFace';

// Mock RatingIcon (SVG component) to render testable text
jest.mock('../RatingIcon', () => ({
  __esModule: true,
  default: ({ rating }: { rating: number }) => <span data-testid="rating-icon">{`icon-${rating}`}</span>,
}));

describe('EvaluationFace', () => {
  it('renders the five-step thumbs by default', () => {
    render(<EvaluationFace value={1} />);

    expect(screen.getByTestId('rating-icon')).toHaveTextContent('icon-1');
  });

  it('renders the emoji in reactions mode', () => {
    const { container } = render(<EvaluationFace value={1} mode="reactions" />);

    expect(container).toHaveTextContent('❤️');
    expect(screen.queryByTestId('rating-icon')).not.toBeInTheDocument();
  });

  it('renders single thumbs for the ends of the three-point scale', () => {
    const { rerender } = render(<EvaluationFace value={1} mode="three-point" />);
    expect(screen.getByTestId('rating-icon')).toHaveTextContent('icon-0.5');

    rerender(<EvaluationFace value={-1} mode="three-point" />);
    expect(screen.getByTestId('rating-icon')).toHaveTextContent('icon--0.5');

    rerender(<EvaluationFace value={0} mode="three-point" />);
    expect(screen.getByTestId('rating-icon')).toHaveTextContent('icon-0');
  });
});
