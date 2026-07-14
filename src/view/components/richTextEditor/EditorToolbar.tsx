import React from 'react';
import { Editor } from '@tiptap/react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './RichTextEditor.module.scss';
import clsx from 'clsx';

interface EditorToolbarProps {
	editor: Editor | null;
}

interface ToolbarButtonProps {
	onClick: () => void;
	isActive?: boolean;
	disabled?: boolean;
	title: string;
	children: React.ReactNode;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
	onClick,
	isActive = false,
	disabled = false,
	title,
	children,
}) => (
	<button
		type="button"
		onClick={onClick}
		disabled={disabled}
		title={title}
		aria-label={title}
		className={clsx(styles.toolbarButton, {
			[styles.toolbarButtonActive]: isActive,
		})}
	>
		{children}
	</button>
);

const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor }) => {
	const { t } = useTranslation();

	if (!editor) return null;

	return (
		<div className={styles.toolbar}>
			<ToolbarButton
				onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
				isActive={editor.isActive('heading')}
				title={t('Heading')}
			>
				H
			</ToolbarButton>
			<ToolbarButton
				onClick={() => editor.chain().focus().toggleBulletList().run()}
				isActive={editor.isActive('bulletList')}
				title={t('Bullet list')}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<line x1="8" y1="6" x2="21" y2="6" />
					<line x1="8" y1="12" x2="21" y2="12" />
					<line x1="8" y1="18" x2="21" y2="18" />
					<circle cx="4" cy="6" r="1" fill="currentColor" />
					<circle cx="4" cy="12" r="1" fill="currentColor" />
					<circle cx="4" cy="18" r="1" fill="currentColor" />
				</svg>
			</ToolbarButton>
			<ToolbarButton
				onClick={() => editor.chain().focus().toggleOrderedList().run()}
				isActive={editor.isActive('orderedList')}
				title={t('Numbered list')}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<line x1="10" y1="6" x2="21" y2="6" />
					<line x1="10" y1="12" x2="21" y2="12" />
					<line x1="10" y1="18" x2="21" y2="18" />
					<text x="4" y="7" fontSize="6" fill="currentColor" stroke="none">
						1
					</text>
					<text x="4" y="13" fontSize="6" fill="currentColor" stroke="none">
						2
					</text>
					<text x="4" y="19" fontSize="6" fill="currentColor" stroke="none">
						3
					</text>
				</svg>
			</ToolbarButton>
		</div>
	);
};

export default EditorToolbar;
