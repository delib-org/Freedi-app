'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { uploadFile, subscribeToAuthState } from '@/lib/firebase/client';
import { User } from 'firebase/auth';
import { logError } from '@/lib/utils/errorHandling';
import styles from './LogoUpload.module.scss';

interface LogoUploadProps {
  documentId: string;
  currentLogoUrl: string;
  onLogoChange: (url: string) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];

export default function LogoUpload({ documentId, currentLogoUrl, onLogoChange }: LogoUploadProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>(currentLogoUrl);
  const [authUser, setAuthUser] = useState<User | null>(null);

  // Subscribe to Firebase Auth state
  useEffect(() => {
    const unsubscribe = subscribeToAuthState((user) => {
      setAuthUser(user);
    });

    return () => unsubscribe();
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return t('Invalid file type. Please upload PNG, JPG, SVG, or WebP.');
    }
    if (file.size > MAX_FILE_SIZE) {
      return t('File too large. Maximum size is 5MB.');
    }

    return null;
  }, [t]);

  const handleUpload = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);

      return;
    }

    // Check if user is authenticated via Firebase Auth
    if (!authUser) {
      setError(t('Please sign in to upload a logo.'));

      return;
    }

    setError(null);
    setIsUploading(true);
    setUploadProgress(0);

    // Create local preview
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);

    try {
      const timestamp = Date.now();
      const extension = file.name.split('.').pop() || 'png';
      const path = `logos/${documentId}/${timestamp}.${extension}`;

      const downloadUrl = await uploadFile(file, path, (progress) => {
        setUploadProgress(progress);
      });

      // Clean up local preview
      URL.revokeObjectURL(localPreview);

      setPreviewUrl(downloadUrl);
      onLogoChange(downloadUrl);
    } catch (err) {
      logError(err, {
        operation: 'LogoUpload.handleUpload',
        documentId,
      });
      setError(t('Failed to upload logo. Please try again.'));
      setPreviewUrl(currentLogoUrl);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [documentId, currentLogoUrl, onLogoChange, validateFile, t, authUser]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleUpload]);

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer.files[0];
    if (file) {
      handleUpload(file);
    }
  }, [handleUpload]);

  const handleClick = useCallback(() => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  }, [isUploading]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if ((event.key === 'Enter' || event.key === ' ') && !isUploading) {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  }, [isUploading]);

  return (
    <div className={styles.logoUpload}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        onChange={handleFileSelect}
        className={styles.hiddenInput}
        aria-label={t('Upload logo')}
      />

      <div
        className={`${styles.dropZone} ${isDragging ? styles.dragging : ''} ${isUploading ? styles.uploading : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        aria-label={t('Drop logo here or click to upload')}
      >
        {previewUrl ? (
          <div className={styles.preview}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={t('Logo preview')}
              className={styles.previewImage}
              onError={() => setPreviewUrl('')}
            />
            {!isUploading && (
              <div className={styles.overlay}>
                <span className={styles.overlayText}>{t('Click or drop to replace')}</span>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.placeholder}>
            <svg
              className={styles.uploadIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17,8 12,3 7,8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className={styles.placeholderText}>
              {isDragging ? t('Drop image here') : t('Drag & drop logo or click to upload')}
            </p>
            <p className={styles.hint}>{t('PNG, JPG, SVG, or WebP (max 5MB)')}</p>
          </div>
        )}

        {isUploading && (
          <div className={styles.progressOverlay}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className={styles.progressText}>
              {t('Uploading...')} {Math.round(uploadProgress)}%
            </span>
          </div>
        )}
      </div>

      {error && (
        <p className={styles.error} role="alert">{error}</p>
      )}
    </div>
  );
}
