'use client';

/**
 * After the question is created: its cards' pictures upload here, a few at a
 * time, each with its own status and Retry. The question already exists, so
 * nothing on this screen can block the admin from finishing.
 */

import React from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import CardList, { CardListRow } from '@/components/admin/CardList';
import type { CardDraft, CardPictureProblem, CardUploadStatus } from '@/lib/utils/cardDrafts';

export interface CardUploadState {
  status: CardUploadStatus;
  problem?: CardPictureProblem;
}

export interface CardUploadPhaseProps {
  /** Only the drafts that carry a picture. */
  drafts: CardDraft[];
  states: Record<string, CardUploadState>;
  onRetry: (keys: string[]) => void;
}

export default function CardUploadPhase({ drafts, states, onRetry }: CardUploadPhaseProps) {
  const { t, tWithParams } = useTranslation();

  const total = drafts.length;
  const done = drafts.filter((d) => states[d.key]?.status === 'done').length;
  const failedKeys = drafts.filter((d) => states[d.key]?.status === 'failed').map((d) => d.key);
  const retryableKeys = failedKeys.filter((key) => states[key]?.problem === 'network');
  const inFlight = drafts.some((d) => ['queued', 'uploading'].includes(states[d.key]?.status ?? ''));

  const rows: CardListRow[] = drafts.map((draft) => ({
    key: draft.key,
    text: draft.text,
    imageUrl: draft.previewUrl,
    alt: draft.alt,
    status: states[draft.key]?.status ?? 'queued',
    problem: states[draft.key]?.problem ?? null,
  }));

  return (
    <div className="card-list__upload-phase">
      <p className="card-list__created">
        <span aria-hidden="true">✓ </span>
        {t('Question created')}
      </p>
      <p className="card-list__progress-label" aria-live="polite">
        {tWithParams('Uploading pictures {{done}} of {{total}}', { done, total })}
      </p>
      <progress className="card-list__progress" max={total} value={done} aria-label={t('Uploading pictures')} />

      <CardList
        mode="saved"
        rows={rows}
        disabled
        readOnly
        onAttach={() => undefined}
        onAltChange={() => undefined}
        onRemovePicture={() => undefined}
        onRetry={(key) => onRetry([key])}
      />

      {!inFlight && failedKeys.length > 0 && (
        <p className="card-list__summary">
          {tWithParams(
            '{{count}} cards have no picture yet. You can add them any time from the survey editor.',
            { count: failedKeys.length }
          )}
          {retryableKeys.length >= 2 && (
            <button type="button" className="card-list__link-button" onClick={() => onRetry(retryableKeys)}>
              {t('Retry all failed')}
            </button>
          )}
        </p>
      )}
    </div>
  );
}
