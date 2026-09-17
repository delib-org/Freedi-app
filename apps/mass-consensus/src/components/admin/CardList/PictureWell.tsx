'use client';

/**
 * PictureWell — the spot on a card row that takes a picture: tap to pick,
 * or drop a file on it. Shows the thumbnail and the upload state.
 */

import React, { useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/next';
import { CARD_IMAGE } from '@/constants/common';
import { imageFilesFrom } from '@/lib/utils/cardDrafts';

export type PictureWellState = 'idle' | 'uploading' | 'done' | 'error';

export interface PictureWellProps {
  imageUrl: string | null;
  alt: string;
  state?: PictureWellState;
  /** Full description for screen readers, e.g. "Add picture to card 3: …". */
  ariaLabel: string;
  /** All picture files chosen or dropped, in order. */
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export default function PictureWell({
  imageUrl,
  alt,
  state = 'idle',
  ariaLabel,
  onFiles,
  disabled = false,
}: PictureWellProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    const files = imageFilesFrom(e.dataTransfer.files);
    if (files.length === 0) return;
    // This well takes the drop; the list must not assign it a second time
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!disabled) onFiles(files);
  };

  return (
    <>
      <button
        type="button"
        className={clsx(
          'picture-well',
          imageUrl ? 'picture-well--filled' : 'picture-well--empty',
          isDragOver && 'picture-well--dragover',
          state !== 'idle' && `picture-well--${state}`,
          disabled && 'picture-well--disabled'
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-busy={state === 'uploading'}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- local object URLs and storage URLs
          <img className="picture-well__thumb" src={imageUrl} alt={alt} draggable={false} />
        )}
        {!imageUrl && (
          <>
            <span className="picture-well__icon" aria-hidden="true">
              {isDragOver ? '⤓' : '📷'}
            </span>
            <span className="picture-well__label" aria-hidden="true">
              {isDragOver ? t('Drop') : t('Add picture')}
            </span>
          </>
        )}
        {state === 'uploading' && <span className="picture-well__spinner" aria-hidden="true" />}
        {state === 'done' && (
          <span className="picture-well__badge" aria-hidden="true">
            ✓
          </span>
        )}
        {state === 'error' && (
          <span className="picture-well__badge picture-well__badge--error" aria-hidden="true">
            !
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={CARD_IMAGE.ALLOWED_TYPES.join(',')}
        className="picture-well__input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = imageFilesFrom(e.target.files);
          e.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
    </>
  );
}
