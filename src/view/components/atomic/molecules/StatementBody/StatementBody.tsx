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
	const [paragraphs, setParagraphs] = useState<Statement[]>([]);
	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

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

	if (!canEdit && isEmpty) return null;

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
			{canEdit && !isEmpty && (
				<button
					type="button"
					className="statement-body__edit-button"
					onClick={() => setIsEditing(true)}
				>
					<EditIcon />
					<span>{t('Edit Description')}</span>
				</button>
			)}

			{isEmpty && canEdit && (
				<button
					type="button"
					className="statement-body__placeholder"
					onClick={() => setIsEditing(true)}
				>
					{t('Add a description...')}
				</button>
			)}

			{paragraphs.map((p) => {
				const blockType = p.blockType ?? ParagraphType.paragraph;
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
		case ParagraphType.paragraph:
		default:
			return <p className="statement-body__paragraph">{inner}</p>;
	}
}

export default StatementBody;
