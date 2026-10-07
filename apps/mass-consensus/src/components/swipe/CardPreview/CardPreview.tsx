/**
 * CardPreview — the swipe card as participants see it, with no gestures.
 *
 * Same DOM and classes as SwipeCard (picture, number badge, text, rating
 * buttons), so the preview cannot drift from the real card; `--preview` only
 * removes the cursor, the gesture hooks and the viewport-relative height.
 */

import React from 'react';
import clsx from 'clsx';
import { Statement, getEvaluationScale } from '@freedi/shared-types';
import type { EvaluationScaleKey } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import RatingButton from '@/components/swipe/RatingButton';
import InlineMarkdown from '@/components/shared/InlineMarkdown';
import { getParagraphsText } from '@/lib/utils/paragraphUtils';

export interface CardPreviewProps {
  statement: Statement;
  currentIndex: number;
  totalCards: number;
  ratingMode?: EvaluationScaleKey;
  /** A local picture not yet saved (object URL) shown instead of the saved one. */
  imageOverride?: string | null;
}

export default function CardPreview({ statement, currentIndex, totalCards, ratingMode, imageOverride }: CardPreviewProps) {
  const { tWithParams } = useTranslation();
  const imageUrl = imageOverride ?? statement.imagesURL?.main;
  const bodyText = (getParagraphsText(statement.paragraphs) || statement.description || '').trim();
  const body = bodyText !== statement.statement?.trim() ? bodyText : '';
  const scale = getEvaluationScale(ratingMode);

  return (
    <div
      className={clsx('swipe-card', 'swipe-card--preview', 'swipe-card--with-ratings', {
        'swipe-card--with-image': Boolean(imageUrl),
      })}
      role="img"
      aria-label={`${tWithParams('Proposal {{index}} of {{total}}', { index: currentIndex + 1, total: totalCards })}: ${statement.statement}`}
    >
      <div className="swipe-card__number">#{currentIndex + 1}</div>

      <div className="swipe-card__content-wrapper">
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- storage URLs are not in next/image's allow-list
          <img className="swipe-card__image" src={imageUrl} alt={statement.imagesURL?.alt ?? ''} draggable={false} />
        )}
        <div className="swipe-card__content">
          {statement.statement}
          {body && (
            <p className="swipe-card__body">
              <InlineMarkdown text={body} />
            </p>
          )}
        </div>
      </div>

      <div className="swipe-card__ratings" aria-hidden="true">
        {scale.map((entry) => (
          <div key={entry.value} className="swipe-card__rating">
            {/* Looks live (not greyed); `--preview` turns pointer events off */}
            <RatingButton rating={entry.value} ratingMode={ratingMode} onClick={() => undefined} />
          </div>
        ))}
      </div>
    </div>
  );
}
