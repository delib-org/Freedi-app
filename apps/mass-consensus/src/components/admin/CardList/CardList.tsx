'use client';

/**
 * CardList — the admin's list of cards, each able to carry a picture.
 *
 * Used twice: in the create-question wizard (`draft` — text is editable and
 * pictures wait in memory until the question exists) and in the survey
 * editor's Cards panel (`saved` — every change goes to the server at once).
 * Pictures arrive by tapping a row's well, dropping files on a row, dropping
 * several files anywhere on the list (they fill the cards without a picture,
 * top to bottom), "Add pictures for all…", or pasting an image.
 */

import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/next';
import { CARD_IMAGE } from '@/constants/common';
import { assignFilesInOrder, imageFilesFrom } from '@/lib/utils/cardDrafts';
import CardRow, { CardListRow } from './CardRow';

export type { CardListRow } from './CardRow';

export interface CardListProps {
  mode: 'draft' | 'saved';
  rows: CardListRow[];
  /** Draft rows are editable by default; the wizard shows them read-only while the textarea leads. */
  editableText?: boolean;
  disabled?: boolean;
  /** Status only: no toolbar, no drop target, no hint. */
  readOnly?: boolean;
  onAttach: (key: string, file: File) => void;
  onAltChange: (key: string, alt: string) => void;
  onAltCommit?: (key: string) => void;
  onRemovePicture: (key: string) => void;
  onRetry?: (key: string) => void;
  // Text editing: always in draft mode; in saved mode when the editor allows it
  onTextChange?: (key: string, text: string) => void;
  /** Saved mode: a row's text field lost focus. */
  onTextCommit?: (key: string) => void;
  onInsertAfter?: (key: string, texts: string[]) => void;
  onDeleteCard?: (key: string) => void;
  /** Saved mode: the row whose "Delete this option?" is open, and its answer. */
  confirmingDeleteKey?: string | null;
  onConfirmDelete?: (confirmed: boolean) => void;
  onAddCard?: () => void;
  /** Label of the add button; defaults to "+ Add card". */
  addLabel?: string;
}

export default function CardList({
  mode,
  rows,
  editableText,
  disabled = false,
  readOnly = false,
  onAttach,
  onAltChange,
  onAltCommit,
  onRemovePicture,
  onRetry,
  onTextChange,
  onTextCommit,
  onInsertAfter,
  onDeleteCard,
  confirmingDeleteKey = null,
  onConfirmDelete,
  onAddCard,
  addLabel,
}: CardListProps) {
  const { t, tWithParams } = useTranslation();
  const [isDragOver, setIsDragOver] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const multiInputRef = useRef<HTMLInputElement>(null);
  const textInputs = useRef(new Map<string, HTMLInputElement>());
  // Row to focus once a keyboard insert or delete has re-rendered the list
  const pendingFocusIndex = useRef<number | null>(null);

  useEffect(() => {
    const index = pendingFocusIndex.current;
    if (index === null) return;
    pendingFocusIndex.current = null;
    const key = rows[Math.max(0, Math.min(index, rows.length - 1))]?.key;
    if (key) textInputs.current.get(key)?.focus();
  }, [rows]);

  const isDraft = mode === 'draft';

  /** Spread several pictures over the cards that still have none. */
  const assignMany = (files: File[]) => {
    const { assigned, rejected, unused } = assignFilesInOrder(
      rows.map((row) => ({ hasPicture: Boolean(row.imageUrl) })),
      files
    );
    assigned.forEach(({ index, file }) => onAttach(rows[index].key, file));

    const parts: string[] = [];
    if (assigned.length > 0) {
      parts.push(
        tWithParams('{{count}} pictures added to cards {{from}}–{{to}}', {
          count: assigned.length,
          from: assigned[0].index + 1,
          to: assigned[assigned.length - 1].index + 1,
        })
      );
    }
    if (unused > 0) {
      parts.push(tWithParams('{{count}} pictures were not used — there were more pictures than cards', { count: unused }));
    }
    if (rejected > 0) {
      parts.push(tWithParams('{{count}} files were skipped — not supported images', { count: rejected }));
    }
    setNotice(parts.join(' · '));
  };

  const handleRowFiles = (key: string, index: number, files: File[]) => {
    if (files.length === 1) {
      onAttach(key, files[0]);
      setNotice(tWithParams('Picture added to card {{n}}', { n: index + 1 }));
    } else {
      assignMany(files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const files = imageFilesFrom(e.clipboardData.files);
    if (files.length === 0 || disabled) return;
    e.preventDefault();
    const index = rows.findIndex((row) => row.key === focusedKey);
    if (index >= 0 && files.length === 1) {
      handleRowFiles(rows[index].key, index, files);
    } else {
      assignMany(files);
    }
  };

  return (
    <div
      className={clsx('card-list', `card-list--${mode}`, isDragOver && 'card-list--dragover')}
      onDragOver={(e) => {
        if (disabled || readOnly || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOver(false);
      }}
      onDrop={(e) => {
        setIsDragOver(false);
        const files = imageFilesFrom(e.dataTransfer.files);
        if (files.length === 0 || disabled || readOnly) return;
        e.preventDefault();
        assignMany(files);
      }}
      onPaste={handlePaste}
      onFocus={(e) => {
        const key = (e.target as HTMLElement).closest('[data-card-key]')?.getAttribute('data-card-key');
        if (key) setFocusedKey(key);
      }}
    >
      {!readOnly && (
      <div className="card-list__toolbar">
        <span className="card-list__count">
          {rows.length === 1 ? t('1 card') : tWithParams('{{count}} cards', { count: rows.length })}
        </span>
        <button
          type="button"
          className="card-list__tool"
          onClick={() => multiInputRef.current?.click()}
          disabled={disabled || rows.length === 0}
        >
          <span aria-hidden="true">📷</span> {t('Add pictures for all…')}
        </button>
        <input
          ref={multiInputRef}
          type="file"
          multiple
          accept={CARD_IMAGE.ALLOWED_TYPES.join(',')}
          className="picture-well__input"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const files = imageFilesFrom(e.target.files);
            e.target.value = '';
            if (files.length > 0) assignMany(files);
          }}
        />
      </div>
      )}

      <ol className="card-list__rows">
        {rows.map((row, index) => (
          <CardRow
            key={row.key}
            row={row}
            index={index}
            editableText={editableText ?? isDraft}
            disabled={disabled}
            isConfirmingRemove={confirmingKey === row.key}
            isConfirmingDelete={confirmingDeleteKey === row.key}
            onFiles={(files) => handleRowFiles(row.key, index, files)}
            onAltChange={(alt) => onAltChange(row.key, alt)}
            onAltCommit={onAltCommit ? () => onAltCommit(row.key) : undefined}
            onRemovePicture={() => (isDraft ? onRemovePicture(row.key) : setConfirmingKey(row.key))}
            onConfirmRemove={(confirmed) => {
              setConfirmingKey(null);
              if (confirmed) onRemovePicture(row.key);
            }}
            onConfirmDelete={onConfirmDelete}
            onRetry={onRetry ? () => onRetry(row.key) : undefined}
            onTextChange={onTextChange ? (text) => onTextChange(row.key, text) : undefined}
            onTextCommit={onTextCommit ? () => onTextCommit(row.key) : undefined}
            autoFocus={Boolean(row.draft) && row.text === ''}
            onInsertAfter={
              onInsertAfter
                ? (texts) => {
                    pendingFocusIndex.current = index + 1;
                    onInsertAfter(row.key, texts);
                  }
                : undefined
            }
            onDeleteCard={onDeleteCard ? () => onDeleteCard(row.key) : undefined}
            onRemoveEmpty={
              onDeleteCard
                ? () => {
                    pendingFocusIndex.current = index - 1;
                    onDeleteCard(row.key);
                  }
                : undefined
            }
            textInputRef={(el) => {
              if (el) textInputs.current.set(row.key, el);
              else textInputs.current.delete(row.key);
            }}
          />
        ))}
      </ol>

      {!readOnly && (
        <p className="card-list__drop-hint">{t('Drop pictures anywhere on the list to add them in order')}</p>
      )}

      {onAddCard && (
        <button type="button" className="card-list__add" onClick={onAddCard} disabled={disabled}>
          {addLabel ?? t('+ Add card')}
        </button>
      )}

      <p className="card-list__notice" role="status" aria-live="polite">
        {notice}
      </p>
    </div>
  );
}
