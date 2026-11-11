import { Statement } from './StatementTypes';
import { Paragraph, ParagraphType } from '../paragraph/paragraphModel';
import { User } from '../user/User';
import { SourceApp } from '../engagement/SourceApp';
import type { CreateParagraphChildParams } from './StatementUtils';

/**
 * Maps a paragraph child statement to the `Paragraph` DTO, tolerating legacy
 * fields (`blockType ?? doc.paragraphType`, `order ?? doc.order ?? createdAt`).
 */
export function statementToParagraph(statement: Statement): Paragraph {
	const doc = statement.doc;

	return {
		paragraphId: statement.statementId,
		type: statement.blockType ?? doc?.paragraphType ?? ParagraphType.paragraph,
		content: statement.statement,
		order: statement.order ?? doc?.order ?? statement.createdAt ?? 0,
		...(doc?.listType !== undefined && { listType: doc.listType }),
		...(doc?.contentHtml !== undefined && { contentHtml: doc.contentHtml }),
		...(statement.derivedFromStatementId !== undefined && {
			sourceStatementId: statement.derivedFromStatementId,
		}),
		...(doc?.imageUrl !== undefined && { imageUrl: doc.imageUrl }),
		...(doc?.imageAlt !== undefined && { imageAlt: doc.imageAlt }),
		...(doc?.imageCaption !== undefined && { imageCaption: doc.imageCaption }),
	};
}

/**
 * Maps a `Paragraph` DTO to {@link CreateParagraphChildParams}, so callers can
 * convert a DTO into a canonical paragraph child statement via
 * {@link createParagraphChildStatement}.
 */
export function paragraphToFactoryParams(
	paragraph: Paragraph,
	host: Pick<Statement, 'statementId' | 'topParentId'> & Partial<Pick<Statement, 'accessScope'>>,
	creator: User,
	opts?: { isOfficial?: boolean; sourceApp?: SourceApp },
): CreateParagraphChildParams {
	return {
		content: paragraph.content,
		host,
		creator,
		order: paragraph.order,
		blockType: paragraph.type,
		statementId: paragraph.paragraphId,
		...(paragraph.listType !== undefined && { listType: paragraph.listType }),
		...(paragraph.contentHtml !== undefined && { contentHtml: paragraph.contentHtml }),
		...(paragraph.imageUrl !== undefined && { imageUrl: paragraph.imageUrl }),
		...(paragraph.imageAlt !== undefined && { imageAlt: paragraph.imageAlt }),
		...(paragraph.imageCaption !== undefined && { imageCaption: paragraph.imageCaption }),
		...(paragraph.sourceStatementId !== undefined && {
			sourceStatementId: paragraph.sourceStatementId,
		}),
		...(opts?.isOfficial && { isOfficial: true }),
		...(opts?.sourceApp && { sourceApp: opts.sourceApp }),
	};
}
