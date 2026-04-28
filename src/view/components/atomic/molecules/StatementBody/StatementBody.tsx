import {
	FC,
	useEffect,
	useRef,
	useState,
	useCallback,
	KeyboardEvent,
} from 'react';
import clsx from 'clsx';
import {
	collection,
	onSnapshot,
	query,
	where,
} from 'firebase/firestore';
import {
	Statement,
	StatementType,
	ParagraphType,
	Collections,
} from '@freedi/shared-types';
import { FireStore } from '@/controllers/db/config';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	addParagraphChild,
	updateParagraphChild,
	deleteParagraphChild,
	moveParagraphChild,
	sortParagraphChildren,
} from '@/controllers/db/statements/paragraphChildren';
import { ChevronUp, ChevronDown, X, Plus } from 'lucide-react';

interface StatementBodyProps {
	host: Statement;
	canEdit: boolean;
	className?: string;
}

const SAVE_DEBOUNCE_MS = 600;

/** Visual block-type options offered to admins in v1. Image deferred. */
const BLOCK_TYPE_OPTIONS: Array<{ value: ParagraphType; labelKey: string }> = [
	{ value: ParagraphType.paragraph, labelKey: 'Text' },
	{ value: ParagraphType.h1, labelKey: 'Heading 1' },
	{ value: ParagraphType.h2, labelKey: 'Heading 2' },
	{ value: ParagraphType.h3, labelKey: 'Heading 3' },
	{ value: ParagraphType.li, labelKey: 'List item' },
];

const StatementBody: FC<StatementBodyProps> = ({ host, canEdit, className }) => {
	const { t } = useTranslation();
	const [paragraphs, setParagraphs] = useState<Statement[]>([]);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [draft, setDraft] = useState('');
	const editorRef = useRef<HTMLDivElement | null>(null);
	const debounceTimer = useRef<number | null>(null);

	// Subscribe to paragraph children of `host`.
	useEffect(() => {
		const q = query(
			collection(FireStore, Collections.statements),
			where('parentId', '==', host.statementId),
			where('statementType', '==', StatementType.paragraph),
		);
		const unsub = onSnapshot(q, (snap) => {
			const next = snap.docs.map((d) => d.data() as Statement);
			setParagraphs(sortParagraphChildren(next));
		});

		return () => unsub();
	}, [host.statementId]);

	const flushDebounce = useCallback(() => {
		if (debounceTimer.current !== null) {
			window.clearTimeout(debounceTimer.current);
			debounceTimer.current = null;
		}
	}, []);

	const persistDraft = useCallback(
		async (paragraphId: string, content: string) => {
			flushDebounce();
			const trimmed = content.trim();
			// Last-paragraph protection: if this is the only paragraph, never
			// delete it on empty content — just clear it. Otherwise delete.
			if (!trimmed) {
				if (paragraphs.length <= 1) {
					await updateParagraphChild({ paragraphId, content: '' });
				} else {
					await deleteParagraphChild(paragraphId);
				}

				return;
			}
			await updateParagraphChild({ paragraphId, content: trimmed });
		},
		[paragraphs.length, flushDebounce],
	);

	const beginEdit = useCallback((p: Statement) => {
		if (!canEdit) return;
		setEditingId(p.statementId);
		setFocusedId(p.statementId);
		setDraft(p.statement ?? '');
		// Focus is moved into the editor by the autoFocus on the rendered <div>.
	}, [canEdit]);

	const commitEdit = useCallback(async () => {
		if (!editingId) return;
		const id = editingId;
		const content = draft;
		setEditingId(null);
		await persistDraft(id, content);
	}, [editingId, draft, persistDraft]);

	const handleEditorInput = useCallback(
		(e: React.FormEvent<HTMLDivElement>) => {
			const el = e.currentTarget;
			const text = el.innerText;
			setDraft(text);

			// Debounced auto-save while still typing — no Save button.
			if (!editingId) return;
			flushDebounce();
			const id = editingId;
			debounceTimer.current = window.setTimeout(() => {
				debounceTimer.current = null;
				void updateParagraphChild({ paragraphId: id, content: text.trim() });
			}, SAVE_DEBOUNCE_MS);
		},
		[editingId, flushDebounce],
	);

	const handleEditorKeyDown = useCallback(
		(e: KeyboardEvent<HTMLDivElement>) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				flushDebounce();
				setEditingId(null);

				return;
			}
			if (e.key === 'Enter' && !e.shiftKey) {
				// v1: blur to commit, no auto-split (deferred to v1.5).
				e.preventDefault();
				void commitEdit();
			}
		},
		[commitEdit, flushDebounce],
	);

	const handleAddAtEnd = useCallback(async () => {
		if (!canEdit) return;
		const newId = await addParagraphChild({
			host,
			content: '',
			blockType: ParagraphType.paragraph,
			currentParagraphs: paragraphs,
		});
		if (newId) {
			setEditingId(newId);
			setFocusedId(newId);
			setDraft('');
		}
	}, [canEdit, host, paragraphs]);

	const handleDelete = useCallback(
		async (p: Statement) => {
			if (!canEdit) return;
			if (paragraphs.length <= 1) {
				// Last-paragraph protection: clear instead of deleting.
				await updateParagraphChild({ paragraphId: p.statementId, content: '' });

				return;
			}
			await deleteParagraphChild(p.statementId);
			if (focusedId === p.statementId) setFocusedId(null);
			if (editingId === p.statementId) setEditingId(null);
		},
		[canEdit, paragraphs.length, focusedId, editingId],
	);

	const handleTypeChange = useCallback(
		async (p: Statement, blockType: ParagraphType) => {
			if (!canEdit) return;
			await updateParagraphChild({ paragraphId: p.statementId, blockType });
		},
		[canEdit],
	);

	const handleMove = useCallback(
		async (p: Statement, direction: 'up' | 'down') => {
			if (!canEdit) return;
			await moveParagraphChild(p.statementId, direction, paragraphs);
		},
		[canEdit, paragraphs],
	);

	// Focus the editor when entering edit mode.
	useEffect(() => {
		if (editingId && editorRef.current) {
			const el = editorRef.current;
			el.focus();
			// Place caret at end.
			const range = document.createRange();
			range.selectNodeContents(el);
			range.collapse(false);
			const sel = window.getSelection();
			sel?.removeAllRanges();
			sel?.addRange(range);
		}
	}, [editingId]);

	// Empty state.
	const isEmpty = paragraphs.length === 0;

	if (!canEdit && isEmpty) return null;

	const renderBlock = (p: Statement, idx: number) => {
		const isFocused = focusedId === p.statementId;
		const isEditing = editingId === p.statementId;
		const blockType = p.blockType ?? ParagraphType.paragraph;
		const text = isEditing ? draft : (p.statement ?? '');

		const blockClass = clsx(
			'statement-body__block',
			`statement-body__block--${blockType}`,
			isFocused && 'statement-body__block--focused',
			isEditing && 'statement-body__block--editing',
		);

		const content = isEditing ? (
			<div
				ref={editorRef}
				className="statement-body__editor"
				contentEditable
				suppressContentEditableWarning
				role="textbox"
				aria-label={t('Edit paragraph')}
				onInput={handleEditorInput}
				onKeyDown={handleEditorKeyDown}
				onBlur={() => void commitEdit()}
			>
				{text}
			</div>
		) : (
			<span
				className="statement-body__text"
				onClick={canEdit ? () => beginEdit(p) : undefined}
			>
				{text || (canEdit ? t('(empty paragraph — click to edit)') : '')}
			</span>
		);

		return (
			<div
				key={p.statementId}
				className={blockClass}
				onClick={canEdit && !isEditing ? () => setFocusedId(p.statementId) : undefined}
			>
				{renderTypedContent(blockType, content)}

				{canEdit && isFocused && !isEditing && (
					<div className="statement-body__controls">
						<select
							className="statement-body__type-select"
							value={blockType}
							onChange={(e) => void handleTypeChange(p, e.target.value as ParagraphType)}
							aria-label={t('Block type')}
							onClick={(e) => e.stopPropagation()}
						>
							{BLOCK_TYPE_OPTIONS.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{t(opt.labelKey)}
								</option>
							))}
						</select>
						<button
							type="button"
							className="statement-body__icon-button"
							onClick={(e) => {
								e.stopPropagation();
								void handleMove(p, 'up');
							}}
							aria-label={t('Move up')}
							disabled={idx === 0}
						>
							<ChevronUp size={16} />
						</button>
						<button
							type="button"
							className="statement-body__icon-button"
							onClick={(e) => {
								e.stopPropagation();
								void handleMove(p, 'down');
							}}
							aria-label={t('Move down')}
							disabled={idx === paragraphs.length - 1}
						>
							<ChevronDown size={16} />
						</button>
						<button
							type="button"
							className="statement-body__icon-button statement-body__icon-button--danger"
							onClick={(e) => {
								e.stopPropagation();
								void handleDelete(p);
							}}
							aria-label={t('Delete paragraph')}
						>
							<X size={16} />
						</button>
					</div>
				)}
			</div>
		);
	};

	return (
		<div className={clsx('statement-body', className)}>
			{isEmpty && canEdit && (
				<button
					type="button"
					className="statement-body__placeholder"
					onClick={handleAddAtEnd}
				>
					{t('Click to add the first paragraph…')}
				</button>
			)}

			{paragraphs.map((p, idx) => renderBlock(p, idx))}

			{canEdit && !isEmpty && (
				<button
					type="button"
					className="statement-body__add-end"
					onClick={handleAddAtEnd}
				>
					<Plus size={16} />
					<span>{t('Add paragraph')}</span>
				</button>
			)}
		</div>
	);
};

/** Wrap the inner content in the appropriate semantic tag for the block type. */
function renderTypedContent(type: ParagraphType, inner: React.ReactNode): React.ReactNode {
	switch (type) {
		case ParagraphType.h1:
			return <h1 className="statement-body__h1">{inner}</h1>;
		case ParagraphType.h2:
			return <h2 className="statement-body__h2">{inner}</h2>;
		case ParagraphType.h3:
			return <h3 className="statement-body__h3">{inner}</h3>;
		case ParagraphType.h4:
			return <h4 className="statement-body__h4">{inner}</h4>;
		case ParagraphType.h5:
			return <h5 className="statement-body__h5">{inner}</h5>;
		case ParagraphType.h6:
			return <h6 className="statement-body__h6">{inner}</h6>;
		case ParagraphType.li:
			return <li className="statement-body__li">{inner}</li>;
		case ParagraphType.paragraph:
		default:
			return <p className="statement-body__paragraph">{inner}</p>;
	}
}

export default StatementBody;
