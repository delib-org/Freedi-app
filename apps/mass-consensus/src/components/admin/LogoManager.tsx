'use client';

import React, { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { SurveyLogo } from '@freedi/shared-types';
import clsx from 'clsx';

export interface LogoManagerProps {
  /** Array of logos to display */
  logos: SurveyLogo[];
  /** Callback when logo alt text is updated */
  onUpdateAltText: (logoId: string, altText: string) => void;
  /** Callback when logo is deleted */
  onDeleteLogo: (logoId: string) => void;
  /** Callback when logos are reordered */
  onReorder: (logoIds: string[]) => void;
  /** Class name for custom styling */
  className?: string;
}

export const LogoManager: React.FC<LogoManagerProps> = ({
  logos,
  onUpdateAltText,
  onDeleteLogo,
  onReorder,
  className,
}) => {
  const { t } = useTranslation();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => (e: React.DragEvent): void => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (index: number) => (e: React.DragEvent): void => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault();
  };

  const handleDrop = (index: number) => (e: React.DragEvent): void => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newLogos = [...logos];
    const [removed] = newLogos.splice(draggedIndex, 1);
    newLogos.splice(index, 0, removed);

    const newOrder = newLogos.map((logo) => logo.logoId);
    onReorder(newOrder);

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = (): void => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleAltTextChange = (logoId: string) => (e: React.ChangeEvent<HTMLInputElement>): void => {
    onUpdateAltText(logoId, e.target.value);
  };

  const handleDelete = (logoId: string) => (): void => {
    if (confirm(t('confirmDeleteLogo'))) {
      onDeleteLogo(logoId);
    }
  };

  if (logos.length === 0) {
    return (
      <div className={clsx('logo-manager', className)}>
        <div className="logo-manager__empty">
          {t('noLogosUploaded')}
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('logo-manager', className)}>
      <div className="logo-manager__list">
        {logos.map((logo, index) => {
          const itemClasses = clsx(
            'logo-manager__item',
            draggedIndex === index && 'logo-manager__item--dragging',
            dragOverIndex === index && 'logo-manager__item--drag-over'
          );

          return (
            <div
              key={logo.logoId}
              className={itemClasses}
              draggable
              onDragStart={handleDragStart(index)}
              onDragEnter={handleDragEnter(index)}
              onDragOver={handleDragOver}
              onDrop={handleDrop(index)}
              onDragEnd={handleDragEnd}
            >
              <div className="logo-manager__drag-handle" title={t('dragToReorder')}>
                ⋮⋮
              </div>

              <img
                src={logo.publicUrl}
                alt={logo.altText}
                className="logo-manager__thumbnail"
              />

              <div className="logo-manager__info">
                <input
                  type="text"
                  value={logo.altText}
                  onChange={handleAltTextChange(logo.logoId)}
                  placeholder={t('logoAltText')}
                  className="logo-manager__alt-input"
                  aria-label={t('logoAltText')}
                />

                <div className="logo-manager__metadata">
                  <span>{t('order')}: {index + 1}</span>
                  {logo.width && logo.height && (
                    <span>{logo.width} × {logo.height}px</span>
                  )}
                </div>
              </div>

              <div className="logo-manager__actions">
                <button
                  type="button"
                  onClick={handleDelete(logo.logoId)}
                  className="logo-manager__delete-btn"
                  aria-label={t('deleteLogo')}
                >
                  🗑️
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
