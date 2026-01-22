'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Paragraph, ParagraphType } from '@/types';
import styles from './ImageAltWarning.module.scss';

interface ImageWithoutAlt {
  paragraphId: string;
  imageUrl: string;
  imageCaption?: string;
  order: number;
}

interface ImageAltWarningProps {
  paragraphs: Paragraph[];
  documentId: string;
  onAltTextSaved?: (paragraphId: string, altText: string) => void;
}

export default function ImageAltWarning({
  paragraphs,
  documentId,
  onAltTextSaved,
}: ImageAltWarningProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [altText, setAltText] = useState('');
  const [saving, setSaving] = useState(false);

  // Find images without alt text
  const imagesWithoutAlt: ImageWithoutAlt[] = paragraphs
    .filter(
      (p) =>
        p.type === ParagraphType.image &&
        p.imageUrl &&
        (!p.imageAlt || p.imageAlt.trim() === '')
    )
    .map((p, index) => ({
      paragraphId: p.paragraphId,
      imageUrl: p.imageUrl || '',
      imageCaption: p.imageCaption,
      order: index + 1,
    }));

  if (imagesWithoutAlt.length === 0) {
    return null;
  }

  const handleEditClick = (image: ImageWithoutAlt) => {
    setEditingId(image.paragraphId);
    setAltText('');
  };

  const handleSave = async (paragraphId: string) => {
    if (!altText.trim()) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/paragraphs/${paragraphId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId,
          imageAlt: altText.trim(),
        }),
      });

      if (response.ok) {
        onAltTextSaved?.(paragraphId, altText.trim());
        setEditingId(null);
        setAltText('');
      }
    } catch (error) {
      console.error('Failed to save alt text:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setAltText('');
  };

  return (
    <div className={styles.warning}>
      <div className={styles.header}>
        <div className={styles.iconWrapper}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div className={styles.headerText}>
          <h3 className={styles.title}>{t('Missing Alt Text')}</h3>
          <p className={styles.subtitle}>
            {imagesWithoutAlt.length === 1
              ? t('1 image is missing alt text')
              : `${imagesWithoutAlt.length} ${t('images are missing alt text')}`}
          </p>
        </div>
      </div>

      <p className={styles.description}>
        {t('Alt text is required for accessibility. Screen readers use alt text to describe images to visually impaired users.')}
      </p>

      <ul className={styles.imageList}>
        {imagesWithoutAlt.map((image) => (
          <li key={image.paragraphId} className={styles.imageItem}>
            <div className={styles.imagePreview}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.imageUrl}
                alt={t('Image without alt text')}
                className={styles.thumbnail}
              />
            </div>
            <div className={styles.imageInfo}>
              <span className={styles.imageCaption}>
                {image.imageCaption || `${t('Image')} ${image.order}`}
              </span>
              {editingId === image.paragraphId ? (
                <div className={styles.editForm}>
                  <input
                    type="text"
                    value={altText}
                    onChange={(e) => setAltText(e.target.value)}
                    placeholder={t('Enter alt text description...')}
                    className={styles.altInput}
                    autoFocus
                    disabled={saving}
                  />
                  <div className={styles.editActions}>
                    <button
                      type="button"
                      onClick={() => handleSave(image.paragraphId)}
                      disabled={saving || !altText.trim()}
                      className={styles.saveButton}
                    >
                      {saving ? t('Saving...') : t('Save')}
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
              ) : (
                <button
                  type="button"
                  onClick={() => handleEditClick(image)}
                  className={styles.addButton}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {t('Add Alt Text')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
