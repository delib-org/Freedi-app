import React, { FC, useEffect, useMemo, useState, useCallback } from 'react';
import clsx from 'clsx';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
	Statement,
	StatementType,
	ParagraphType,
	Paragraph,
	Collections,
	statementToParagraph,
} from '@freedi/shared-types';
import { FireStore } from '@/controllers/db/config';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	replaceAllParagraphChildren,
	sortParagraphChildren,
} from '@/controllers/db/statements/paragraphChildren';
import RichTextEditor from '@/view/components/richTextEditor/RichTextEditor';
import { sanitizeInlineHtml } from '@/view/components/richTextEditor/editorSerialization';
import RichHtmlContent from '@/view/components/richHtml/RichHtmlContent';
import { containsRichHtml } from '@/utils/richHtml';
import { logError } from '@/utils/errorHandling';
import EditIcon from '@/assets/icons/editIcon.svg?react';

interface StatementBodyProps {
	host: Statement;
	canEdit: boolean;
	className?: string;
}

/**
 * The statement's rich body (description): paragraph child Statements rendered
 * read-only, with a simple inline WYSIWYG editor for admins. Editing replaces
 * the whole body in one save (ids are preserved for unchanged paragraphs).
 */
const StatementBody: FC<StatementBodyProps> = ({ host, canEdit, className }) => {
	const { t } = useTranslation();
	const [canonicalParagraphs, setCanonicalParagraphs] = useState<Statement[]>([]);
	const [officialParagraphs, setOfficialParagraphs] = useState<Statement[]>([]);
	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	// Subscribe to canonical paragraph children of `host`.
	useEffect(() => {
		const q = query(
			collection(FireStore, Collections.statements),
			where('parentId', '==', host.statementId),
			where('statementType', '==', StatementType.paragraph),
		);
		const unsub = onSnapshot(q, (snap) => {
			const next = snap.docs.map((d) => d.data() as Statement);
			setCanonicalParagraphs(sortParagraphChildren(next));
		});

		return () => unsub();
	}, [host.statementId]);

	// Dual-read (Sign legacy): official body paragraphs written by Sign are
	// option-typed children flagged with `doc.isOfficialParagraph`. Without
	// this subscription a Sign document's body is invisible in the main app.
	useEffect(() => {
		const q = query(
			collection(FireStore, Collections.statements),
			where('parentId', '==', host.statementId),
			where('doc.isOfficialParagraph', '==', true),
		);
		const unsub = onSnapshot(
			q,
			(snap) => {
				const next = snap.docs.map((d) => d.data() as Statement).filter((s) => !s.hide);
				setOfficialParagraphs(next);
			},
			(error) => {
				logError(error, {
					operation: 'StatementBody.listenOfficialParagraphs',
					statementId: host.statementId,
				});
			},
		);

		return () => unsub();
	}, [host.statementId]);

	// Merge both shapes, dedupe by id (canonical wins), keep document order.
	const paragraphs = useMemo(() => {
		const byId = new Map<string, Statement>();
		for (const p of officialParagraphs) byId.set(p.statementId, p);
		for (const p of canonicalParagraphs) byId.set(p.statementId, p);

		return sortParagraphChildren([...byId.values()]);
	}, [canonicalParagraphs, officialParagraphs]);

	// Sign-authored bodies carry rich HTML the inline editor can't round-trip
	// (it only supports bold/italic) — editing would destroy colors/tables and,
	// for legacy option-typed paragraphs, duplicate the body. Hide editing.
	const hasSignAuthoredBody = useMemo(
		() => officialParagraphs.length > 0 || paragraphs.some((p) => containsRichHtml(p.statement)),
		[officialParagraphs, paragraphs],
	);
	const canEditBody = canEdit && !hasSignAuthoredBody;

	const editorParagraphs = useMemo<Paragraph[]>(
		() => paragraphs.map(statementToParagraph),
		[paragraphs],
	);

	const handleSave = useCallback(
		async (edited: Paragraph[]) => {
			try {
				setIsSaving(true);
				const existingIds = new Set(paragraphs.map((p) => p.statementId));
				const lines = edited.map((p) => ({
					content: p.content,
					blockType: p.type,
					...(p.listType !== undefined && { listType: p.listType }),
					...(p.contentHtml !== undefined && { contentHtml: p.contentHtml }),
					...(existingIds.has(p.paragraphId) && { statementId: p.paragraphId }),
				}));
				const ids = await replaceAllParagraphChildren(host, lines, paragraphs);
				if (!ids) throw new Error('replaceAllParagraphChildren returned undefined');
				setIsEditing(false);
			} catch (error) {
				logError(error, {
					operation: 'StatementBody.handleSave',
					statementId: host.statementId,
				});
			} finally {
				setIsSaving(false);
			}
		},
		[host, paragraphs],
	);

	const isEmpty = paragraphs.length === 0;

	if (!canEditBody && isEmpty) return null;

	if (isEditing) {
		return (
			<div className={clsx('statement-body', 'statement-body--editing', className)}>
				<RichTextEditor
					paragraphs={editorParagraphs}
					onSave={handleSave}
					onCancel={() => setIsEditing(false)}
					placeholder={t('Add a description...')}
					isLoading={isSaving}
					compact
				/>
			</div>
		);
	}

	return (
		<div className={clsx('statement-body', className)}>
			{canEditBody && !isEmpty && (
				<button
					type="button"
					className="statement-body__edit-button"
					onClick={() => setIsEditing(true)}
				>
					<EditIcon />
					<span>{t('Edit Description')}</span>
				</button>
			)}

			{isEmpty && canEditBody && (
				<button
					type="button"
					className="statement-body__placeholder"
					onClick={() => setIsEditing(true)}
				>
					{t('Add a description...')}
				</button>
			)}

			{paragraphs.map((p) => {
				const blockType = p.blockType ?? p.doc?.paragraphType ?? ParagraphType.paragraph;
				const contentHtml = p.doc?.contentHtml;

				return (
					<div
						key={p.statementId}
						className={clsx('statement-body__block', `statement-body__block--${blockType}`)}
					>
						{renderTypedContent(
							blockType,
							contentHtml ? (
								<span
									className="statement-body__text"
									dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(contentHtml) }}
								/>
							) : containsRichHtml(p.statement) ? (
								// Sign-authored rich HTML (colored spans, tables, entities) —
								// sanitized inside RichHtmlContent with the shared allowlist.
								<RichHtmlContent content={p.statement} className="statement-body__text" />
							) : (
								<span className="statement-body__text">{p.statement ?? ''}</span>
							),
						)}
					</div>
				);
			})}
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
			// outside <ul>/<ol> and we don't group consecutive list items.
			return <div className="statement-body__li">{inner}</div>;
		case ParagraphType.table:
			// Table markup lives inside the (sanitized) content; a <p> wrapper
			// would be invalid around it.
			return <div className="statement-body__table">{inner}</div>;
		case ParagraphType.paragraph:
		default:
			return <p className="statement-body__paragraph">{inner}</p>;
	}
}

export default StatementBody;
