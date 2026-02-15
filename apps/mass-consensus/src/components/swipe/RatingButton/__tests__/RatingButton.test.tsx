/**
 * @jest-environment jsdom
 */

/**
 * RatingButton Component Tests
 *
 * Tests the 5-level agreement scale (-1 to +1)
 */

import { render, fireEvent, screen } from '@testing-library/react';
import RatingButton from '../RatingButton';
import { RATING } from '@/constants/common';

// Mock sound effects
jest.mock('../../SwipeCard/soundEffects', () => ({
  playClickSound: jest.fn(),
}));

// Mock RatingIcon (SVG component) to render testable text
jest.mock('@/components/icons/RatingIcon', () => ({
  __esModule: true,
  default: ({ rating }: { rating: number }) => <span data-testid="rating-icon">{`icon-${rating}`}</span>,
}));

// Mock i18n
jest.mock('@freedi/shared-i18n/next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('RatingButton', () => {
  it('should render button with icon', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.AGREE} onClick={onClick} />);

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByTestId('rating-icon')).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.AGREE} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledWith(RATING.AGREE);
  });

  it('should not call onClick when disabled', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.AGREE} onClick={onClick} disabled />);

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('should apply disabled class when disabled', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.AGREE} onClick={onClick} disabled />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('rating-button--disabled');
    expect(button).toBeDisabled();
  });

  it('should apply correct variant class for strongly agree', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.STRONGLY_AGREE} onClick={onClick} />);

    expect(screen.getByRole('button')).toHaveClass('rating-button--strongly-agree');
  });

  it('should apply correct variant class for agree', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.AGREE} onClick={onClick} />);

    expect(screen.getByRole('button')).toHaveClass('rating-button--agree');
  });

  it('should apply correct variant class for neutral', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.NEUTRAL} onClick={onClick} />);

    expect(screen.getByRole('button')).toHaveClass('rating-button--neutral');
  });

  it('should apply correct variant class for disagree', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.DISAGREE} onClick={onClick} />);

    expect(screen.getByRole('button')).toHaveClass('rating-button--disagree');
  });

  it('should apply correct variant class for strongly disagree', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.STRONGLY_DISAGREE} onClick={onClick} />);

    expect(screen.getByRole('button')).toHaveClass('rating-button--strongly-disagree');
  });

  it('should apply size class', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.AGREE} onClick={onClick} size="large" />);

    expect(screen.getByRole('button')).toHaveClass('rating-button--large');
  });

  it('should have accessible label', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.STRONGLY_AGREE} onClick={onClick} />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Strongly Agree');
  });

  it('should apply selected class when isSelected is true', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.AGREE} onClick={onClick} isSelected />);

    expect(screen.getByRole('button')).toHaveClass('rating-button--selected');
  });

  it('should not apply selected class when isSelected is false', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.AGREE} onClick={onClick} />);

    expect(screen.getByRole('button')).not.toHaveClass('rating-button--selected');
  });

  it('should render all rating variants with icons', () => {
    const ratings = [
      RATING.STRONGLY_AGREE,
      RATING.AGREE,
      RATING.NEUTRAL,
      RATING.DISAGREE,
      RATING.STRONGLY_DISAGREE,
    ];

    ratings.forEach((value) => {
      const { container } = render(
        <RatingButton rating={value} onClick={jest.fn()} />
      );
      expect(container.textContent).toContain(`icon-${value}`);
    });
  });

  it('should have correct rating values', () => {
    // Verify the rating scale is -1 to +1 with 0.5 increments
    expect(RATING.STRONGLY_DISAGREE).toBe(-1);
    expect(RATING.DISAGREE).toBe(-0.5);
    expect(RATING.NEUTRAL).toBe(0);
    expect(RATING.AGREE).toBe(0.5);
    expect(RATING.STRONGLY_AGREE).toBe(1);
  });
});
