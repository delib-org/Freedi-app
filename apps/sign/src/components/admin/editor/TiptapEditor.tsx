'use client';

import { useCallback, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './TiptapEditor.module.scss';

// Extend Image to support alignment and width
const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'center',
        parseHTML: element => element.getAttribute('data-align') || element.style.textAlign || 'center',
        renderHTML: attributes => {
          return {
            'data-align': attributes.align,
            style: `display: block; margin-left: ${attributes.align === 'left' ? '0' : 'auto'}; margin-right: ${attributes.align === 'right' ? '0' : 'auto'};`,
          };
        },
      },
      width: {
        default: '100%',
        parseHTML: element => element.getAttribute('width') || element.style.width || '100%',
        renderHTML: attributes => {
          return {
            width: attributes.width,
            style: `width: ${attributes.width}; max-width: 100%;`,
          };
        },
      },
    };
  },
});

interface TiptapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  documentId: string;
  onImageUpload?: (url: string) => void;
}

export default function TiptapEditor({
  content,
  onChange,
  placeholder = 'Start typing...',
  documentId,
  onImageUpload,
}: TiptapEditorProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImageSelected, setIsImageSelected] = useState(false);
  const [imageAttrs, setImageAttrs] = useState<{ align: string; width: string }>({ align: 'center', width: '100%' });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Underline,
      CustomImage.configure({
        HTMLAttributes: {
          class: styles.editorImage,
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      const isImage = editor.isActive('image');
      setIsImageSelected(isImage);
      if (isImage) {
        const attrs = editor.getAttributes('image');
        setImageAttrs({
          align: attrs.align || 'center',
          width: attrs.width || '100%',
        });
      }
    },
  });

  const handleImageUpload = useCallback(async (file: File) => {
    if (!editor) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentId', documentId);

    try {
      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success && data.url) {
        editor.chain().focus().setImage({ src: data.url, alt: '' } as { src: string; alt?: string }).run();
        onImageUpload?.(data.url);
      } else {
        console.error('Upload failed:', data.error);
        alert(data.error || t('Failed to upload image'));
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert(t('Failed to upload image'));
    }
  }, [editor, documentId, onImageUpload, t]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
    e.target.value = '';
  }, [handleImageUpload]);

  const triggerImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const setImageAlign = useCallback((align: 'left' | 'center' | 'right') => {
    if (!editor) return;
    editor.chain().focus().updateAttributes('image', { align }).run();
    setImageAttrs(prev => ({ ...prev, align }));
  }, [editor]);

  const setImageWidth = useCallback((width: string) => {
    if (!editor) return;
    editor.chain().focus().updateAttributes('image', { width }).run();
    setImageAttrs(prev => ({ ...prev, width }));
  }, [editor]);

  const deleteImage = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().deleteSelection().run();
    setIsImageSelected(false);
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={styles.editorContainer}>
      {/* Main Toolbar */}
      <div className={styles.toolbar}>
        {/* Text formatting */}
        <div className={styles.toolbarGroup}>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive('bold') ? styles.active : ''}
            title={t('Bold')}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive('italic') ? styles.active : ''}
            title={t('Italic')}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={editor.isActive('underline') ? styles.active : ''}
            title={t('Underline')}
          >
            <u>U</u>
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={editor.isActive('strike') ? styles.active : ''}
            title={t('Strikethrough')}
          >
            <s>S</s>
          </button>
        </div>

        {/* Headings */}
        <div className={styles.toolbarGroup}>
          <select
            value={
              editor.isActive('heading', { level: 1 }) ? '1' :
              editor.isActive('heading', { level: 2 }) ? '2' :
              editor.isActive('heading', { level: 3 }) ? '3' :
              editor.isActive('heading', { level: 4 }) ? '4' :
              editor.isActive('heading', { level: 5 }) ? '5' :
              editor.isActive('heading', { level: 6 }) ? '6' : 'p'
            }
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'p') {
                editor.chain().focus().setParagraph().run();
              } else {
                const level = parseInt(value) as 1 | 2 | 3 | 4 | 5 | 6;
                editor.chain().focus().toggleHeading({ level }).run();
              }
            }}
            className={styles.headingSelect}
          >
            <option value="p">{t('Paragraph')}</option>
            <option value="1">{t('Heading')} 1</option>
            <option value="2">{t('Heading')} 2</option>
            <option value="3">{t('Heading')} 3</option>
            <option value="4">{t('Heading')} 4</option>
            <option value="5">{t('Heading')} 5</option>
            <option value="6">{t('Heading')} 6</option>
          </select>
        </div>

        {/* Lists */}
        <div className={styles.toolbarGroup}>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={editor.isActive('bulletList') ? styles.active : ''}
            title={t('Bullet list')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="9" y1="6" x2="20" y2="6" />
              <line x1="9" y1="12" x2="20" y2="12" />
              <line x1="9" y1="18" x2="20" y2="18" />
              <circle cx="4" cy="6" r="2" fill="currentColor" />
              <circle cx="4" cy="12" r="2" fill="currentColor" />
              <circle cx="4" cy="18" r="2" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={editor.isActive('orderedList') ? styles.active : ''}
            title={t('Numbered list')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="10" y1="6" x2="21" y2="6" />
              <line x1="10" y1="12" x2="21" y2="12" />
              <line x1="10" y1="18" x2="21" y2="18" />
              <text x="2" y="8" fontSize="8" fill="currentColor">1</text>
              <text x="2" y="14" fontSize="8" fill="currentColor">2</text>
              <text x="2" y="20" fontSize="8" fill="currentColor">3</text>
            </svg>
          </button>
        </div>

        {/* Image */}
        <div className={styles.toolbarGroup}>
          <button
            type="button"
            onClick={triggerImageUpload}
            title={t('Add image')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21,15 16,10 5,21" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
            onChange={handleFileSelect}
            className={styles.hiddenInput}
          />
        </div>

        {/* Undo/Redo */}
        <div className={styles.toolbarGroup}>
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title={t('Undo')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title={t('Redo')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 7v6h-6" />
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image Toolbar - shown when image is selected */}
      {isImageSelected && (
        <div className={styles.imageToolbar}>
          <span className={styles.imageToolbarLabel}>{t('Image')}:</span>

          {/* Alignment */}
          <div className={styles.toolbarGroup}>
            <button
              type="button"
              onClick={() => setImageAlign('left')}
              className={imageAttrs.align === 'left' ? styles.active : ''}
              title={t('Align left')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="15" y2="12" />
                <line x1="3" y1="18" x2="18" y2="18" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setImageAlign('center')}
              className={imageAttrs.align === 'center' ? styles.active : ''}
              title={t('Align center')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="6" y1="12" x2="18" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setImageAlign('right')}
              className={imageAttrs.align === 'right' ? styles.active : ''}
              title={t('Align right')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="9" y1="12" x2="21" y2="12" />
                <line x1="6" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>

          {/* Width */}
          <div className={styles.toolbarGroup}>
            <select
              value={imageAttrs.width}
              onChange={(e) => setImageWidth(e.target.value)}
              className={styles.widthSelect}
              title={t('Image width')}
            >
              <option value="25%">25%</option>
              <option value="50%">50%</option>
              <option value="75%">75%</option>
              <option value="100%">100%</option>
            </select>
          </div>

          {/* Delete */}
          <div className={styles.toolbarGroup}>
            <button
              type="button"
              onClick={deleteImage}
              className={styles.deleteButton}
              title={t('Delete image')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Editor Content */}
      <EditorContent editor={editor} className={styles.editorContent} />
    </div>
  );
}
