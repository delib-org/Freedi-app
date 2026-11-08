'use client';

/**
 * CardRow — one card in the admin card list: number, picture well, text,
 * picture description, status and the actions that apply to it.
 */

import React from 'react';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/next';
import { CARD_IMAGE } from '@/constants/common';
import { CardPictureProblem, CardUploadStatus, pictureProblemKey, splitLines } from '@/lib/utils/cardDrafts';
import PictureWell, { PictureWellState } from './PictureWell';

export interface CardListRow {
  key: string;
  text: string;
  imageUrl: string | null;
  alt: string;
  status: CardUploadStatus;
  problem: CardPictureProblem | null;
  /** Saved mode: a change just reached the server. */
  saved?: boolean;
  /** Saved mode: a new card that is not on the server yet. */
  draft?: boolean;
  /** Saved mode: the card's text (or the new card) is being sent, or failed. */
  textStatus?: 'saving' | 'failed';
  /** Saved mode: how many participants already rated this card. */
  evaluators?: number;
}

export interface CardRowProps {
  row: CardListRow;
  index: number;
  /** Draft rows edit their text; saved rows show it. */
  editableText: boolean;
  disabled?: boolean;
  isConfirmingRemove?: boolean;
  /** Saved mode: "Delete this option?" is open on this row. */
  isConfirmingDelete?: boolean;
  onFiles: (files: File[]) => void;
  onAltChange: (alt: string) => void;
  onAltCommit?: () => void;
  onRemovePicture: () => void;
  onConfirmRemove?: (confirmed: boolean) => void;
  onConfirmDelete?: (confirmed: boolean) => void;
  onRetry?: () => void;
  onTextChange?: (text: string) => void;
  /** Saved mode: the text field lost focus. */
  onTextCommit?: () => void;
  /** Enter, or a multi-line paste: new cards right after this one. */
  onInsertAfter?: (texts: string[]) => void;
  onDeleteCard?: () => void;
  /** Backspace in an empty row. */
  onRemoveEmpty?: () => void;
  textInputRef?: (el: HTMLInputElement | null) => void;
  /** Autofocus a row that was just added. */
  autoFocus?: boolean;
}

function wellState(status: CardUploadStatus, problem: CardPictureProblem | null): PictureWellState {
  if (status === 'queued' || status === 'uploading') return 'uploading';
  if (status === 'done') return 'done';
  if (status === 'failed' || problem) return 'error';

  return 'idle';
}

export default function CardRow({
  row,
  index,
  editableText,
  disabled = false,
  isConfirmingRemove = false,
  isConfirmingDelete = false,
  onFiles,
  onAltChange,
  onAltCommit,
  onRemovePicture,
  onConfirmRemove,
  onConfirmDelete,
  onRetry,
  onTextChange,
  onTextCommit,
  onInsertAfter,
  onDeleteCard,
  onRemoveEmpty,
  textInputRef,
  autoFocus = false,
}: CardRowProps) {
  const { t, tWithParams } = useTranslation();
  const number = index + 1;
  const busy = row.status === 'queued' || row.status === 'uploading';
  const textBusy = row.textStatus === 'saving';
  const altId = `card-alt-${row.key}`;

  const wellLabel = row.imageUrl
    ? tWithParams('Change picture of card {{n}}', { n: number })
    : tWithParams('Add picture to card {{n}}: {{text}}', { n: number, text: row.text });

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && onInsertAfter) {
      e.preventDefault();
      onInsertAfter(['']);
    } else if (e.key === 'Backspace' && row.text === '' && onRemoveEmpty) {
      e.preventDefault();
      onRemoveEmpty();
    }
  };

  const handleTextPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!onInsertAfter || !onTextChange || !pasted.includes('\n')) return;
    // A pasted list keeps its "one card per line" meaning
    e.preventDefault();
    const [first, ...rest] = splitLines(pasted);
    onTextChange(`${row.text}${first ?? ''}`);
    if (rest.length > 0) onInsertAfter(rest);
  };

  return (
    <li
      data-card-key={row.key}
      className={clsx(
        'card-list__row',
        row.imageUrl && 'card-list__row--with-picture',
        busy && 'card-list__row--uploading',
        row.status === 'done' && 'card-list__row--done',
        (row.status === 'failed' || row.problem || row.textStatus === 'failed') && 'card-list__row--error',
        row.draft && 'card-list__row--new'
      )}
    >
      <span className="card-list__number" aria-hidden="true">
        {number}
      </span>

      <PictureWell
        imageUrl={row.imageUrl}
        alt={row.alt}
        state={wellState(row.status, row.problem)}
        ariaLabel={wellLabel}
        onFiles={onFiles}
        // A new card gets its picture once it exists on the server
        disabled={disabled || busy || row.draft}
      />

      <div className="card-list__body">
        {editableText ? (
          <input
            ref={textInputRef}
            type="text"
            className="card-list__text"
            value={row.text}
            onChange={(e) => onTextChange?.(e.target.value)}
            onBlur={onTextCommit}
            onKeyDown={handleTextKeyDown}
            onPaste={handleTextPaste}
            placeholder={row.draft ? t('Write the option…') : undefined}
            aria-label={tWithParams('Card {{n}} text', { n: number })}
            dir="auto"
            disabled={disabled || textBusy}
            autoFocus={autoFocus}
          />
        ) : (
          <p className="card-list__text-static" dir="auto">
            {row.text}
          </p>
        )}

        {row.imageUrl && (
          <>
            <label className="card-list__alt-label sr-only" htmlFor={altId}>
              {t('Picture description')}
            </label>
            <input
              id={altId}
              type="text"
              className="card-list__alt"
              value={row.alt}
              maxLength={CARD_IMAGE.ALT_MAX_LENGTH}
              placeholder={t('Describe the picture (recommended)')}
              onChange={(e) => onAltChange(e.target.value)}
              onBlur={onAltCommit}
              dir="auto"
              disabled={disabled || busy}
            />
          </>
        )}

        {(row.problem || row.status === 'failed') && (
          <p className="card-list__error" role="alert">
            {t(pictureProblemKey(row.problem ?? 'network'))}
            {/* A refused file would be refused again; only a lost connection is worth retrying */}
            {row.status === 'failed' && row.problem === 'network' && onRetry && (
              <button type="button" className="card-list__link-button" onClick={onRetry}>
                {t('Retry')}
              </button>
            )}
          </p>
        )}

        {busy && <p className="card-list__status">{t('Uploading...')}</p>}
        {textBusy && <p className="card-list__status">{t('Saving...')}</p>}
        {row.textStatus === 'failed' && (
          <p className="card-list__error" role="alert">
            {t("Couldn't save the card — check your connection and try again")}
          </p>
        )}
        {row.saved && !busy && !textBusy && <p className="card-list__status card-list__status--saved">{t('Saved')} ✓</p>}

        {isConfirmingDelete && onConfirmDelete && (
          <p className="card-list__confirm" role="alert">
            {t('Delete this option?')}
            {(row.evaluators ?? 0) > 0 && (
              <>
                {' '}
                {tWithParams('{{count}} participants already rated it.', { count: row.evaluators ?? 0 })}
              </>
            )}
            <button type="button" className="card-list__link-button card-list__link-button--danger" onClick={() => onConfirmDelete(true)}>
              {t('Delete')}
            </button>
            <button type="button" className="card-list__link-button" onClick={() => onConfirmDelete(false)}>
              {t('Keep')}
            </button>
          </p>
        )}

        {isConfirmingRemove && onConfirmRemove && (
          <p className="card-list__confirm" role="alert">
            {t('Remove this picture?')}
            <button type="button" className="card-list__link-button card-list__link-button--danger" onClick={() => onConfirmRemove(true)}>
              {t('Remove')}
            </button>
            <button type="button" className="card-list__link-button" onClick={() => onConfirmRemove(false)}>
              {t('Keep')}
            </button>
          </p>
        )}
      </div>

      <div className="card-list__actions">
        {row.imageUrl && !busy && !disabled && !isConfirmingRemove && (
          <button
            type="button"
            className="card-list__icon-button"
            onClick={onRemovePicture}
            disabled={disabled}
            aria-label={tWithParams('Remove picture from card {{n}}', { n: number })}
            title={t('Remove picture')}
          >
            🗑
          </button>
        )}
        {onDeleteCard && !disabled && !isConfirmingDelete && (
          <button
            type="button"
            className="card-list__icon-button"
            onClick={onDeleteCard}
            disabled={disabled || textBusy}
            aria-label={tWithParams('Delete card {{n}}', { n: number })}
            title={t('Delete card')}
          >
            ✕
          </button>
        )}
      </div>
    </li>
  );
}
