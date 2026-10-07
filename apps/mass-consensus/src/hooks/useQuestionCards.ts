'use client';

/**
 * useQuestionCards — the option cards of an existing question, for the
 * admin's options editor. Every change saves the moment it is made: a new
 * card on Enter/blur, a text edit on blur, a picture as soon as it is chosen,
 * a delete after its inline confirmation. Hidden ("deleted") cards disappear
 * from the list; the statements stay in Firestore.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Statement, getRandomUID } from '@freedi/shared-types';
import type { CardListRow } from '@/components/admin/CardList';
import {
  createQuestionCards,
  fetchQuestionCards,
  hideCard,
  updateCardText,
} from '@/controllers/questionCardsController';
import { deleteCardImage, uploadCardImage } from '@/controllers/cardImageController';
import { problemFromUploadError } from '@/controllers/cardUploadQueue';
import { NotAuthenticatedError } from '@/lib/api/authedFetch';
import { checkCardImageFile } from '@/lib/utils/cardImage';
import type { CardPictureProblem, CardUploadStatus } from '@/lib/utils/cardDrafts';
import { logError } from '@/lib/utils/errorHandling';

const SAVED_BADGE_MS = 2000;

interface PictureState {
  status: CardUploadStatus;
  problem: CardPictureProblem | null;
  /** Local preview while uploading, and the file to send again on Retry. */
  pendingFile?: File;
  pendingUrl?: string;
  saved?: boolean;
}

const IDLE_PICTURE: PictureState = { status: 'idle', problem: null };

/** One row of the editor: a saved card, or a new card not sent yet. */
interface CardItem {
  key: string;
  text: string;
  saved?: Statement;
}

export interface UseQuestionCardsOptions {
  questionId: string;
  surveyId?: string;
  /** Load only once the editor is on screen. */
  enabled: boolean;
}

export function useQuestionCards({ questionId, surveyId, enabled }: UseQuestionCardsOptions) {
  const [items, setItems] = useState<CardItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pictures, setPictures] = useState<Record<string, PictureState>>({});
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});
  const [textStatus, setTextStatus] = useState<Record<string, 'saving' | 'failed' | undefined>>({});
  const [confirmingDeleteKey, setConfirmingDeleteKey] = useState<string | null>(null);
  const picturesRef = useRef(pictures);
  picturesRef.current = pictures;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Release local previews on unmount
  useEffect(
    () => () => Object.values(picturesRef.current).forEach((s) => s.pendingUrl && URL.revokeObjectURL(s.pendingUrl)),
    []
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const cards = await fetchQuestionCards(questionId, surveyId);
      setItems(cards.map((card) => ({ key: card.statementId, text: card.statement, saved: card })));
    } catch (error) {
      if (!(error instanceof NotAuthenticatedError)) {
        logError(error, { operation: 'useQuestionCards.load', questionId, metadata: { surveyId } });
      }
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [questionId, surveyId]);

  useEffect(() => {
    if (enabled && items === null && !isLoading && !loadError) void load();
  }, [enabled, items, isLoading, loadError, load]);

  // ---- pictures ---------------------------------------------------------

  const setPicture = (key: string, change: Partial<PictureState>) =>
    setPictures((prev) => ({ ...prev, [key]: { ...IDLE_PICTURE, ...prev[key], ...change } }));

  const patchSaved = (key: string, change: Partial<Statement>) =>
    setItems((prev) =>
      prev?.map((item) => (item.key === key && item.saved ? { ...item, saved: { ...item.saved, ...change } } : item)) ?? prev
    );

  const releasePreview = (key: string) => {
    const url = picturesRef.current[key]?.pendingUrl;
    if (url) URL.revokeObjectURL(url);
  };

  const flashSaved = (key: string) => {
    setPicture(key, { saved: true });
    setTimeout(() => setPicture(key, { saved: false }), SAVED_BADGE_MS);
  };

  const upload = async (key: string, file: File) => {
    const card = itemsRef.current?.find((item) => item.key === key)?.saved;
    if (!card) return;

    const problem = checkCardImageFile(file);
    if (problem) {
      setPicture(key, { status: 'idle', problem });

      return;
    }

    releasePreview(key);
    setPicture(key, { status: 'uploading', problem: null, pendingFile: file, pendingUrl: URL.createObjectURL(file) });

    try {
      const alt = altDrafts[key] ?? card.imagesURL?.alt ?? '';
      const imagesURL = await uploadCardImage({ statementId: key, file, alt, surveyId });
      patchSaved(key, { imagesURL });
      releasePreview(key);
      setPicture(key, { status: 'idle', pendingFile: undefined, pendingUrl: undefined });
      flashSaved(key);
    } catch (error) {
      logError(error, { operation: 'useQuestionCards.upload', statementId: key, questionId });
      // Keep the chosen file for Retry, but show the picture the card really has
      releasePreview(key);
      setPicture(key, { status: 'failed', problem: problemFromUploadError(error), pendingUrl: undefined });
    }
  };

  const retry = (key: string) => {
    const file = picturesRef.current[key]?.pendingFile;
    if (file) void upload(key, file);
  };

  const setAlt = (key: string, alt: string) => setAltDrafts((prev) => ({ ...prev, [key]: alt }));

  const commitAlt = async (key: string) => {
    const card = itemsRef.current?.find((item) => item.key === key)?.saved;
    const alt = altDrafts[key];
    if (!card?.imagesURL?.main || alt === undefined || alt.trim() === (card.imagesURL.alt ?? '')) return;

    try {
      const imagesURL = await uploadCardImage({ statementId: key, alt, surveyId });
      patchSaved(key, { imagesURL });
      flashSaved(key);
    } catch (error) {
      logError(error, { operation: 'useQuestionCards.commitAlt', statementId: key, questionId });
      setPicture(key, { problem: 'network' });
    }
  };

  const removePicture = async (key: string) => {
    setPicture(key, { status: 'uploading', problem: null });
    try {
      const imagesURL = await deleteCardImage(key, surveyId);
      patchSaved(key, { imagesURL });
      setAltDrafts((prev) => ({ ...prev, [key]: '' }));
      setPicture(key, { status: 'idle' });
    } catch (error) {
      logError(error, { operation: 'useQuestionCards.removePicture', statementId: key, questionId });
      setPicture(key, { status: 'failed', problem: 'network' });
    }
  };

  // ---- text, add, delete ----------------------------------------------

  const setText = (key: string, text: string) =>
    setItems((prev) => prev?.map((item) => (item.key === key ? { ...item, text } : item)) ?? prev);

  /** A new, empty card right after `afterKey` (or at the end). It is created once it has text. */
  const addCard = (afterKey?: string) => {
    const draft: CardItem = { key: `new-${getRandomUID()}`, text: '' };
    setItems((prev) => {
      const list = prev ?? [];
      const index = afterKey ? list.findIndex((item) => item.key === afterKey) : -1;

      return index < 0 ? [...list, draft] : [...list.slice(0, index + 1), draft, ...list.slice(index + 1)];
    });
  };

  const createCards = async (keys: string[], texts: string[]) => {
    keys.forEach((key) => setTextStatus((prev) => ({ ...prev, [key]: 'saving' })));
    try {
      const created = await createQuestionCards(questionId, texts, surveyId);
      setItems((prev) =>
        prev?.map((item) => {
          const at = keys.indexOf(item.key);
          const card = at >= 0 ? created[at] : undefined;

          return card ? { key: card.statementId, text: card.statement, saved: card } : item;
        }) ?? prev
      );
      keys.forEach((key) => setTextStatus((prev) => ({ ...prev, [key]: undefined })));
    } catch (error) {
      logError(error, { operation: 'useQuestionCards.createCards', questionId, metadata: { count: texts.length } });
      keys.forEach((key) => setTextStatus((prev) => ({ ...prev, [key]: 'failed' })));
    }
  };

  /** Enter or a multi-line paste in a row: new cards right after it. Lines with text are created at once. */
  const insertAfter = (key: string, texts: string[]) => {
    const withText = texts.map((text) => text.trim()).filter((text) => text.length > 0);
    if (withText.length === 0) {
      addCard(key);

      return;
    }

    const drafts: CardItem[] = withText.map((text) => ({ key: `new-${getRandomUID()}`, text }));
    setItems((prev) => {
      const list = prev ?? [];
      const index = list.findIndex((item) => item.key === key);

      return index < 0 ? [...list, ...drafts] : [...list.slice(0, index + 1), ...drafts, ...list.slice(index + 1)];
    });
    void createCards(
      drafts.map((draft) => draft.key),
      drafts.map((draft) => draft.text)
    );
  };

  /** The row lost focus: create a new card, save a changed text, or drop an empty new row. */
  const commitText = async (key: string) => {
    const item = itemsRef.current?.find((entry) => entry.key === key);
    if (!item) return;
    const text = item.text.trim();

    if (!item.saved) {
      if (text.length === 0) {
        setItems((prev) => prev?.filter((entry) => entry.key !== key) ?? prev);
      } else if (textStatus[key] !== 'saving') {
        await createCards([key], [text]);
      }

      return;
    }

    if (text.length === 0) {
      // A saved card cannot be emptied; put its text back
      setText(key, item.saved.statement);

      return;
    }
    if (text === item.saved.statement) return;

    setTextStatus((prev) => ({ ...prev, [key]: 'saving' }));
    try {
      await updateCardText(key, text, surveyId);
      patchSaved(key, { statement: text });
      setTextStatus((prev) => ({ ...prev, [key]: undefined }));
      flashSaved(key);
    } catch (error) {
      logError(error, { operation: 'useQuestionCards.commitText', statementId: key, questionId });
      setTextStatus((prev) => ({ ...prev, [key]: 'failed' }));
    }
  };

  /** ✕ on a row, or Backspace in an empty one: a new row goes at once; a saved card asks first. */
  const requestDelete = (key: string) => {
    const item = itemsRef.current?.find((entry) => entry.key === key);
    if (!item) return;
    if (!item.saved) {
      setItems((prev) => prev?.filter((entry) => entry.key !== key) ?? prev);
    } else {
      setConfirmingDeleteKey(key);
    }
  };

  const confirmDelete = async (confirmed: boolean) => {
    const key = confirmingDeleteKey;
    setConfirmingDeleteKey(null);
    if (!confirmed || !key) return;

    setTextStatus((prev) => ({ ...prev, [key]: 'saving' }));
    try {
      await hideCard(key, surveyId);
      releasePreview(key);
      setItems((prev) => prev?.filter((entry) => entry.key !== key) ?? prev);
    } catch (error) {
      logError(error, { operation: 'useQuestionCards.confirmDelete', statementId: key, questionId });
      setTextStatus((prev) => ({ ...prev, [key]: 'failed' }));
    }
  };

  // ---- derived ----------------------------------------------------------

  const rows: CardListRow[] = useMemo(
    () =>
      (items ?? []).map((item) => {
        const picture = pictures[item.key];
        const card = item.saved;

        return {
          key: item.key,
          text: item.text,
          imageUrl: picture?.pendingUrl ?? card?.imagesURL?.main ?? null,
          alt: altDrafts[item.key] ?? card?.imagesURL?.alt ?? '',
          status: picture?.status ?? 'idle',
          problem: picture?.problem ?? null,
          saved: picture?.saved,
          draft: !card,
          textStatus: textStatus[item.key],
          evaluators: card?.evaluation?.numberOfEvaluators ?? 0,
        };
      }),
    [items, pictures, altDrafts, textStatus]
  );

  /** Saved cards only, with the picture the row currently shows — what the preview renders. */
  const previewCards = useMemo(
    () =>
      (items ?? [])
        .filter((item): item is CardItem & { saved: Statement } => Boolean(item.saved))
        .map((item) => ({
          statement: { ...item.saved, statement: item.text || item.saved.statement },
          imageOverride: pictures[item.key]?.pendingUrl ?? null,
        })),
    [items, pictures]
  );

  const savedCount = previewCards.length;
  const pictureCount = (items ?? []).filter((item) => item.saved?.imagesURL?.main).length;

  return {
    rows,
    previewCards,
    savedCount,
    pictureCount,
    isLoaded: items !== null,
    isLoading,
    loadError,
    load,
    upload,
    retry,
    setAlt,
    commitAlt,
    removePicture,
    setText,
    commitText,
    addCard,
    insertAfter,
    requestDelete,
    confirmDelete,
    confirmingDeleteKey,
  };
}

export type QuestionCardsApi = ReturnType<typeof useQuestionCards>;
