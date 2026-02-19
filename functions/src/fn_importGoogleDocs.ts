/**
 * Cloud Function for importing Google Docs into the main Freedi app
 */

import { Request, Response } from 'firebase-functions/v1';
import { google, docs_v1 } from 'googleapis';
import { Collections } from '@freedi/shared-types';
import { db } from './index';
import { logError } from './utils/errorHandling';

/**
 * Paragraph types (matching the app's paragraph format)
 */
enum ParagraphType {
	h1 = 'h1',
	h2 = 'h2',
	h3 = 'h3',
	h4 = 'h4',
	h5 = 'h5',
	h6 = 'h6',
	paragraph = 'paragraph',
	li = 'li',
	table = 'table',
}

interface Paragraph {
	paragraphId: string;
	type: ParagraphType;
	content: string;
	order: number;
	listType?: 'ul' | 'ol';
}

/**
 * Mapping from Google Docs named styles to ParagraphType
 */
const HEADING_STYLE_MAP: Record<string, ParagraphType> = {
	HEADING_1: ParagraphType.h1,
	HEADING_2: ParagraphType.h2,
	HEADING_3: ParagraphType.h3,
	HEADING_4: ParagraphType.h4,
	HEADING_5: ParagraphType.h5,
	HEADING_6: ParagraphType.h6,
	TITLE: ParagraphType.h1,
	SUBTITLE: ParagraphType.h2,
	NORMAL_TEXT: ParagraphType.paragraph,
};

/**
 * Generate a unique paragraph ID
 */
function generateParagraphId(): string {
	return `p_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Extract document ID from Google Docs URL
 */
function extractDocumentId(url: string): string | null {
	const patterns = [
		/^https?:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
		/^https?:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match?.[1]) {
			return match[1];
		}
	}

	return null;
}

/**
 * Get Google Docs API client
 */
function getGoogleDocsClient(): docs_v1.Docs {
	const clientEmail = process.env.GOOGLE_DOCS_SERVICE_ACCOUNT_EMAIL;
	const privateKey = process.env.GOOGLE_DOCS_PRIVATE_KEY?.replace(/\\n/g, '\n');

	if (!clientEmail || !privateKey) {
		throw new Error('Google Docs API credentials not configured');
	}

	const auth = new google.auth.GoogleAuth({
		credentials: {
			client_email: clientEmail,
			private_key: privateKey,
		},
		scopes: ['https://www.googleapis.com/auth/documents.readonly'],
	});

	return google.docs({ version: 'v1', auth });
}

/**
 * Extract plain text content from paragraph elements
 */
function extractTextContent(elements?: docs_v1.Schema$ParagraphElement[]): string {
	if (!elements) return '';

	return elements
		.map((element) => element.textRun?.content || '')
		.join('')
		.replace(/\n$/, '');
}

/**
 * Extract text content from a table cell
 */
function extractCellContent(cell: docs_v1.Schema$TableCell): string {
	if (!cell.content) return '';

	return cell.content
		.map((element) => {
			if (element.paragraph) {
				return extractTextContent(element.paragraph.elements);
			}

			return '';
		})
		.join('\n')
		.trim();
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
	const htmlEntities: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	};

	return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

/**
 * Convert a table element to an HTML table paragraph
 */
function convertTableElement(table: docs_v1.Schema$Table, order: number): Paragraph | null {
	if (!table.tableRows || table.tableRows.length === 0) {
		return null;
	}

	let html = '<table>';

	table.tableRows.forEach((row, rowIndex) => {
		html += '<tr>';

		row.tableCells?.forEach((cell) => {
			const cellContent = extractCellContent(cell);
			const tag = rowIndex === 0 ? 'th' : 'td';
			html += `<${tag}>${escapeHtml(cellContent)}</${tag}>`;
		});

		html += '</tr>';
	});

	html += '</table>';

	return {
		paragraphId: generateParagraphId(),
		type: ParagraphType.table,
		content: html,
		order,
	};
}

/**
 * Convert a paragraph element from Google Docs format
 */
function convertParagraphElement(
	paragraph: docs_v1.Schema$Paragraph,
	order: number,
	lists: { [key: string]: docs_v1.Schema$List },
): Paragraph | null {
	const content = extractTextContent(paragraph.elements);

	if (!content.trim()) {
		return null;
	}

	let type: ParagraphType = ParagraphType.paragraph;
	let listType: 'ul' | 'ol' | undefined;

	const namedStyle = paragraph.paragraphStyle?.namedStyleType;
	if (namedStyle && HEADING_STYLE_MAP[namedStyle]) {
		type = HEADING_STYLE_MAP[namedStyle];
	}

	if (paragraph.bullet) {
		type = ParagraphType.li;

		const listId = paragraph.bullet.listId;
		if (listId && lists[listId]) {
			const list = lists[listId];
			const nestingLevel = paragraph.bullet.nestingLevel ?? 0;
			const levelProperties = list.listProperties?.nestingLevels?.[nestingLevel];
			const glyphType = levelProperties?.glyphType;

			if (glyphType === 'DECIMAL' || glyphType === 'ALPHA' || glyphType === 'ROMAN') {
				listType = 'ol';
			} else {
				listType = 'ul';
			}
		} else {
			listType = 'ul';
		}
	}

	const para: Paragraph = {
		paragraphId: generateParagraphId(),
		type,
		content: content.trim(),
		order,
	};

	if (listType) {
		para.listType = listType;
	}

	return para;
}

/**
 * Convert a Google Docs API response to an array of Paragraphs
 */
function convertGoogleDocsToParagraphs(document: docs_v1.Schema$Document): Paragraph[] {
	const paragraphs: Paragraph[] = [];
	let order = 0;

	const content = document.body?.content;
	if (!content) {
		return paragraphs;
	}

	const lists = document.lists || {};

	for (const element of content) {
		if (element.paragraph) {
			const para = convertParagraphElement(element.paragraph, order, lists);
			if (para) {
				paragraphs.push(para);
				order++;
			}
		} else if (element.table) {
			const tablePara = convertTableElement(element.table, order);
			if (tablePara) {
				paragraphs.push(tablePara);
				order++;
			}
		}
	}

	return paragraphs;
}

/**
 * Import Google Docs HTTP function
 */
export async function importGoogleDoc(req: Request, res: Response): Promise<void> {
	try {
		// Only allow POST
		if (req.method !== 'POST') {
			res.status(405).json({ success: false, error: 'Method not allowed' });

			return;
		}

		const { documentUrl, statementId, userId } = req.body;

		// Validate inputs
		if (!documentUrl) {
			res.status(400).json({ success: false, error: 'Document URL is required' });

			return;
		}

		if (!statementId) {
			res.status(400).json({ success: false, error: 'Statement ID is required' });

			return;
		}

		if (!userId) {
			res.status(401).json({ success: false, error: 'User ID is required' });

			return;
		}

		// Extract Google Doc ID from URL
		const googleDocId = extractDocumentId(documentUrl);
		if (!googleDocId) {
			res.status(400).json({
				success: false,
				error: 'Please enter a valid Google Docs URL',
			});

			return;
		}

		// Verify user is admin of the statement
		const docRef = db.collection(Collections.statements).doc(statementId);
		const docSnap = await docRef.get();

		if (!docSnap.exists) {
			res.status(404).json({ success: false, error: 'Statement not found' });

			return;
		}

		const docData = docSnap.data();
		const isAdmin = docData?.creatorId === userId || docData?.creator?.uid === userId;

		if (!isAdmin) {
			res.status(403).json({
				success: false,
				error: 'You do not have permission to import to this statement',
			});

			return;
		}

		// Fetch Google Doc
		let googleDoc;
		try {
			const client = getGoogleDocsClient();
			const response = await client.documents.get({ documentId: googleDocId });
			googleDoc = response.data;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			if (errorMessage.includes('not found') || errorMessage.includes('404')) {
				res.status(404).json({
					success: false,
					error: 'Document not found. Please check the URL.',
				});

				return;
			}

			if (errorMessage.includes('permission') || errorMessage.includes('403')) {
				const serviceEmail = process.env.GOOGLE_DOCS_SERVICE_ACCOUNT_EMAIL || '';
				res.status(403).json({
					success: false,
					error: `Cannot access this document. Please share it with: ${serviceEmail}`,
					serviceAccountEmail: serviceEmail,
				});

				return;
			}

			logError(error, {
				operation: 'importGoogleDocs.fetchDocument',
				statementId,
				userId,
				metadata: { googleDocId },
			});
			res.status(500).json({
				success: false,
				error: 'Failed to fetch document. Please try again.',
			});

			return;
		}

		// Convert to paragraphs
		const paragraphs = convertGoogleDocsToParagraphs(googleDoc);
		const documentTitle = googleDoc.title || 'Untitled Document';

		if (paragraphs.length === 0) {
			res.status(400).json({
				success: false,
				error: 'The document appears to be empty or has no importable content.',
			});

			return;
		}

		// Generate description from paragraphs (first 200 chars)
		const description = paragraphs
			.map((p) => p.content)
			.join(' ')
			.slice(0, 200);

		// Save to Firestore
		await docRef.update({
			paragraphs,
			description: description.length === 200 ? description + '...' : description,
			lastUpdate: Date.now(),
		});

		res.status(200).json({
			success: true,
			paragraphs,
			documentTitle,
		});
	} catch (error) {
		logError(error, {
			operation: 'importGoogleDocs.importGoogleDoc',
			metadata: { statementId: req.body?.statementId },
		});
		res.status(500).json({
			success: false,
			error: 'Failed to import document. Please try again.',
		});
	}
}
