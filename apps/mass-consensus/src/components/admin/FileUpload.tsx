'use client';

import React, { useRef, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import clsx from 'clsx';

export interface FileUploadProps {
  /** Callback when file is selected */
  onFileSelect: (file: File) => void;
  /** Whether upload is in progress */
  uploading?: boolean;
  /** Upload progress (0-100) */
  progress?: number;
  /** Error message */
  error?: string;
  /** Accepted file types */
  accept?: string;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Class name for custom styling */
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  uploading = false,
  progress = 0,
  error,
  accept = 'image/png,image/jpeg,image/jpg,image/svg+xml,image/webp',
  maxSize = 5 * 1024 * 1024, // 5MB
  className,
}) => {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleClick = (): void => {
    inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFile = (file: File): void => {
    // Create preview
    const reader = new FileReader();
    reader.onload = (e): void => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    setSelectedFile(file);
    onFileSelect(file);
  };

  const zoneClasses = clsx(
    'file-upload__zone',
    isDragging && 'file-upload__zone--active',
    error && 'file-upload__zone--error'
  );

  return (
    <div className={clsx('file-upload', className)}>
      <div
        className={zoneClasses}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e): void => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleClick();
          }
        }}
      >
        <div className="file-upload__icon">📤</div>
        <p className="file-upload__text">
          {t('dragDropOrClick')}
        </p>
        <p className="file-upload__hint">
          {t('maxFileSize')}: {Math.round(maxSize / 1024 / 1024)}MB
        </p>
        <p className="file-upload__hint">
          {t('supportedFormats')}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="file-upload__input"
        aria-label={t('uploadFile')}
      />

      {preview && selectedFile && !uploading && !error && (
        <div className="file-upload__preview">
          <img
            src={preview}
            alt={selectedFile.name}
            className="file-upload__preview-image"
          />
          <p className="file-upload__preview-info">
            {selectedFile.name} ({Math.round(selectedFile.size / 1024)}KB)
          </p>
        </div>
      )}

      {uploading && (
        <div className="file-upload__progress">
          <div className="file-upload__progress-bar">
            <div
              className="file-upload__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="file-upload__hint">{t('uploading')}... {progress}%</p>
        </div>
      )}

      {error && (
        <div className="file-upload__error">
          {error}
        </div>
      )}
    </div>
  );
};
