'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { ParagraphType } from '@freedi/shared-types';
import TiptapEditor from './TiptapEditor';
import styles from './InlineAddContent.module.scss';

interface ImageUploadState {
  file: File | null;
  preview: string | null;
  alt: string;
  caption: string;
}

interface InlineAddContentProps {
  documentId: string;
  contentType: ParagraphType;
  onSave: (data: {
    content: string;
    type: ParagraphType;
    imageFile?: File;
    imageAlt?: string;
    imageCaption?: string;
  }) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

/**
 * Inline content editor that appears in place when adding new content
 * Replaces modal-based flow for better UX
 */
export default function InlineAddContent({
  documentId,
  contentType,
  onSave,
  onCancel,
  saving = false,
}: InlineAddContentProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [selectedType, setSelectedType] = useState<ParagraphType>(contentType);
  const [imageUpload, setImageUpload] = useState<ImageUploadState>({
    file: null,
    preview: null,
    alt: '',
    caption: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isImageType = selectedType === ParagraphType.image;

  // Scroll into view when mounted
  useEffect(() => {
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (imageUpload.preview) {
        URL.revokeObjectURL(imageUpload.preview);
      }
    };
  }, [imageUpload.preview]);

  // Update selected type when contentType prop changes
  useEffect(() => {
    setSelectedType(contentType);
  }, [contentType]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      alert(t('Invalid file type. Allowed: JPEG, PNG, GIF, WebP, SVG'));
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert(t('File too large. Maximum size is 5 MB'));
      return;
    }

    // Revoke previous preview URL
    if (imageUpload.preview) {
      URL.revokeObjectURL(imageUpload.preview);
    }

    // Create preview
    const preview = URL.createObjectURL(file);
    setImageUpload(prev => ({ ...prev, file, preview }));
  }, [t, imageUpload.preview]);

  const resetImageUpload = useCallback(() => {
    if (imageUpload.preview) {
      URL.revokeObjectURL(imageUpload.preview);
    }
    setImageUpload({
      file: null,
      preview: null,
      alt: '',
      caption: '',
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [imageUpload.preview]);

  const handleSave = useCallback(async () => {
    if (isImageType) {
      if (!imageUpload.file) {
        alert(t('Please select an image'));
        return;
      }
      await onSave({
        content: '',
        type: ParagraphType.image,
        imageFile: imageUpload.file,
        imageAlt: imageUpload.alt || undefined,
        imageCaption: imageUpload.caption || undefined,
      });
    } else {
      if (!content.trim()) {
        alert(t('Content is required'));
        return;
      }
      await onSave({
        content,
        type: selectedType,
      });
    }
  }, [isImageType, imageUpload, content, selectedType, onSave, t]);

  const handleCancel = useCallback(() => {
    resetImageUpload();
    onCancel();
  }, [resetImageUpload, onCancel]);

  const getTypeLabel = (type: ParagraphType): string => {
    const labels: Record<ParagraphType, string> = {
      [ParagraphType.paragraph]: t('Paragraph'),
      [ParagraphType.h1]: t('Heading 1'),
      [ParagraphType.h2]: t('Heading 2'),
      [ParagraphType.h3]: t('Heading 3'),
      [ParagraphType.h4]: t('Heading 4'),
      [ParagraphType.h5]: t('Heading 5'),
      [ParagraphType.h6]: t('Heading 6'),
      [ParagraphType.li]: t('List item'),
      [ParagraphType.table]: t('Table'),
      [ParagraphType.image]: t('Image'),
    };
    return labels[type] || type;
  };

  return (
    <div ref={containerRef} className={styles.container}>
      <div className={styles.header}>
        <span className={styles.badge}>{t('New')}</span>
        {!isImageType && (
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as ParagraphType)}
            className={styles.typeSelect}
            disabled={saving}
          >
            <option value={ParagraphType.paragraph}>{t('Paragraph')}</option>
            <option value={ParagraphType.h1}>{t('Heading 1')}</option>
            <option value={ParagraphType.h2}>{t('Heading 2')}</option>
            <option value={ParagraphType.h3}>{t('Heading 3')}</option>
            <option value={ParagraphType.h4}>{t('Heading 4')}</option>
            <option value={ParagraphType.h5}>{t('Heading 5')}</option>
            <option value={ParagraphType.h6}>{t('Heading 6')}</option>
            <option value={ParagraphType.li}>{t('List item')}</option>
          </select>
        )}
        {isImageType && (
          <span className={styles.typeLabel}>{getTypeLabel(selectedType)}</span>
        )}
      </div>

      <div className={styles.content}>
        {isImageType ? (
          <div className={styles.imageUploadSection}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
              onChange={handleImageSelect}
              className={styles.fileInput}
              id="inline-image-upload"
              disabled={saving}
            />

            {!imageUpload.preview ? (
              <label htmlFor="inline-image-upload" className={styles.uploadArea}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                <span className={styles.uploadText}>{t('Click to upload image')}</span>
                <span className={styles.uploadHint}>
                  {t('JPEG, PNG, GIF, WebP, SVG (max 5MB)')}
                </span>
              </label>
            ) : (
              <div className={styles.imagePreviewContainer}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUpload.preview}
                  alt={t('Preview')}
                  className={styles.imagePreview}
                />
                <button
                  type="button"
                  onClick={resetImageUpload}
                  className={styles.removeImageButton}
                  title={t('Remove image')}
                  disabled={saving}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}

            {imageUpload.preview && (
              <div className={styles.imageMetaFields}>
                <label className={styles.inputLabel}>
                  {t('Alt text (for accessibility)')}
                  <input
                    type="text"
                    value={imageUpload.alt}
                    onChange={(e) => setImageUpload(prev => ({ ...prev, alt: e.target.value }))}
                    placeholder={t('Describe the image...')}
                    className={styles.textInput}
                    disabled={saving}
                  />
                </label>

                <label className={styles.inputLabel}>
                  {t('Caption (optional)')}
                  <input
                    type="text"
                    value={imageUpload.caption}
                    onChange={(e) => setImageUpload(prev => ({ ...prev, caption: e.target.value }))}
                    placeholder={t('Add a caption...')}
                    className={styles.textInput}
                    disabled={saving}
                  />
                </label>
              </div>
            )}
          </div>
        ) : (
          <TiptapEditor
            content={content}
            onChange={setContent}
            documentId={documentId}
            placeholder={t('Enter content...')}
          />
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={styles.saveButton}
        >
          {saving ? t('Adding...') : t('Add')}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className={styles.cancelButton}
        >
          {t('Cancel')}
        </button>
      </div>
    </div>
  );
}
