/**
 * @jest-environment jsdom
 */

import { render, fireEvent, act } from '@testing-library/react';
import type { Statement } from '@freedi/shared-types';
import SwipeCard from '../SwipeCard';
import CardPreview from '../../CardPreview/CardPreview';
import EvaluationButtons from '@/components/question/EvaluationButtons';
import { SWIPE } from '@/constants/common';

let mockDir: 'ltr' | 'rtl' = 'rtl';

jest.mock('../soundEffects', () => ({
  playClickSound: jest.fn(),
  playWhooshSound: jest.fn(),
}));

jest.mock('@freedi/shared-i18n/next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    tWithParams: (key: string) => key,
    dir: mockDir,
  }),
}));

const STATEMENT = { statementId: 's1', statement: 'Plant more trees' } as Statement;
const CARD_WIDTH = 500;
const FIVE_STEP_LEFT_TO_RIGHT_RTL = ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];

function renderCard() {
  const onSwipe = jest.fn();
  const view = render(
    <SwipeCard statement={STATEMENT} onSwipe={onSwipe} onRate={jest.fn()} totalCards={6} currentIndex={5} />
  );
  const card = view.container.querySelector('.swipe-card') as HTMLDivElement;

  card.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: CARD_WIDTH, bottom: 300, width: CARD_WIDTH, height: 300, x: 0, y: 0 }) as DOMRect;
  act(() => {
    jest.advanceTimersByTime(SWIPE.CARD_ENTER_DURATION);
  });

  return { ...view, card, onSwipe };
}

/** Grab the card at `fromX` and drag it to `toX`, then let the throw finish. */
function drag(card: HTMLElement, fromX: number, toX: number): void {
  fireEvent.mouseDown(card, { clientX: fromX, clientY: 100 });
  fireEvent.mouseMove(card, { clientX: toX, clientY: 100 });
  act(() => {
    jest.advanceTimersByTime(50);
  });
  fireEvent.mouseUp(card);
  act(() => {
    jest.advanceTimersByTime(SWIPE.SWIPE_DURATION);
  });
}

function ratingLabelsOnCard(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.swipe-card__ratings .rating-button')].map(
    (button) => button.getAttribute('aria-label') ?? ''
  );
}

describe('evaluation direction follows the language', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('right-to-left (Hebrew)', () => {
    beforeEach(() => {
      mockDir = 'rtl';
    });

    it('lays the card buttons out disagree on the left, agree on the right', () => {
      const { container } = renderCard();

      expect(ratingLabelsOnCard(container)).toEqual(FIVE_STEP_LEFT_TO_RIGHT_RTL);
    });

    it('saves -1 for a leftward drag from the leftmost zone', () => {
      const { card, onSwipe } = renderCard();

      drag(card, 50, -100);

      expect(onSwipe).toHaveBeenCalledWith(-1);
    });

    it('saves +1 for a rightward drag from the rightmost zone', () => {
      const { card, onSwipe } = renderCard();

      drag(card, 450, 600);

      expect(onSwipe).toHaveBeenCalledWith(1);
    });

    it('ignores a drag toward the middle', () => {
      const { card, onSwipe } = renderCard();

      drag(card, 50, 200);

      expect(onSwipe).not.toHaveBeenCalled();
    });

    it('lists the button row disagree first, left to right', () => {
      const { container } = render(<EvaluationButtons onEvaluate={jest.fn()} />);
      const labels = [...container.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));

      expect(labels).toEqual(FIVE_STEP_LEFT_TO_RIGHT_RTL);
    });
  });

  describe('left-to-right (English)', () => {
    beforeEach(() => {
      mockDir = 'ltr';
    });

    it('lays the card buttons out agree on the left, disagree on the right', () => {
      const { container } = renderCard();

      expect(ratingLabelsOnCard(container)).toEqual([...FIVE_STEP_LEFT_TO_RIGHT_RTL].reverse());
    });

    it('saves +1 for a leftward drag from the leftmost zone', () => {
      const { card, onSwipe } = renderCard();

      drag(card, 50, -100);

      expect(onSwipe).toHaveBeenCalledWith(1);
    });

    it('saves -1 for a rightward drag from the rightmost zone', () => {
      const { card, onSwipe } = renderCard();

      drag(card, 450, 600);

      expect(onSwipe).toHaveBeenCalledWith(-1);
    });

    it('ignores a drag toward the middle', () => {
      const { card, onSwipe } = renderCard();

      drag(card, 50, 200);

      expect(onSwipe).not.toHaveBeenCalled();
    });

    it('still saves 0 for an upward drag from the centre zone', () => {
      const { card, onSwipe } = renderCard();

      fireEvent.mouseDown(card, { clientX: CARD_WIDTH / 2, clientY: 200 });
      fireEvent.mouseMove(card, { clientX: CARD_WIDTH / 2, clientY: 0 });
      act(() => {
        jest.advanceTimersByTime(50);
      });
      fireEvent.mouseUp(card);
      act(() => {
        jest.advanceTimersByTime(SWIPE.SWIPE_DURATION);
      });

      expect(onSwipe).toHaveBeenCalledWith(0);
    });

    it('mirrors the three-point scale too', () => {
      const { container } = render(
        <SwipeCard
          statement={STATEMENT}
          onSwipe={jest.fn()}
          onRate={jest.fn()}
          ratingMode="three-point"
          totalCards={6}
          currentIndex={5}
        />
      );

      expect(ratingLabelsOnCard(container)).toEqual(['Agree', 'Neutral', 'Disagree']);
    });

    it('lists the stack button row agree first, and keeps each button its own value and side', () => {
      const onEvaluate = jest.fn();
      const { container } = render(<EvaluationButtons onEvaluate={onEvaluate} />);
      const buttons = [...container.querySelectorAll('button')];

      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(
        [...FIVE_STEP_LEFT_TO_RIGHT_RTL].reverse()
      );

      fireEvent.click(buttons[0]);
      expect(onEvaluate).toHaveBeenLastCalledWith(1, 'left');

      fireEvent.click(buttons[4]);
      expect(onEvaluate).toHaveBeenLastCalledWith(-1, 'right');
    });

    it('orders the preview card like the live card', () => {
      const { container } = render(<CardPreview statement={STATEMENT} currentIndex={0} totalCards={3} />);
      const labels = [...container.querySelectorAll('.swipe-card__ratings .rating-button')].map((b) =>
        b.getAttribute('aria-label')
      );

      expect(labels).toEqual([...FIVE_STEP_LEFT_TO_RIGHT_RTL].reverse());
    });
  });
});
