'use client';

import React from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import ReactMarkdown from 'react-markdown';
import type { Survey } from '@freedi/shared-types';
import clsx from 'clsx';

export interface OpeningSlideProps {
  /** Survey with opening slide configuration */
  survey: Survey;
  /** Callback when user clicks "Get Started" */
  onContinue: () => void;
  /** Class name for custom styling */
  className?: string;
}

export const OpeningSlide: React.FC<OpeningSlideProps> = ({
  survey,
  onContinue,
  className,
}) => {
  const { t } = useTranslation();

  const hasLogos = survey.logos && survey.logos.length > 0;
  const hasContent = survey.openingSlideContent && survey.openingSlideContent.trim().length > 0;
  const isEmpty = !hasLogos && !hasContent;

  // Sort logos by order
  const sortedLogos = survey.logos
    ? [...survey.logos].sort((a, b) => a.order - b.order)
    : [];

  if (isEmpty) {
    return (
      <div className={clsx('opening-slide', className)}>
        <div className="opening-slide__empty">
          <h2>{survey.title}</h2>
          <p>{t('welcomeToSurvey')}</p>
          <div className="opening-slide__cta">
            <button
              type="button"
              onClick={onContinue}
              className="opening-slide__button"
            >
              {t('getStarted')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('opening-slide', className)}>
      {hasLogos && (
        <div className="opening-slide__header">
          <div className="opening-slide__logos">
            {sortedLogos.map((logo) => (
              <img
                key={logo.logoId}
                src={logo.publicUrl}
                alt={logo.altText}
                className="opening-slide__logo"
                style={{
                  ...(logo.width && { width: `${logo.width}px` }),
                  ...(logo.height && { height: `${logo.height}px` }),
                }}
              />
            ))}
          </div>
        </div>
      )}

      {hasContent && (
        <div className="opening-slide__content">
          <ReactMarkdown>{survey.openingSlideContent || ''}</ReactMarkdown>
        </div>
      )}

      <div className="opening-slide__cta">
        <button
          type="button"
          onClick={onContinue}
          className="opening-slide__button"
        >
          {t('getStarted')}
        </button>
      </div>
    </div>
  );
};
