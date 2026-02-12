'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { ParagraphType, Collections, Statement } from '@freedi/shared-types';
import { Paragraph } from '@/types';
import TiptapEditor from '@/components/admin/editor/TiptapEditor';
import EditableTitle from '@/components/admin/editor/EditableTitle';
import QuickActionBar from '@/components/admin/editor/QuickActionBar';
import InlineAddContent from '@/components/admin/editor/InlineAddContent';
import GoogleDocsImport from '@/components/import/GoogleDocsImport';
import { useAdminContext } from '../AdminContext';
import { useAutoLogin } from '@/hooks/useAutoLogin';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import {
  createParagraphStatementToDB,
  updateParagraphStatementToDB,
  deleteParagraphStatementToDB,
} from '@/controllers/db/paragraphs/setParagraphStatement';
import styles from './editor.module.scss';

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const statementId = params.statementId as string;
  const { t } = useTranslation();
  const { canManageSettings } = useAdminContext();
  const user = useAutoLogin();

  // Document state
  const [documentTitle, setDocumentTitle] = useState<string>('');
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingParagraph, setEditingParagraph] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editType, setEditType] = useState<ParagraphType>(ParagraphType.paragraph);

  // Add content state - inline instead of modal
  const [isAddingContent, setIsAddingContent] = useState(false);
  const [addContentType, setAddContentType] = useState<ParagraphType>(ParagraphType.paragraph);
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Import section collapsed state
  const [isImportCollapsed, setIsImportCollapsed] = useState(true);

  // File input ref for direct image upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch document title
  useEffect(() => {
    async function fetchDocumentTitle() {
      try {
        const firestore = getFirebaseFirestore();
        const docRef = doc(firestore, Collections.statements, statementId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as Statement;
          setDocumentTitle(data.statement || '');
        }
      } catch (error) {
        console.error('[EditorPage] Error fetching document title:', error);
      }
    }

    fetchDocumentTitle();
  }, [statementId]);

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

        snapshot.forEach((docSnap) => {
          const statement = docSnap.data() as Statement;
          if (!statement.hide) {
            paragraphStatements.push({
              paragraphId: statement.statementId,
              content: statement.statement,
              type: statement.doc?.paragraphType || ParagraphType.paragraph,
              order: statement.doc?.order || 0,
              imageUrl: statement.doc?.imageUrl,
              imageAlt: statement.doc?.imageAlt,
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

  // Handle save paragraph
  const handleSaveParagraph = useCallback(async (paragraphId: string) => {
    if (!user) {
      alert(t('Please wait for authentication...'));
      return;
    }

    setSaving(true);
    try {
      await updateParagraphStatementToDB({
        paragraphId,
        content: editContent,
        type: editType,
      });

      setEditingParagraph(null);
      console.info('[EditorPage] Paragraph updated successfully', { paragraphId });
    } catch (error) {
      console.error('[EditorPage] Save error:', error);
      alert(t('Failed to save'));
    } finally {
      setSaving(false);
    }
  }, [user, editContent, editType, t]);

  // Handle delete paragraph
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
      await deleteParagraphStatementToDB(paragraphId);
      console.info('[EditorPage] Paragraph deleted successfully', { paragraphId });
    } catch (error) {
      console.error('[EditorPage] Delete error:', error);
      alert(t('Failed to delete'));
    } finally {
      setSaving(false);
    }
  }, [user, t]);

  // Handle add content from QuickActionBar
  const handleAddContent = useCallback((type: ParagraphType) => {
    setAddContentType(type);
    setInsertAtIndex(paragraphs.length); // Add at end by default
    setIsAddingContent(true);
  }, [paragraphs.length]);

  // Handle add image - opens file picker directly
  const handleAddImage = useCallback(() => {
    setAddContentType(ParagraphType.image);
    setInsertAtIndex(paragraphs.length);
    setIsAddingContent(true);
  }, [paragraphs.length]);

  // Handle insert at specific position
  const handleInsertAt = useCallback((index: number) => {
    setAddContentType(ParagraphType.paragraph);
    setInsertAtIndex(index);
    setIsAddingContent(true);
  }, []);

  // Upload image helper
  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
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
  }, [statementId]);

  // Handle save new content
  const handleSaveNewContent = useCallback(async (data: {
    content: string;
    type: ParagraphType;
    imageFile?: File;
    imageAlt?: string;
    imageCaption?: string;
  }) => {
    if (!user) {
      alert(t('Please wait for authentication...'));
      return;
    }

    setSaving(true);
    try {
      let imageUrl: string | undefined;

      // Upload image if provided
      if (data.imageFile) {
        imageUrl = await uploadImage(data.imageFile);
      }

      // Calculate order - insert at position or end
      const order = insertAtIndex !== null ? insertAtIndex : paragraphs.length;

      // Create paragraph
      await createParagraphStatementToDB({
        content: data.content,
        type: data.type,
        order,
        documentId: statementId,
        creator: {
          uid: user.uid,
          displayName: user.displayName || 'Admin',
          email: user.email || '',
          photoURL: user.photoURL || '',
          isAnonymous: user.isAnonymous,
        },
        imageUrl,
        imageAlt: data.imageAlt,
        imageCaption: data.imageCaption,
      });

      // Reset state
      setIsAddingContent(false);
      setInsertAtIndex(null);
      console.info('[EditorPage] Content added successfully');
    } catch (error) {
      console.error('[EditorPage] Add error:', error);
      alert(t('Failed to add'));
    } finally {
      setSaving(false);
    }
  }, [user, uploadImage, insertAtIndex, paragraphs.length, statementId, t]);

  // Handle cancel add
  const handleCancelAdd = useCallback(() => {
    setIsAddingContent(false);
    setInsertAtIndex(null);
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newParagraphs = [...paragraphs];
    const [draggedItem] = newParagraphs.splice(draggedIndex, 1);
    newParagraphs.splice(index, 0, draggedItem);
    setParagraphs(newParagraphs);
    setDraggedIndex(index);
  }, [draggedIndex, paragraphs]);

  const handleDragEnd = useCallback(() => {
    if (draggedIndex === null) return;

    console.info('[EditorPage] Drag ended - reorder not yet implemented', {
      draggedIndex,
      newOrder: paragraphs.map(p => p.paragraphId),
    });

    setDraggedIndex(null);
  }, [draggedIndex, paragraphs]);

  // Edit handlers
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
      {/* Editable Document Title */}
      <header className={styles.header}>
        <EditableTitle
          documentId={statementId}
          initialTitle={documentTitle}
          onTitleChange={setDocumentTitle}
        />
        <p className={styles.subtitle}>
          {t('Edit paragraphs, add images, and reorder content')}
        </p>
      </header>

      {/* Quick Action Bar */}
      <QuickActionBar
        onAddContent={handleAddContent}
        onAddImage={handleAddImage}
        disabled={saving || isAddingContent}
      />

      {/* Collapsible Import Section */}
      <div className={styles.importSection}>
        <button
          type="button"
          className={styles.importToggle}
          onClick={() => setIsImportCollapsed(!isImportCollapsed)}
          aria-expanded={!isImportCollapsed}
        >
          <svg
            className={`${styles.toggleIcon} ${!isImportCollapsed ? styles.open : ''}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          {t('Import from Google Docs')}
        </button>
        {!isImportCollapsed && (
          <div className={styles.importContent}>
            <GoogleDocsImport
              statementId={statementId}
              onImportComplete={handleImportSuccess}
            />
          </div>
        )}
      </div>

      {/* Inline Add Content - when adding at top */}
      {isAddingContent && insertAtIndex === 0 && (
        <InlineAddContent
          documentId={statementId}
          contentType={addContentType}
          onSave={handleSaveNewContent}
          onCancel={handleCancelAdd}
          saving={saving}
        />
      )}

      {/* Paragraphs List */}
      <div className={styles.paragraphsList}>
        {paragraphs.length === 0 && !isAddingContent ? (
          <div className={styles.empty}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className={styles.emptyIcon}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            <p>{t('No content yet')}</p>
            <p className={styles.emptyHint}>
              {t('Use the buttons above to add content, or import from Google Docs')}
            </p>
          </div>
        ) : (
          <>
            {paragraphs.map((paragraph, index) => (
              <div key={paragraph.paragraphId}>
                {/* Insert trigger before first paragraph (if not adding at index 0) */}
                {index === 0 && !(isAddingContent && insertAtIndex === 0) && (
                  <div
                    className={styles.insertTrigger}
                    onClick={() => handleInsertAt(0)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handleInsertAt(0);
                    }}
                  >
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

                {/* Paragraph Item */}
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
                          <option value={ParagraphType.h1}>{t('Heading 1')}</option>
                          <option value={ParagraphType.h2}>{t('Heading 2')}</option>
                          <option value={ParagraphType.h3}>{t('Heading 3')}</option>
                          <option value={ParagraphType.h4}>{t('Heading 4')}</option>
                          <option value={ParagraphType.h5}>{t('Heading 5')}</option>
                          <option value={ParagraphType.h6}>{t('Heading 6')}</option>
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
                {!(isAddingContent && insertAtIndex === index + 1) && (
                  <div
                    className={styles.insertTrigger}
                    onClick={() => handleInsertAt(index + 1)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handleInsertAt(index + 1);
                    }}
                  >
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

                {/* Inline Add Content - when adding at this position */}
                {isAddingContent && insertAtIndex === index + 1 && (
                  <InlineAddContent
                    documentId={statementId}
                    contentType={addContentType}
                    onSave={handleSaveNewContent}
                    onCancel={handleCancelAdd}
                    saving={saving}
                  />
                )}
              </div>
            ))}

            {/* Inline Add Content - when adding at end (and not at a specific index) */}
            {isAddingContent && (insertAtIndex === null || insertAtIndex >= paragraphs.length) && insertAtIndex !== 0 && !(paragraphs.length > 0 && insertAtIndex === paragraphs.length) && (
              <InlineAddContent
                documentId={statementId}
                contentType={addContentType}
                onSave={handleSaveNewContent}
                onCancel={handleCancelAdd}
                saving={saving}
              />
            )}

            {/* Bottom Add Button - shows when not adding */}
            {!isAddingContent && (
              <button
                type="button"
                className={styles.addToEndButton}
                onClick={() => handleAddContent(ParagraphType.paragraph)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t('Add Content')}
              </button>
            )}
          </>
        )}
      </div>

      {/* Hidden file input for direct image selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
        style={{ display: 'none' }}
        aria-hidden="true"
      />
    </div>
  );
}
