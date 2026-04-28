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
import { ChevronUp, ChevronDown, X, Plus, Check } from 'lucide-react';

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
	const editorRef = useRef<HTMLDivElement | null>(null);
	// `draftRef` holds the in-progress text without triggering re-renders
	// (which would clobber the contenteditable's DOM and the caret).
	const draftRef = useRef<string>('');
	// Tracks the editingId for which the editor element has been initialized,
	// so the ref-callback initializes content + focus exactly once per session.
	const lastInitializedFor = useRef<string | null>(null);
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
		draftRef.current = p.statement ?? '';
		setFocusedId(p.statementId);
		setEditingId(p.statementId);
		// The contentEditable div initializes its own content + focus via the
		// ref-callback so we don't fight React over the DOM.
	}, [canEdit]);

	const commitEdit = useCallback(async () => {
		if (!editingId) return;
		const id = editingId;
		const content = draftRef.current;
		flushDebounce();
		setEditingId(null);
		// Reset so the next edit session re-initializes from the latest snapshot.
		lastInitializedFor.current = null;
		await persistDraft(id, content);
	}, [editingId, persistDraft, flushDebounce]);

	const cancelEdit = useCallback(() => {
		flushDebounce();
		setEditingId(null);
		lastInitializedFor.current = null;
	}, [flushDebounce]);

	// Keep the editor's content out of React's render cycle: read text from
	// the DOM on input, store it in a ref, and schedule a debounced save.
	const handleEditorInput = useCallback(
		(e: React.FormEvent<HTMLDivElement>) => {
			const el = e.currentTarget;
			const text = el.innerText;
			draftRef.current = text;

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
				cancelEdit();

				return;
			}
			if (e.key === 'Enter' && !e.shiftKey) {
				// v1: Enter commits and exits. Shift+Enter inserts a soft break
				// (browser default). Auto-split into a new paragraph is v1.5.
				e.preventDefault();
				void commitEdit();
			}
		},
		[commitEdit, cancelEdit],
	);

	// Click-outside to commit. Listens at document level only while editing.
	useEffect(() => {
		if (!editingId) return;
		function handleDocClick(e: MouseEvent) {
			const el = editorRef.current;
			if (!el) return;
			const target = e.target as Node | null;
			if (!target) return;
			// If the click is on the editor itself or any descendant of the
			// surrounding StatementBody, ignore — let blur or button handlers run.
			if (el.contains(target)) return;
			void commitEdit();
		}
		document.addEventListener('mousedown', handleDocClick);

		return () => document.removeEventListener('mousedown', handleDocClick);
	}, [editingId, commitEdit]);

	const handleAddAtEnd = useCallback(async () => {
		if (!canEdit) return;
		const newId = await addParagraphChild({
			host,
			content: '',
			blockType: ParagraphType.paragraph,
			currentParagraphs: paragraphs,
		});
		if (newId) {
			draftRef.current = '';
			lastInitializedFor.current = null;
			setFocusedId(newId);
			setEditingId(newId);
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

	// Ref callback: when the editor element first attaches for a given
	// editingId, set its initial content and place caret at end. Runs once
	// per edit session because of `lastInitializedFor`.
	const setEditorRef = useCallback(
		(el: HTMLDivElement | null) => {
			editorRef.current = el;
			if (!el || !editingId) return;
			if (lastInitializedFor.current === editingId) return;

			el.innerText = draftRef.current;
			lastInitializedFor.current = editingId;

			// Defer focus to allow the browser to finish layout — without this,
			// some browsers won't accept focus on a freshly attached element.
			window.setTimeout(() => {
				if (editorRef.current !== el) return;
				el.focus();
				const range = document.createRange();
				range.selectNodeContents(el);
				range.collapse(false);
				const sel = window.getSelection();
				sel?.removeAllRanges();
				sel?.addRange(range);
			}, 0);
		},
		[editingId],
	);

	// Empty state.
	const isEmpty = paragraphs.length === 0;

	if (!canEdit && isEmpty) return null;

	const renderBlock = (p: Statement, idx: number) => {
		const isFocused = focusedId === p.statementId;
		const isEditing = editingId === p.statementId;
		const blockType = p.blockType ?? ParagraphType.paragraph;
		const text = p.statement ?? '';

		const blockClass = clsx(
			'statement-body__block',
			`statement-body__block--${blockType}`,
			isFocused && 'statement-body__block--focused',
			isEditing && 'statement-body__block--editing',
		);

		// IMPORTANT: the contenteditable element is uncontrolled. We never pass
		// its text as JSX children — that would clobber the DOM (and the caret)
		// on every keystroke. Initial content is set once in the ref callback.
		// Using <span> (inline) so it's valid inside <p>, <h1>..<h6>, etc.;
		// CSS gives it block-like layout.
		const content = isEditing ? (
			<span
				ref={setEditorRef}
				className="statement-body__editor"
				contentEditable
				suppressContentEditableWarning
				role="textbox"
				aria-label={t('Edit paragraph')}
				onInput={handleEditorInput}
				onKeyDown={handleEditorKeyDown}
			/>
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

				{canEdit && isEditing && (
					<div className="statement-body__controls statement-body__controls--editing">
						<button
							type="button"
							className="statement-body__icon-button statement-body__icon-button--primary"
							onMouseDown={(e) => e.preventDefault()}
							onClick={(e) => {
								e.stopPropagation();
								void commitEdit();
							}}
							aria-label={t('Done editing')}
						>
							<Check size={16} />
							<span className="statement-body__icon-button-label">
								{t('Done')}
							</span>
						</button>
						<button
							type="button"
							className="statement-body__icon-button"
							onMouseDown={(e) => e.preventDefault()}
							onClick={(e) => {
								e.stopPropagation();
								cancelEdit();
							}}
							aria-label={t('Cancel editing')}
						>
							<X size={16} />
						</button>
					</div>
				)}

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
			// Render as div with list-item visual styling — bare <li> is invalid
			// outside <ul>/<ol> and we don't group consecutive list items in v1.
			return <div className="statement-body__li">{inner}</div>;
		case ParagraphType.paragraph:
		default:
			return <p className="statement-body__paragraph">{inner}</p>;
	}
}

export default StatementBody;
