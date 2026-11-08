'use client';

/**
 * ParticipantPreview — a phone frame with the real swipe card, one option at
 * a time, and a strip that says whether participants get an "Add an answer"
 * button. Follows the editor live: text edits, pictures, the switches.
 */

import React, { useEffect, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import type { EvaluationScaleKey } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import CardPreview from '@/components/swipe/CardPreview';

export interface PreviewCard {
  statement: Statement;
  imageOverride: string | null;
}

export interface ParticipantPreviewProps {
  cards: PreviewCard[];
  /** Whether participants of this question can add their own options. */
  canAdd: boolean;
  ratingMode?: EvaluationScaleKey;
  /** The real page, when the survey exists. */
  liveUrl?: string;
}

export default function ParticipantPreview({ cards, canAdd, ratingMode, liveUrl }: ParticipantPreviewProps) {
  const { t, tWithParams } = useTranslation();
  const [index, setIndex] = useState(0);
  const total = cards.length;
  const current = cards[Math.min(index, Math.max(total - 1, 0))];

  // Stay on a card that still exists when one is deleted
  useEffect(() => {
    if (index > 0 && index >= total) setIndex(Math.max(total - 1, 0));
  }, [index, total]);

  return (
    <aside className="participant-preview" aria-label={t('Preview')}>
      <h4 className="participant-preview__title">{t('Preview')}</h4>

      <div className="participant-preview__phone">
        <div className="participant-preview__screen">
          {current ? (
            <CardPreview
              statement={current.statement}
              imageOverride={current.imageOverride}
              currentIndex={index}
              totalCards={total}
              ratingMode={ratingMode}
            />
          ) : (
            <p className="participant-preview__empty">{t('No options yet — the first one you add appears here.')}</p>
          )}

          <div className={`participant-preview__footer ${canAdd ? '' : 'participant-preview__footer--none'}`}>
            {canAdd ? (
              <span className="participant-preview__add-button" aria-hidden="true">
                + {t('Add an answer')}
              </span>
            ) : (
              <span className="participant-preview__no-add">{t("No add button — participants only rate")}</span>
            )}
          </div>
        </div>
      </div>

      {total > 1 && (
        <div className="participant-preview__nav">
          <button
            type="button"
            className="participant-preview__nav-button"
            onClick={() => setIndex((i) => (i - 1 + total) % total)}
            aria-label={t('Previous option')}
          >
            ‹
          </button>
          <span className="participant-preview__counter">{tWithParams('{{n}} of {{total}}', { n: index + 1, total })}</span>
          <button
            type="button"
            className="participant-preview__nav-button"
            onClick={() => setIndex((i) => (i + 1) % total)}
            aria-label={t('Next option')}
          >
            ›
          </button>
        </div>
      )}

      <p className="participant-preview__caption">
        {canAdd
          ? t('Participants see these options and can add their own.')
          : t("Participants see these options and can't add their own.")}
      </p>

      {liveUrl && (
        <a className="participant-preview__link" href={liveUrl} target="_blank" rel="noopener noreferrer">
          {t('Open the real question')} ↗
        </a>
      )}
    </aside>
  );
}
