'use client';

/**
 * ImageDropZone — a wide well for one picture: drop a file on it, paste one,
 * or tap to pick. Shows the picture once it is there, a remove control, and
 * (tucked away) a field for those who only have a URL.
 */

import React, { useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/next';
import { imageFilesFrom } from '@/lib/utils/cardDrafts';
import { SURVEY_IMAGE_ACCEPT } from '@/lib/utils/surveyImage';

export type ImageDropZoneState = 'idle' | 'uploading' | 'error';

export interface ImageDropZoneProps {
  imageUrl?: string;
  /** Full description for screen readers, e.g. "Hero picture for page: …". */
  ariaLabel: string;
  state?: ImageDropZoneState;
  /** Shown under the well while `state` is 'error'. */
  errorMessage?: string;
  onFile: (file: File) => void;
  onRemove: () => void;
  /** When given, a "use a link instead" field is offered under the well. */
  onUrlChange?: (url: string) => void;
  disabled?: boolean;
  /** Why the well is disabled, e.g. "Save the survey first". */
  disabledHint?: string;
}

export default function ImageDropZone({
  imageUrl,
  ariaLabel,
  state = 'idle',
  errorMessage,
  onFile,
  onRemove,
  onUrlChange,
  disabled = false,
  disabledHint,
}: ImageDropZoneProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showUrlField, setShowUrlField] = useState(false);

  const takeFiles = (list: FileList | readonly File[] | null | undefined): boolean => {
    const files = imageFilesFrom(list);
    if (files.length === 0) return false;
    if (!disabled) onFile(files[0]);

    return true;
  };

  const handleDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    setIsDragOver(false);
    if (takeFiles(e.dataTransfer.files)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLButtonElement>) => {
    if (takeFiles(e.clipboardData.files)) e.preventDefault();
  };

  const filled = Boolean(imageUrl);

  return (
    <div className="image-drop-zone">
      <button
        type="button"
        className={clsx(
          'image-drop-zone__well',
          filled && 'image-drop-zone__well--filled',
          isDragOver && 'image-drop-zone__well--dragover',
          state === 'error' && 'image-drop-zone__well--error'
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-busy={state === 'uploading'}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- storage URLs and any link the admin pasted
          <img className="image-drop-zone__thumb" src={imageUrl} alt="" draggable={false} />
        )}
        {!imageUrl && (
          <>
            <span className="image-drop-zone__icon" aria-hidden="true">
              {isDragOver ? '⤓' : '🖼️'}
            </span>
            <span className="image-drop-zone__label" aria-hidden="true">
              {isDragOver ? t('Drop') : t('Drop a picture here or click to choose')}
            </span>
            <span className="image-drop-zone__hint" aria-hidden="true">
              {disabled && disabledHint ? disabledHint : t('PNG, JPG, WebP or GIF, up to 5 MB')}
            </span>
          </>
        )}
        {state === 'uploading' && <span className="image-drop-zone__spinner" aria-hidden="true" />}
      </button>

      {state === 'error' && errorMessage && (
        <p className="image-drop-zone__error" role="alert">
          {errorMessage}
        </p>
      )}

      <div className="image-drop-zone__actions">
        {filled && (
          <>
            <button
              type="button"
              className="image-drop-zone__action"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
            >
              {t('Replace picture')}
            </button>
            <button
              type="button"
              className="image-drop-zone__action image-drop-zone__action--danger"
              onClick={onRemove}
            >
              {t('Remove picture')}
            </button>
          </>
        )}
        {onUrlChange && !showUrlField && (
          <button
            type="button"
            className="image-drop-zone__action"
            onClick={() => setShowUrlField(true)}
          >
            {t('Use a link instead')}
          </button>
        )}
      </div>

      {onUrlChange && showUrlField && (
        <input
          type="url"
          className="image-drop-zone__url"
          value={imageUrl || ''}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://example.com/image.jpg"
          aria-label={t('Picture link')}
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept={SURVEY_IMAGE_ACCEPT}
        className="image-drop-zone__input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          takeFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
