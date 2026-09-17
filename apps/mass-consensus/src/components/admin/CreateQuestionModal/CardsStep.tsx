'use client';

/**
 * Step 3 of the create-question wizard: the cards, each able to carry a picture.
 *
 * The textarea stays for fast text work (paste a list, or let the AI write
 * some). The rows under it take pictures; the first picture hands the lead to
 * the rows, whose text becomes editable.
 */

import React from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import CardList, { CardListRow } from '@/components/admin/CardList';
import { SUGGESTED_SOLUTIONS_COUNT } from '@/lib/utils/solutionSuggestions';
import type { CardDrafts } from '@/hooks/useCardDrafts';
import styles from './CreateQuestionModal.module.scss';

export interface CardsStepProps {
  cards: CardDrafts;
  skip: boolean;
  onSkipChange: (skip: boolean) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  canGenerate: boolean;
  generateError: string | null;
  onSubmitShortcut: () => void;
}

export default function CardsStep({
  cards,
  skip,
  onSkipChange,
  onGenerate,
  isGenerating,
  canGenerate,
  generateError,
  onSubmitShortcut,
}: CardsStepProps) {
  const { t, tWithParams } = useTranslation();

  const rows: CardListRow[] = cards.drafts.map((draft) => ({
    key: draft.key,
    text: draft.text,
    imageUrl: draft.previewUrl,
    alt: draft.alt,
    status: 'idle',
    problem: draft.problem,
  }));

  return (
    <div>
      <h3 className={styles.stepTitle}>
        {t('Add cards')}
        <span className={styles.optionalLabel}> ({t('optional') || 'Optional'})</span>
      </h3>
      <p className={styles.stepDescription}>
        {t('One card per line. Add a picture to any card, now or later.')}
      </p>

      <div className={styles.generateRow}>
        <button
          type="button"
          className={styles.generateButton}
          onClick={onGenerate}
          disabled={skip || isGenerating || !canGenerate}
        >
          {isGenerating ? (
            <>
              <span className={styles.generateSpinner} />
              {t('writingSolutions') || 'Writing solutions…'}
            </>
          ) : (
            <>
              <span aria-hidden="true">✨</span>
              {tWithParams('generateSolutionsWithAI', { count: SUGGESTED_SOLUTIONS_COUNT })}
            </>
          )}
        </button>
        <span className={styles.generateHint}>
          {t('generateSolutionsHint') ||
            'The AI writes starting solutions you can edit before creating the question'}
        </span>
      </div>

      {generateError && (
        <div className={styles.generateError} role="alert">
          {generateError}
        </div>
      )}

      {!cards.cardsMode && (
        <textarea
          className={styles.solutionsTextarea}
          placeholder={
            t('solutionsPlaceholder') ||
            'Focus on customer retention\nExpand to new markets\nImprove product quality'
          }
          value={cards.text}
          onChange={(e) => cards.setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onSubmitShortcut();
            }
          }}
          aria-label={t('Add cards')}
          disabled={skip}
        />
      )}

      {!skip && rows.length > 0 && (
        <CardList
          mode="draft"
          rows={rows}
          editableText={cards.cardsMode}
          onAttach={cards.attach}
          onAltChange={cards.setAlt}
          onRemovePicture={cards.removePicture}
          onTextChange={cards.cardsMode ? cards.setCardText : undefined}
          onInsertAfter={cards.cardsMode ? cards.insertAfter : undefined}
          onDeleteCard={cards.cardsMode ? cards.deleteCard : undefined}
          onAddCard={cards.cardsMode ? cards.addCard : undefined}
        />
      )}

      {!skip && rows.length === 0 && (
        <div className={styles.solutionsPreview}>
          <div className={styles.emptyPreview}>
            {t('pasteYourSolutions') || 'Paste your solutions above, one per line'}
          </div>
        </div>
      )}

      <label className={styles.skipOption}>
        <input type="checkbox" checked={skip} onChange={(e) => onSkipChange(e.target.checked)} />
        <span>{t("Skip – don't add cards now")}</span>
      </label>
    </div>
  );
}
