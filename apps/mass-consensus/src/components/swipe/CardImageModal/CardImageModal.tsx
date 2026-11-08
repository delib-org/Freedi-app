'use client';

/**
 * CardImageModal Component
 * Bottom sheet where an admin puts a picture on an option's swipe card,
 * replaces it, or takes it off.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import { CARD_IMAGE } from '@/constants/common';
import { checkCardImageFile } from '@/lib/utils/cardImage';
import { deleteCardImage, uploadCardImage, ImagesURL } from '@/controllers/cardImageController';
import { logError } from '@/lib/utils/errorHandling';

export interface CardImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  statement: Statement;
  surveyId?: string;
  onSaved: (imagesURL: ImagesURL) => void;
}

const CardImageModal: React.FC<CardImageModalProps> = ({
  isOpen,
  onClose,
  statement,
  surveyId,
  onSaved,
}) => {
  const { t } = useTranslation();
  const currentUrl = statement.imagesURL?.main;

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [alt, setAlt] = useState(statement.imagesURL?.alt ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Start from the card as it is every time the sheet opens
  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setAlt(statement.imagesURL?.alt ?? '');
    setError(null);
    setIsBusy(false);
    const timer = setTimeout(() => contentRef.current?.focus(), 100);

    return () => clearTimeout(timer);
  }, [isOpen, statement.statementId, statement.imagesURL?.alt]);

  // A local preview for the chosen file, released when it changes
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);

      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleClose = useCallback(() => {
    if (!isBusy) onClose();
  }, [isBusy, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleClose]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!chosen) return;

    const problem = checkCardImageFile(chosen);
    if (problem === 'size') {
      setError(t('The image is larger than 5 MB'));

      return;
    }
    if (problem) {
      setError(t('This file is not a supported image'));

      return;
    }
    setError(null);
    setFile(chosen);
  };

  const runAndClose = async (action: () => Promise<ImagesURL>, operation: string) => {
    setIsBusy(true);
    setError(null);
    try {
      onSaved(await action());
      setIsBusy(false);
      onClose();
    } catch (err) {
      logError(err, {
        operation: `CardImageModal.${operation}`,
        statementId: statement.statementId,
        metadata: { surveyId },
      });
      setError(t('Failed to save the image. Please try again.'));
      setIsBusy(false);
    }
  };

  const altChanged = alt.trim() !== (statement.imagesURL?.alt ?? '');
  const canSave = file !== null || (Boolean(currentUrl) && altChanged);

  const handleSave = () => {
    if (!canSave) return;
    void runAndClose(
      () => uploadCardImage({ statementId: statement.statementId, file, alt, surveyId }),
      'upload'
    );
  };

  const handleRemove = () => {
    void runAndClose(() => deleteCardImage(statement.statementId, surveyId), 'remove');
  };

  if (!isOpen) return null;

  const shownUrl = previewUrl ?? currentUrl;

  return createPortal(
    <div
      className="card-image-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-image-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="card-image-modal__content" ref={contentRef} tabIndex={-1}>
        <div className="card-image-modal__header">
          <h2 id="card-image-modal-title" className="card-image-modal__title">
            {t('Card image')}
          </h2>
          <button
            type="button"
            className="card-image-modal__close"
            onClick={handleClose}
            disabled={isBusy}
            aria-label={t('Close')}
          >
            &times;
          </button>
        </div>

        <p className="card-image-modal__quote" dir="auto">
          {statement.statement}
        </p>

        {shownUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- storage URLs are not in next/image's allow-list
          <img className="card-image-modal__preview" src={shownUrl} alt={alt} />
        ) : (
          <div className="card-image-modal__placeholder" aria-hidden="true">
            🖼️
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={CARD_IMAGE.ALLOWED_TYPES.join(',')}
          className="card-image-modal__file-input"
          onChange={handleFileChange}
          tabIndex={-1}
          aria-hidden="true"
        />
        <button
          type="button"
          className="card-image-modal__button card-image-modal__button--secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy}
        >
          {shownUrl ? t('Change image') : t('Choose image')}
        </button>
        <p className="card-image-modal__hint">{t('Use PNG, JPG, WebP or GIF, up to 5 MB')}</p>

        <label className="card-image-modal__label" htmlFor="card-image-alt">
          {t('Image description')}
        </label>
        <input
          id="card-image-alt"
          type="text"
          className="card-image-modal__input"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          maxLength={CARD_IMAGE.ALT_MAX_LENGTH}
          placeholder={t('Describe the image for people who cannot see it')}
          dir="auto"
          disabled={isBusy}
        />

        {error && (
          <p className="card-image-modal__error" role="alert">
            {error}
          </p>
        )}

        <div className="card-image-modal__actions">
          {currentUrl && !file && (
            <button
              type="button"
              className="card-image-modal__button card-image-modal__button--danger"
              onClick={handleRemove}
              disabled={isBusy}
            >
              {t('Remove image')}
            </button>
          )}
          <button
            type="button"
            className="card-image-modal__button card-image-modal__button--secondary"
            onClick={handleClose}
            disabled={isBusy}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="card-image-modal__button card-image-modal__button--primary"
            onClick={handleSave}
            disabled={isBusy || !canSave}
          >
            {isBusy ? t('Uploading...') : t('Save')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CardImageModal;
