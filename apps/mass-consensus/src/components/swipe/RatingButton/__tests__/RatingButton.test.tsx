/**
 * RatingButton Component Tests
 */

import { render, fireEvent, screen } from '@testing-library/react';
import RatingButton from '../RatingButton';
import { RATING } from '@/constants/common';

// Mock sound effects
jest.mock('../../SwipeCard/soundEffects', () => ({
  playClickSound: jest.fn(),
}));

// Mock i18n
jest.mock('@freedi/shared-i18n/react', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('RatingButton', () => {
  it('should render button with emoji and label', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.LIKE} onClick={onClick} />);

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('👍')).toBeInTheDocument();
    expect(screen.getByText('Like')).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.LIKE} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledWith(RATING.LIKE);
  });

  it('should not call onClick when disabled', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.LIKE} onClick={onClick} disabled />);

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('should apply disabled class when disabled', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.LIKE} onClick={onClick} disabled />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('rating-button--disabled');
    expect(button).toBeDisabled();
  });

  it('should apply correct variant class', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.LOVE} onClick={onClick} />);

    expect(screen.getByRole('button')).toHaveClass('rating-button--love');
  });

  it('should apply size class', () => {
    const onClick = jest.fn();
    render(<RatingButton rating={RATING.LIKE} onClick={onClick} size="large" />);

    expect(screen.getByRole('button')).toHaveClass('rating-button--large');
  });

  it('should render all rating variants', () => {
    const ratings = [
      { value: RATING.LOVE, emoji: '❤️' },
      { value: RATING.LIKE, emoji: '👍' },
      { value: RATING.NEUTRAL, emoji: '😐' },
      { value: RATING.DISLIKE, emoji: '👎' },
      { value: RATING.HATE, emoji: '❌' },
    ];

    ratings.forEach(({ value, emoji }) => {
      const { container } = render(
        <RatingButton rating={value} onClick={jest.fn()} />
      );
      expect(container.textContent).toContain(emoji);
    });
  });
});
