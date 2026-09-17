'use client';

/**
 * QuestionCardsPanel — "Cards (n)" inside a question row of the survey
 * editor: every card of the question with its picture. Pictures and their
 * descriptions save the moment they change; there is nothing to "Save" here.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import CardList, { CardListRow } from '@/components/admin/CardList';
import { fetchQuestionCards } from '@/controllers/questionCardsController';
import { deleteCardImage, uploadCardImage } from '@/controllers/cardImageController';
import { problemFromUploadError } from '@/controllers/cardUploadQueue';
import { NotAuthenticatedError } from '@/lib/api/authedFetch';
import { checkCardImageFile } from '@/lib/utils/cardImage';
import type { CardPictureProblem, CardUploadStatus } from '@/lib/utils/cardDrafts';
import { logError } from '@/lib/utils/errorHandling';

const SAVED_BADGE_MS = 2000;

export interface QuestionCardsPanelProps {
  questionId: string;
  surveyId?: string;
  /** Each new value opens the panel and brings it into view. */
  focusRequest?: number;
}

interface RowState {
  status: CardUploadStatus;
  problem: CardPictureProblem | null;
  /** Local preview while uploading, and the file to send again on Retry. */
  pendingFile?: File;
  pendingUrl?: string;
  saved?: boolean;
}

const IDLE_ROW: RowState = { status: 'idle', problem: null };

export default function QuestionCardsPanel({ questionId, surveyId, focusRequest }: QuestionCardsPanelProps) {
  const { t, tWithParams } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [cards, setCards] = useState<Statement[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});
  const sectionRef = useRef<HTMLElement>(null);
  const statesRef = useRef(states);
  statesRef.current = states;

  // Release local previews on unmount
  useEffect(
    () => () => Object.values(statesRef.current).forEach((s) => s.pendingUrl && URL.revokeObjectURL(s.pendingUrl)),
    []
  );

  useEffect(() => {
    if (!focusRequest) return;
    setIsOpen(true);
    // After the row has expanded and the panel has rendered
    const timer = setTimeout(() => {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      sectionRef.current?.querySelector<HTMLButtonElement>('.question-cards-panel__header')?.focus({ preventScroll: true });
    }, 50);

    return () => clearTimeout(timer);
  }, [focusRequest]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      setCards(await fetchQuestionCards(questionId, surveyId));
    } catch (error) {
      if (!(error instanceof NotAuthenticatedError)) {
        logError(error, { operation: 'QuestionCardsPanel.load', questionId, metadata: { surveyId } });
      }
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [questionId, surveyId]);

  useEffect(() => {
    if (isOpen && cards === null && !isLoading && !loadError) void load();
  }, [isOpen, cards, isLoading, loadError, load]);

  const setRow = (key: string, change: Partial<RowState>) =>
    setStates((prev) => ({
      ...prev,
      [key]: { ...IDLE_ROW, ...prev[key], ...change },
    }));

  const replaceCard = (key: string, imagesURL: Statement['imagesURL']) =>
    setCards((prev) => prev?.map((card) => (card.statementId === key ? { ...card, imagesURL } : card)) ?? prev);

  const releasePreview = (key: string) => {
    const url = statesRef.current[key]?.pendingUrl;
    if (url) URL.revokeObjectURL(url);
  };

  const flashSaved = (key: string) => {
    setRow(key, { saved: true });
    setTimeout(() => setRow(key, { saved: false }), SAVED_BADGE_MS);
  };

  const upload = async (key: string, file: File) => {
    const card = cards?.find((c) => c.statementId === key);
    if (!card) return;

    const problem = checkCardImageFile(file);
    if (problem) {
      setRow(key, { status: 'idle', problem });

      return;
    }

    releasePreview(key);
    setRow(key, { status: 'uploading', problem: null, pendingFile: file, pendingUrl: URL.createObjectURL(file) });

    try {
      const alt = altDrafts[key] ?? card.imagesURL?.alt ?? '';
      const imagesURL = await uploadCardImage({ statementId: key, file, alt, surveyId });
      replaceCard(key, imagesURL);
      releasePreview(key);
      setRow(key, { status: 'idle', pendingFile: undefined, pendingUrl: undefined });
      flashSaved(key);
    } catch (error) {
      logError(error, { operation: 'QuestionCardsPanel.upload', statementId: key, questionId });
      // Keep the chosen file for Retry, but show the picture the card really has
      releasePreview(key);
      setRow(key, { status: 'failed', problem: problemFromUploadError(error), pendingUrl: undefined });
    }
  };

  const commitAlt = async (key: string) => {
    const card = cards?.find((c) => c.statementId === key);
    const alt = altDrafts[key];
    if (!card?.imagesURL?.main || alt === undefined || alt.trim() === (card.imagesURL.alt ?? '')) return;

    try {
      const imagesURL = await uploadCardImage({ statementId: key, alt, surveyId });
      replaceCard(key, imagesURL);
      flashSaved(key);
    } catch (error) {
      logError(error, { operation: 'QuestionCardsPanel.commitAlt', statementId: key, questionId });
      setRow(key, { problem: 'network' });
    }
  };

  const removePicture = async (key: string) => {
    setRow(key, { status: 'uploading', problem: null });
    try {
      const imagesURL = await deleteCardImage(key, surveyId);
      replaceCard(key, imagesURL);
      setAltDrafts((prev) => ({ ...prev, [key]: '' }));
      setRow(key, { status: 'idle' });
    } catch (error) {
      logError(error, { operation: 'QuestionCardsPanel.removePicture', statementId: key, questionId });
      setRow(key, { status: 'failed', problem: 'network' });
    }
  };

  const rows: CardListRow[] = (cards ?? []).map((card) => {
    const state = states[card.statementId];

    return {
      key: card.statementId,
      text: card.statement,
      imageUrl: state?.pendingUrl ?? card.imagesURL?.main ?? null,
      alt: altDrafts[card.statementId] ?? card.imagesURL?.alt ?? '',
      status: state?.status ?? 'idle',
      problem: state?.problem ?? null,
      saved: state?.saved,
    };
  });

  const headerLabel = cards === null ? t('Cards') : tWithParams('Cards ({{count}})', { count: cards.length });

  return (
    <section className="question-cards-panel" ref={sectionRef}>
      <button
        type="button"
        className="question-cards-panel__header"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
      >
        <span aria-hidden="true">{isOpen ? '▼' : '▶'}</span> {headerLabel}
      </button>

      {isOpen && (
        <div className="question-cards-panel__body">
          {isLoading && <p className="question-cards-panel__loading">{t('Loading...')}</p>}

          {loadError && (
            <p className="question-cards-panel__error" role="alert">
              {t("Couldn't load the cards")}
              <button type="button" className="card-list__link-button" onClick={() => void load()}>
                {t('Retry')}
              </button>
            </p>
          )}

          {cards !== null && cards.length === 0 && (
            <div className="question-cards-panel__empty">
              <p>{t('No cards yet')}</p>
              <p>{t("Participants' suggestions and cards added in the main app appear here.")}</p>
            </div>
          )}

          {cards !== null && cards.length > 0 && (
            <CardList
              mode="saved"
              rows={rows}
              onAttach={(key, file) => void upload(key, file)}
              onAltChange={(key, alt) => setAltDrafts((prev) => ({ ...prev, [key]: alt }))}
              onAltCommit={(key) => void commitAlt(key)}
              onRemovePicture={(key) => void removePicture(key)}
              onRetry={(key) => {
                const file = states[key]?.pendingFile;
                if (file) void upload(key, file);
              }}
            />
          )}
        </div>
      )}
    </section>
  );
}
