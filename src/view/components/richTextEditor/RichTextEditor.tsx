import React, { useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Paragraph } from '@freedi/shared-types';
import { editorToParagraphs, paragraphsToEditor } from './editorSerialization';
import EditorToolbar from './EditorToolbar';
import styles from './RichTextEditor.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import clsx from 'clsx';

interface RichTextEditorProps {
	paragraphs: Paragraph[];
	onSave: (paragraphs: Paragraph[]) => Promise<void>;
	onCancel: () => void;
	placeholder?: string;
	isLoading?: boolean;
	compact?: boolean;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({
	paragraphs,
	onSave,
	onCancel,
	placeholder = 'Start typing...',
	isLoading = false,
	compact = false,
}) => {
	const { t } = useTranslation();

	const editor = useEditor({
		extensions: [
			// Only headings, lists, and bold/italic survive the Paragraph model —
			// other marks (links, strike, code…) are stripped on save, so disable them
			StarterKit.configure({
				heading: {
					levels: [1, 2, 3, 4, 5, 6],
				},
				strike: false,
				code: false,
				codeBlock: false,
				blockquote: false,
				horizontalRule: false,
				link: false,
				underline: false,
			}),
			Placeholder.configure({
				placeholder,
			}),
		],
		content: paragraphsToEditor(paragraphs),
		autofocus: 'end',
		editorProps: {
			attributes: {
				class: 'rich-text-editor__prose',
			},
		},
	});

	// Update editor content when paragraphs change
	useEffect(() => {
		if (editor && paragraphs) {
			const newContent = paragraphsToEditor(paragraphs);
			const currentContent = editor.getJSON();

			// Only update if content actually changed
			if (JSON.stringify(newContent) !== JSON.stringify(currentContent)) {
				editor.commands.setContent(newContent);
			}
		}
	}, [editor, paragraphs]);

	const handleSave = useCallback(async () => {
		if (!editor) return;

		const json = editor.getJSON();
		const newParagraphs = editorToParagraphs(json as Record<string, unknown>);

		// Preserve existing paragraph IDs where content matches
		const mergedParagraphs = newParagraphs.map((newPara, index) => {
			const existingPara = paragraphs[index];
			if (existingPara && existingPara.content === newPara.content) {
				return { ...newPara, paragraphId: existingPara.paragraphId };
			}

			return newPara;
		});

		await onSave(mergedParagraphs);
	}, [editor, onSave, paragraphs]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Escape' && !isLoading) {
				e.stopPropagation();
				onCancel();
			}
		},
		[isLoading, onCancel],
	);

	return (
		<div className={clsx(styles.editor, compact && styles.editorCompact)} onKeyDown={handleKeyDown}>
			<EditorToolbar editor={editor} />

			<div className={styles.content}>
				<EditorContent editor={editor} />
			</div>

			<div className={styles.actions}>
				<button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={isLoading}>
					{t('Cancel')}
				</button>
				<button
					type="button"
					className={styles.saveBtn}
					onClick={handleSave}
					disabled={isLoading || !editor}
				>
					{isLoading ? t('Saving...') : t('Save')}
				</button>
			</div>
		</div>
	);
};

export default RichTextEditor;
