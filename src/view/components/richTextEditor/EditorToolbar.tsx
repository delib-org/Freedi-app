import React from 'react';
import { Editor } from '@tiptap/react';
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
		className={clsx(styles.toolbarButton, {
			[styles.toolbarButtonActive]: isActive,
		})}
	>
		{children}
	</button>
);

const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor }) => {
	if (!editor) return null;

	return (
		<div className={styles.toolbar}>
			{/* Heading buttons */}
			<div className={styles.toolbarGroup}>
				<ToolbarButton
					onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
					isActive={editor.isActive('heading', { level: 1 })}
					title="Heading 1"
				>
					H1
				</ToolbarButton>
				<ToolbarButton
					onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
					isActive={editor.isActive('heading', { level: 2 })}
					title="Heading 2"
				>
					H2
				</ToolbarButton>
				<ToolbarButton
					onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
					isActive={editor.isActive('heading', { level: 3 })}
					title="Heading 3"
				>
					H3
				</ToolbarButton>
				<ToolbarButton
					onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
					isActive={editor.isActive('heading', { level: 4 })}
					title="Heading 4"
				>
					H4
				</ToolbarButton>
				<ToolbarButton
					onClick={() => editor.chain().focus().toggleHeading({ level: 5 }).run()}
					isActive={editor.isActive('heading', { level: 5 })}
					title="Heading 5"
				>
					H5
				</ToolbarButton>
				<ToolbarButton
					onClick={() => editor.chain().focus().toggleHeading({ level: 6 }).run()}
					isActive={editor.isActive('heading', { level: 6 })}
					title="Heading 6"
				>
					H6
				</ToolbarButton>
			</div>

			{/* Paragraph and list buttons */}
			<div className={styles.toolbarGroup}>
				<ToolbarButton
					onClick={() => editor.chain().focus().setParagraph().run()}
					isActive={editor.isActive('paragraph')}
					title="Paragraph"
				>
					P
				</ToolbarButton>
				<ToolbarButton
					onClick={() => editor.chain().focus().toggleBulletList().run()}
					isActive={editor.isActive('bulletList')}
					title="Bullet List"
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
					title="Numbered List"
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

			{/* Undo/Redo */}
			<div className={styles.toolbarGroup}>
				<ToolbarButton
					onClick={() => editor.chain().focus().undo().run()}
					disabled={!editor.can().undo()}
					title="Undo"
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
						<path d="M3 7v6h6" />
						<path d="M3 13a9 9 0 1 0 3-7.7L3 7" />
					</svg>
				</ToolbarButton>
				<ToolbarButton
					onClick={() => editor.chain().focus().redo().run()}
					disabled={!editor.can().redo()}
					title="Redo"
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
						<path d="M21 7v6h-6" />
						<path d="M21 13a9 9 0 1 1-3-7.7l3 2.7" />
					</svg>
				</ToolbarButton>
			</div>
		</div>
	);
};

export default EditorToolbar;
