/**
 * @jest-environment jsdom
 */

import { render, fireEvent, screen, act } from '@testing-library/react';
import type { Statement } from '@freedi/shared-types';
import SwipeCard from '../SwipeCard';
import { SWIPE } from '@/constants/common';

jest.mock('../soundEffects', () => ({
  playClickSound: jest.fn(),
  playWhooshSound: jest.fn(),
}));

jest.mock('@/components/icons/RatingIcon', () => ({
  __esModule: true,
  default: ({ rating }: { rating: number }) => <span data-testid="rating-icon">{`icon-${rating}`}</span>,
}));

jest.mock('@freedi/shared-i18n/next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    tWithParams: (key: string) => key,
  }),
}));

const STATEMENT = { statementId: 's1', statement: 'Plant more trees' } as Statement;

function renderCard(props: Partial<React.ComponentProps<typeof SwipeCard>> = {}) {
  const onSwipe = jest.fn();
  const view = render(
    <SwipeCard statement={STATEMENT} onSwipe={onSwipe} totalCards={6} currentIndex={5} {...props} />
  );
  // Let the card finish its enter animation so its buttons are live
  act(() => {
    jest.advanceTimersByTime(SWIPE.CARD_ENTER_DURATION);
  });

  return { ...view, onSwipe };
}

describe('SwipeCard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('rating buttons on the card', () => {
    it('has none unless onRate is given', () => {
      const { container } = renderCard();

      expect(container.querySelector('.swipe-card__ratings')).toBeNull();
      expect(container.querySelector('.swipe-card')).not.toHaveClass('swipe-card--with-ratings');
    });

    it('shows one button per step of the five-step scale, inside the card', () => {
      const { container } = renderCard({ onRate: jest.fn() });

      const row = container.querySelector('.swipe-card .swipe-card__ratings');
      expect(row).not.toBeNull();
      expect(row?.querySelectorAll('.rating-button')).toHaveLength(5);
      expect(container.querySelector('.swipe-card')).toHaveClass('swipe-card--with-ratings');
    });

    it('shows three buttons on the three-point scale', () => {
      const { container } = renderCard({ onRate: jest.fn(), ratingMode: 'three-point' });

      expect(container.querySelectorAll('.swipe-card__ratings .rating-button')).toHaveLength(3);
      expect(container.querySelectorAll('.swipe-card__zone')).toHaveLength(3);
    });

    it('reports the pressed rating', () => {
      const onRate = jest.fn();
      renderCard({ onRate });

      fireEvent.click(screen.getByRole('button', { name: 'Strongly Agree' }));

      expect(onRate).toHaveBeenCalledWith(1);
    });

    it('does not start a swipe when a button is pressed', () => {
      const { container } = renderCard({ onRate: jest.fn() });

      fireEvent.mouseDown(screen.getByRole('button', { name: 'Agree' }), { clientX: 10, clientY: 10 });

      expect(container.querySelector('.swipe-card')).not.toHaveClass('swipe-card--dragging');
    });

    it('marks the earlier rating as selected', () => {
      renderCard({ onRate: jest.fn(), selectedRating: -0.5 });

      expect(screen.getByRole('button', { name: 'Disagree' })).toHaveClass('rating-button--selected');
      expect(screen.getByRole('button', { name: 'Agree' })).not.toHaveClass('rating-button--selected');
    });
  });

  it('leaves the swipe zones untinted', () => {
    const { container } = renderCard({ onRate: jest.fn() });

    const zones = [...container.querySelectorAll('.swipe-card__zone')];
    expect(zones).toHaveLength(5);
    for (const zone of zones) {
      expect(zone.className).not.toMatch(/swipe-card__zone--zone-\d/);
    }
  });
});
