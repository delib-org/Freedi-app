'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { checkCardImageFile } from '@/lib/utils/cardImage';
import { appendSolutionLines } from '@/lib/utils/solutionSuggestions';
import { CardDraft, emptyDraft, linesToDrafts } from '@/lib/utils/cardDrafts';

export interface CardDrafts {
  /** The textarea's value while it leads (before any picture). */
  text: string;
  drafts: CardDraft[];
  /** True once a picture was added: the rows lead and the textarea is gone. */
  cardsMode: boolean;
  setText: (text: string) => void;
  attach: (key: string, file: File) => void;
  removePicture: (key: string) => void;
  setAlt: (key: string, alt: string) => void;
  setCardText: (key: string, text: string) => void;
  insertAfter: (key: string, texts: string[]) => void;
  deleteCard: (key: string) => void;
  addCard: () => void;
  /** New lines from the AI, wherever the admin is working. */
  appendLines: (lines: string[]) => void;
  reset: () => void;
}

function revoke(draft: CardDraft): void {
  if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
}

/**
 * The cards being written in the create-question wizard.
 *
 * Text-only work keeps today's textarea: the rows below it are derived from
 * its lines. The first picture flips the lead to the rows, because a picture
 * belongs to a card and a textarea line cannot hold one.
 */
export function useCardDrafts(): CardDrafts {
  const [text, setTextState] = useState('');
  const [drafts, setDrafts] = useState<CardDraft[]>([]);
  const [cardsMode, setCardsMode] = useState(false);

  // Object URLs outlive renders; release whatever is still held on unmount
  const latest = useRef(drafts);
  latest.current = drafts;
  useEffect(() => () => latest.current.forEach(revoke), []);

  const update = useCallback((key: string, change: (draft: CardDraft) => CardDraft) => {
    setDrafts((prev) => prev.map((draft) => (draft.key === key ? change(draft) : draft)));
  }, []);

  const setText = useCallback((value: string) => {
    setTextState(value);
    setDrafts((prev) => linesToDrafts(value, prev));
  }, []);

  const attach = useCallback(
    (key: string, file: File) => {
      const problem = checkCardImageFile(file);
      update(key, (draft) => {
        if (problem) return { ...draft, problem };
        revoke(draft);

        return { ...draft, file, previewUrl: URL.createObjectURL(file), problem: null };
      });
      if (!problem) setCardsMode(true);
    },
    [update]
  );

  const removePicture = useCallback(
    (key: string) => {
      update(key, (draft) => {
        revoke(draft);

        return { ...draft, file: null, previewUrl: null, alt: '', problem: null };
      });
    },
    [update]
  );

  const setAlt = useCallback((key: string, alt: string) => update(key, (d) => ({ ...d, alt })), [update]);

  const setCardText = useCallback((key: string, value: string) => update(key, (d) => ({ ...d, text: value })), [update]);

  const insertAfter = useCallback((key: string, texts: string[]) => {
    setDrafts((prev) => {
      const index = prev.findIndex((draft) => draft.key === key);
      const added = texts.map((value) => emptyDraft(value));

      return [...prev.slice(0, index + 1), ...added, ...prev.slice(index + 1)];
    });
  }, []);

  const deleteCard = useCallback((key: string) => {
    setDrafts((prev) => {
      const gone = prev.find((draft) => draft.key === key);
      if (gone) revoke(gone);

      return prev.filter((draft) => draft.key !== key);
    });
  }, []);

  const addCard = useCallback(() => setDrafts((prev) => [...prev, emptyDraft()]), []);

  const appendLines = useCallback(
    (lines: string[]) => {
      if (cardsMode) {
        setDrafts((prev) => [...prev.filter((d) => d.text.trim() || d.file), ...lines.map((l) => emptyDraft(l))]);
      } else {
        const next = appendSolutionLines(text, lines);
        setTextState(next);
        setDrafts((prev) => linesToDrafts(next, prev));
      }
    },
    [cardsMode, text]
  );

  const reset = useCallback(() => {
    latest.current.forEach(revoke);
    setTextState('');
    setDrafts([]);
    setCardsMode(false);
  }, []);

  // Every card deleted: nothing left for the rows to lead, so the textarea returns
  useEffect(() => {
    if (cardsMode && drafts.length === 0) {
      setCardsMode(false);
      setTextState('');
    }
  }, [cardsMode, drafts.length]);

  return {
    text,
    drafts,
    cardsMode,
    setText,
    attach,
    removePicture,
    setAlt,
    setCardText,
    insertAfter,
    deleteCard,
    addCard,
    appendLines,
    reset,
  };
}
