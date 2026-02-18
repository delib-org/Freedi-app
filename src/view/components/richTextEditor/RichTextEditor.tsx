import React, { useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Paragraph, ParagraphType } from '@freedi/shared-types';
import { generateParagraphId, sortParagraphs } from '@/utils/paragraphUtils';
import EditorToolbar from './EditorToolbar';
import styles from './RichTextEditor.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface RichTextEditorProps {
	paragraphs: Paragraph[];
	onSave: (paragraphs: Paragraph[]) => Promise<void>;
	onCancel: () => void;
	placeholder?: string;
	isLoading?: boolean;
}

// TipTap node types for type safety
interface TipTapNode {
	type: string;
	content?: TipTapNode[];
	text?: string;
	attrs?: Record<string, unknown>;
}

/**
 * Convert TipTap JSON to Paragraph array
 */
function editorToParagraphs(json: Record<string, unknown>): Paragraph[] {
	const content = json.content as TipTapNode[];

	if (!content) return [];

	const paragraphs: Paragraph[] = [];
	let order = 0;
	let currentListType: 'ul' | 'ol' | undefined;

	for (const node of content) {
		if (node.type === 'bulletList') {
			currentListType = 'ul';
			const items = node.content || [];
			for (const item of items) {
				if (item.type === 'listItem') {
					const textContent = extractTextFromNode(item);
					if (textContent) {
						paragraphs.push({
							paragraphId: generateParagraphId(),
							type: ParagraphType.li,
							content: textContent,
							order: order++,
							listType: 'ul',
						});
					}
				}
			}
			currentListType = undefined;
		} else if (node.type === 'orderedList') {
			currentListType = 'ol';
			const items = node.content || [];
			for (const item of items) {
				if (item.type === 'listItem') {
					const textContent = extractTextFromNode(item);
					if (textContent) {
						paragraphs.push({
							paragraphId: generateParagraphId(),
							type: ParagraphType.li,
							content: textContent,
							order: order++,
							listType: 'ol',
						});
					}
				}
			}
			currentListType = undefined;
		} else {
			const textContent = extractTextFromNode(node);
			if (textContent || node.type !== 'paragraph') {
				let type = mapNodeTypeToParagraphType(node.type);

				// Handle heading levels from attrs
				if (node.type === 'heading' && node.attrs?.level) {
					const level = node.attrs.level as number;
					switch (level) {
						case 1:
							type = ParagraphType.h1;
							break;
						case 2:
							type = ParagraphType.h2;
							break;
						case 3:
							type = ParagraphType.h3;
							break;
						case 4:
							type = ParagraphType.h4;
							break;
						case 5:
							type = ParagraphType.h5;
							break;
						case 6:
							type = ParagraphType.h6;
							break;
						default:
							type = ParagraphType.h1;
					}
				}

				paragraphs.push({
					paragraphId: generateParagraphId(),
					type,
					content: textContent || '',
					order: order++,
					...(currentListType ? { listType: currentListType } : {}),
				});
			}
		}
	}

	return paragraphs;
}

/**
 * Extract text content from a TipTap node
 */
function extractTextFromNode(node: TipTapNode): string {
	if (!node.content) return '';

	return node.content
		.map((child) => {
			if (child.type === 'text') return child.text || '';
			if (child.type === 'paragraph' && child.content) {
				return extractTextFromNode(child);
			}

			return '';
		})
		.join('');
}

/**
 * Map TipTap node type to ParagraphType
 */
function mapNodeTypeToParagraphType(nodeType: string): ParagraphType {
	switch (nodeType) {
		case 'heading':
			return ParagraphType.h1; // Will be overridden by level
		case 'paragraph':
			return ParagraphType.paragraph;
		case 'listItem':
			return ParagraphType.li;
		default:
			return ParagraphType.paragraph;
	}
}

/**
 * Convert Paragraph array to TipTap JSON
 */
function paragraphsToEditor(paragraphs: Paragraph[]): Record<string, unknown> {
	const sorted = sortParagraphs(paragraphs);
	const content: Array<Record<string, unknown>> = [];
	let currentList: { type: string; content: Array<Record<string, unknown>> } | null = null;
	let currentListType: 'ul' | 'ol' | undefined;

	for (const para of sorted) {
		if (para.type === ParagraphType.li) {
			const listType = para.listType || 'ul';
			const tipTapListType = listType === 'ol' ? 'orderedList' : 'bulletList';

			// Start new list or continue existing
			if (!currentList || currentListType !== listType) {
				if (currentList) {
					content.push(currentList);
				}
				currentList = { type: tipTapListType, content: [] };
				currentListType = listType;
			}

			currentList.content.push({
				type: 'listItem',
				content: [
					{
						type: 'paragraph',
						content: para.content ? [{ type: 'text', text: para.content }] : [],
					},
				],
			});
		} else {
			// Close any open list
			if (currentList) {
				content.push(currentList);
				currentList = null;
				currentListType = undefined;
			}

			const node = paragraphTypeToNode(para);
			content.push(node);
		}
	}

	// Close any remaining list
	if (currentList) {
		content.push(currentList);
	}

	// If empty, add a default paragraph
	if (content.length === 0) {
		content.push({
			type: 'paragraph',
			content: [],
		});
	}

	return { type: 'doc', content };
}

/**
 * Convert a single Paragraph to TipTap node
 */
function paragraphTypeToNode(para: Paragraph): Record<string, unknown> {
	const textContent = para.content ? [{ type: 'text', text: para.content }] : [];

	switch (para.type) {
		case ParagraphType.h1:
			return { type: 'heading', attrs: { level: 1 }, content: textContent };
		case ParagraphType.h2:
			return { type: 'heading', attrs: { level: 2 }, content: textContent };
		case ParagraphType.h3:
			return { type: 'heading', attrs: { level: 3 }, content: textContent };
		case ParagraphType.h4:
			return { type: 'heading', attrs: { level: 4 }, content: textContent };
		case ParagraphType.h5:
			return { type: 'heading', attrs: { level: 5 }, content: textContent };
		case ParagraphType.h6:
			return { type: 'heading', attrs: { level: 6 }, content: textContent };
		default:
			return { type: 'paragraph', content: textContent };
	}
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({
	paragraphs,
	onSave,
	onCancel,
	placeholder = 'Start typing...',
	isLoading = false,
}) => {
	const { t } = useTranslation();

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: {
					levels: [1, 2, 3, 4, 5, 6],
				},
			}),
			Placeholder.configure({
				placeholder,
			}),
		],
		content: paragraphsToEditor(paragraphs),
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

	return (
		<div className={styles.editor}>
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
