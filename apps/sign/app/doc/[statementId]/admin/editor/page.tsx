'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { ParagraphType, Collections, Statement } from '@freedi/shared-types';
import { Paragraph } from '@/types';
import TiptapEditor from '@/components/admin/editor/TiptapEditor';
import GoogleDocsImport from '@/components/import/GoogleDocsImport';
import { useAdminContext } from '../AdminContext';
import { useAutoLogin } from '@/hooks/useAutoLogin';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import {
  createParagraphStatementToDB,
  updateParagraphStatementToDB,
  deleteParagraphStatementToDB,
} from '@/controllers/db/paragraphs/setParagraphStatement';
import styles from './editor.module.scss';

interface ImageUploadState {
  file: File | null;
  preview: string | null;
  alt: string;
  caption: string;
  uploading: boolean;
}

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const statementId = params.statementId as string;
  const { t } = useTranslation();
  const { canManageSettings } = useAdminContext();
  const user = useAutoLogin(); // Auto-login for Firebase Auth

  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingParagraph, setEditingParagraph] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editType, setEditType] = useState<ParagraphType>(ParagraphType.paragraph);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<ParagraphType>(ParagraphType.paragraph);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [imageUpload, setImageUpload] = useState<ImageUploadState>({
    file: null,
    preview: null,
    alt: '',
    caption: '',
    uploading: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real-time listener for paragraphs
  useEffect(() => {
    setLoading(true);

    const firestore = getFirebaseFirestore();
    const q = query(
      collection(firestore, Collections.statements),
      where('parentId', '==', statementId),
      where('doc.isOfficialParagraph', '==', true),
      orderBy('doc.order', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const paragraphStatements: Paragraph[] = [];

        snapshot.forEach((doc) => {
          const statement = doc.data() as Statement;
          if (!statement.hide) {
            paragraphStatements.push({
              paragraphId: statement.statementId,
              content: statement.statement,
              type: statement.doc?.paragraphType || ParagraphType.paragraph,
              order: statement.doc?.order || 0,
            });
          }
        });

        setParagraphs(paragraphStatements);
        setLoading(false);

        console.info('[EditorPage] Paragraphs updated from Firestore', {
          count: paragraphStatements.length,
        });
      },
      (error) => {
        console.error('[EditorPage] Error listening to paragraphs:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [statementId]);

  // Redirect viewers - they cannot access editor
  useEffect(() => {
    if (!canManageSettings) {
      router.replace(`/doc/${statementId}/admin`);
    }
  }, [canManageSettings, router, statementId]);

  const handleSaveParagraph = useCallback(async (paragraphId: string) => {
    if (!user) {
      alert(t('Please wait for authentication...'));
      return;
    }

    setSaving(true);
    try {
      // Update paragraph using direct Firestore write
      await updateParagraphStatementToDB({
        paragraphId,
        content: editContent,
        type: editType,
      });

      // Real-time listener will update UI automatically - no manual state update needed
      setEditingParagraph(null);

      console.info('[EditorPage] Paragraph updated successfully', { paragraphId });
    } catch (error) {
      console.error('[EditorPage] Save error:', error);
      alert(t('Failed to save'));
    } finally {
      setSaving(false);
    }
  }, [user, editContent, editType, t]);

  const handleDeleteParagraph = useCallback(async (paragraphId: string) => {
    if (!confirm(t('Are you sure you want to delete this paragraph?'))) {
      return;
    }

    if (!user) {
      alert(t('Please wait for authentication...'));
      return;
    }

    setSaving(true);
    try {
      // Delete paragraph using direct Firestore write (soft delete)
      await deleteParagraphStatementToDB(paragraphId);

      // Real-time listener will update UI automatically - no manual state update needed

      console.info('[EditorPage] Paragraph deleted successfully', { paragraphId });
    } catch (error) {
      console.error('[EditorPage] Delete error:', error);
      alert(t('Failed to delete'));
    } finally {
      setSaving(false);
    }
  }, [user, t]);

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

    // Create preview
    const preview = URL.createObjectURL(file);
    setImageUpload((prev) => ({ ...prev, file, preview }));
  }, [t]);

  const resetImageUpload = useCallback(() => {
    if (imageUpload.preview) {
      URL.revokeObjectURL(imageUpload.preview);
    }
    setImageUpload({
      file: null,
      preview: null,
      alt: '',
      caption: '',
      uploading: false,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [imageUpload.preview]);

  const uploadImage = useCallback(async (): Promise<string | null> => {
    if (!imageUpload.file) return null;

    const formData = new FormData();
    formData.append('file', imageUpload.file);
    formData.append('documentId', statementId);

    const response = await fetch('/api/admin/upload', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    return result.url;
  }, [imageUpload.file, statementId]);

  const handleAddParagraph = useCallback(async () => {
    // For image type, require a file
    if (newType === ParagraphType.image) {
      if (!imageUpload.file) {
        alert(t('Please select an image'));
        return;
      }
    } else if (!newContent.trim()) {
      alert(t('Content is required'));
      return;
    }

    if (!user) {
      alert(t('Please wait for authentication...'));
      return;
    }

    setSaving(true);
    try {
      let imageUrl: string | undefined;

      // Upload image if it's an image paragraph
      if (newType === ParagraphType.image && imageUpload.file) {
        setImageUpload((prev) => ({ ...prev, uploading: true }));
        const url = await uploadImage();
        if (!url) {
          throw new Error('Failed to upload image');
        }
        imageUrl = url;
      }

      // Create paragraph using direct Firestore write
      const paragraphId = await createParagraphStatementToDB({
        content: newType === ParagraphType.image ? '' : newContent,
        type: newType,
        order: paragraphs.length,
        documentId: statementId,
        creator: {
          uid: user.uid,
          displayName: user.displayName || 'Admin',
          email: user.email || '',
          photoURL: user.photoURL || '',
          isAnonymous: user.isAnonymous,
        },
        // Image-specific fields
        imageUrl,
        imageAlt: imageUpload.alt || undefined,
        imageCaption: imageUpload.caption || undefined,
      });

      // Real-time listener will update UI automatically - no manual state update needed
      setShowAddModal(false);
      setNewContent('');
      setNewType(ParagraphType.paragraph);
      resetImageUpload();

      console.info('[EditorPage] Paragraph created successfully', { paragraphId });
    } catch (error) {
      console.error('[EditorPage] Add error:', error);
      alert(t('Failed to add'));
    } finally {
      setSaving(false);
      setImageUpload((prev) => ({ ...prev, uploading: false }));
    }
  }, [user, statementId, newContent, newType, paragraphs.length, t, imageUpload, uploadImage, resetImageUpload]);

  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    // Reorder locally for visual feedback
    const newParagraphs = [...paragraphs];
    const [draggedItem] = newParagraphs.splice(draggedIndex, 1);
    newParagraphs.splice(index, 0, draggedItem);
    setParagraphs(newParagraphs);
    setDraggedIndex(index);
  }, [draggedIndex, paragraphs]);

  const handleDragEnd = useCallback(async () => {
    if (draggedIndex === null) return;

    // TODO: Implement reorder using direct Firestore batch updates
    // For now, just reset draggedIndex
    // The real-time listener will handle updates automatically

    console.info('[EditorPage] Drag ended - reorder not yet implemented', {
      draggedIndex,
      newOrder: paragraphs.map(p => p.paragraphId),
    });

    setDraggedIndex(null);
  }, [draggedIndex, paragraphs]);

  const startEditing = useCallback((paragraph: Paragraph) => {
    setEditingParagraph(paragraph.paragraphId);
    setEditContent(paragraph.content);
    setEditType(paragraph.type);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingParagraph(null);
    setEditContent('');
  }, []);

  const handleImportSuccess = useCallback(() => {
    // Real-time listener will automatically update paragraphs
    console.info('[EditorPage] Import completed - waiting for real-time updates');
  }, []);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('Loading...')}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>{t('Content Editor')}</h1>
        <p>{t('Edit paragraphs, add images, and reorder content')}</p>
      </header>

      {/* Import Section */}
      <div className={styles.importSection}>
        <GoogleDocsImport
          statementId={statementId}
          onImportComplete={handleImportSuccess}
        />
      </div>

      {/* Paragraphs List */}
      <div className={styles.paragraphsList}>
        {paragraphs.length === 0 ? (
          <div className={styles.empty}>
            <p>{t('No content yet. Add a paragraph or import from Google Docs.')}</p>
            <button
              type="button"
              className={styles.emptyAddButton}
              onClick={() => setShowAddModal(true)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('Add Paragraph')}
            </button>
          </div>
        ) : (
          <>
            {paragraphs.map((paragraph, index) => (
              <div key={paragraph.paragraphId}>
                {/* Insert trigger before first paragraph */}
                {index === 0 && (
                  <div className={styles.insertTrigger} onClick={() => setShowAddModal(true)}>
                    <span className={styles.insertLine} />
                    <span className={styles.insertIcon}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </span>
                    <span className={styles.insertLine} />
                  </div>
                )}

                <div
                  className={`${styles.paragraphItem} ${draggedIndex === index ? styles.dragging : ''}`}
                  draggable={editingParagraph !== paragraph.paragraphId}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                >
                  {/* Drag Handle */}
                  <div className={styles.dragHandle} title={t('Drag to reorder')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="9" cy="6" r="1.5" />
                      <circle cx="15" cy="6" r="1.5" />
                      <circle cx="9" cy="12" r="1.5" />
                      <circle cx="15" cy="12" r="1.5" />
                      <circle cx="9" cy="18" r="1.5" />
                      <circle cx="15" cy="18" r="1.5" />
                    </svg>
                  </div>

                  {/* Paragraph Content */}
                  <div className={styles.paragraphContent}>
                    {editingParagraph === paragraph.paragraphId ? (
                      <div className={styles.editMode}>
                        <select
                          value={editType}
                          onChange={(e) => setEditType(e.target.value as ParagraphType)}
                          className={styles.typeSelect}
                        >
                          <option value={ParagraphType.paragraph}>{t('Paragraph')}</option>
                          <option value={ParagraphType.h1}>{t('Heading')} 1</option>
                          <option value={ParagraphType.h2}>{t('Heading')} 2</option>
                          <option value={ParagraphType.h3}>{t('Heading')} 3</option>
                          <option value={ParagraphType.h4}>{t('Heading')} 4</option>
                          <option value={ParagraphType.h5}>{t('Heading')} 5</option>
                          <option value={ParagraphType.h6}>{t('Heading')} 6</option>
                          <option value={ParagraphType.li}>{t('List item')}</option>
                          <option value={ParagraphType.image}>{t('Image')}</option>
                        </select>
                        <TiptapEditor
                          content={editContent}
                          onChange={setEditContent}
                          documentId={statementId}
                          placeholder={t('Enter content...')}
                        />
                        <div className={styles.editActions}>
                          <button
                            type="button"
                            onClick={() => handleSaveParagraph(paragraph.paragraphId)}
                            disabled={saving}
                            className={styles.saveButton}
                          >
                            {saving ? t('Saving...') : t('Save')}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className={styles.cancelButton}
                          >
                            {t('Cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.viewMode}>
                        <span className={styles.typeLabel}>{paragraph.type}</span>
                        {paragraph.type === ParagraphType.image ? (
                          paragraph.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={paragraph.imageUrl}
                              alt={paragraph.imageAlt || t('Document image')}
                              className={styles.previewImage}
                            />
                          )
                        ) : (
                          <div
                            className={styles.preview}
                            dangerouslySetInnerHTML={{ __html: paragraph.content }}
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {editingParagraph !== paragraph.paragraphId && (
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        onClick={() => startEditing(paragraph)}
                        className={styles.editButton}
                        title={t('Edit')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteParagraph(paragraph.paragraphId)}
                        className={styles.deleteButton}
                        title={t('Delete')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Insert trigger after each paragraph */}
                <div className={styles.insertTrigger} onClick={() => setShowAddModal(true)}>
                  <span className={styles.insertLine} />
                  <span className={styles.insertIcon}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </span>
                  <span className={styles.insertLine} />
                </div>
              </div>
            ))}

            {/* Bottom Add Button */}
            <button
              type="button"
              className={styles.addToEndButton}
              onClick={() => setShowAddModal(true)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('Add Paragraph')}
            </button>
          </>
        )}
      </div>

      {/* Add Paragraph Modal */}
      {showAddModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>{t('Add Paragraph')}</h2>
            <div className={styles.modalContent}>
              <label>
                {t('Type')}
                <select
                  value={newType}
                  onChange={(e) => {
                    const type = e.target.value as ParagraphType;
                    setNewType(type);
                    if (type !== ParagraphType.image) {
                      resetImageUpload();
                    }
                  }}
                  className={styles.typeSelect}
                >
                  <option value={ParagraphType.paragraph}>{t('Paragraph')}</option>
                  <option value={ParagraphType.h1}>{t('Heading')} 1</option>
                  <option value={ParagraphType.h2}>{t('Heading')} 2</option>
                  <option value={ParagraphType.h3}>{t('Heading')} 3</option>
                  <option value={ParagraphType.h4}>{t('Heading')} 4</option>
                  <option value={ParagraphType.h5}>{t('Heading')} 5</option>
                  <option value={ParagraphType.h6}>{t('Heading')} 6</option>
                  <option value={ParagraphType.li}>{t('List item')}</option>
                  <option value={ParagraphType.image}>{t('Image')}</option>
                </select>
              </label>

              {newType === ParagraphType.image ? (
                <div className={styles.imageUploadSection}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                    onChange={handleImageSelect}
                    className={styles.fileInput}
                    id="image-upload"
                  />
                  {!imageUpload.preview ? (
                    <label htmlFor="image-upload" className={styles.uploadArea}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                      <span>{t('Click to upload image')}</span>
                      <span className={styles.uploadHint}>{t('JPEG, PNG, GIF, WebP, SVG (max 5MB)')}</span>
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
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  )}

                  <label className={styles.inputLabel}>
                    {t('Alt text (for accessibility)')}
                    <input
                      type="text"
                      value={imageUpload.alt}
                      onChange={(e) => setImageUpload((prev) => ({ ...prev, alt: e.target.value }))}
                      placeholder={t('Describe the image...')}
                      className={styles.textInput}
                    />
                  </label>

                  <label className={styles.inputLabel}>
                    {t('Caption (optional)')}
                    <input
                      type="text"
                      value={imageUpload.caption}
                      onChange={(e) => setImageUpload((prev) => ({ ...prev, caption: e.target.value }))}
                      placeholder={t('Add a caption...')}
                      className={styles.textInput}
                    />
                  </label>
                </div>
              ) : (
                <label>
                  {t('Content')}
                  <TiptapEditor
                    content={newContent}
                    onChange={setNewContent}
                    documentId={statementId}
                    placeholder={t('Enter content...')}
                  />
                </label>
              )}
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={handleAddParagraph}
                disabled={saving || imageUpload.uploading}
                className={styles.saveButton}
              >
                {imageUpload.uploading ? t('Uploading...') : saving ? t('Adding...') : t('Add')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetImageUpload();
                }}
                className={styles.cancelButton}
              >
                {t('Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
