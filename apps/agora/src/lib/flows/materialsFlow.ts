import { AGORA_MATERIALS } from '@freedi/shared-types';
import type {
	AgoraMaterialMessage,
	AskMaterialsResponse,
	SceneMaterialsFailure,
} from '@freedi/shared-types';

/**
 * The rules around library materials that the teacher's editor and the
 * student's sheet share — pure, so they are testable without a browser.
 */

const FAILURE_KEYS: Record<SceneMaterialsFailure, string> = {
	empty: 'mat.err_empty',
	too_many: 'mat.err_too_many',
	too_big: 'mat.err_too_big',
	pdf_unreadable: 'mat.err_pdf_unreadable',
	pdf_no_text: 'mat.err_pdf_no_text',
	link_invalid: 'mat.err_link_invalid',
	link_unreachable: 'mat.err_link_unreachable',
	link_not_text: 'mat.err_link_not_text',
	link_no_text: 'mat.err_link_no_text',
};

/** The translation key that explains a refused add to the teacher */
export function failureKey(reason: SceneMaterialsFailure): string {
	return FAILURE_KEYS[reason] ?? 'mat.err_generic';
}

export type PdfCheck = { ok: true } | { ok: false; key: 'mat.err_pdf_type' | 'mat.err_pdf_size' };

/** Reject a file before uploading it: a PDF, within the size cap */
export function checkPdfFile(file: { name: string; type: string; size: number }): PdfCheck {
	const looksPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
	if (!looksPdf) return { ok: false, key: 'mat.err_pdf_type' };
	if (file.size > AGORA_MATERIALS.MAX_PDF_BYTES) return { ok: false, key: 'mat.err_pdf_size' };

	return { ok: true };
}

/** A storage-safe object name for an uploaded PDF (unique per upload) */
export function pdfObjectName(fileName: string, now: number): string {
	const base =
		fileName
			.replace(/\.pdf$/i, '')
			.replace(/[^A-Za-z0-9._-]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 60) || 'material';

	return `materials/${now}-${base}.pdf`;
}

export function questionsLeft(used: number): number {
	return Math.max(0, AGORA_MATERIALS.QUESTIONS_PER_SESSION - used);
}

/** Questions the student has asked so far, read from the stored conversation */
export function usedFrom(chat: { used: number } | null): number {
	return chat?.used ?? 0;
}

/** This scene's turns, oldest first */
export function messagesForScene(
	messages: readonly AgoraMaterialMessage[],
	sceneId: string,
): AgoraMaterialMessage[] {
	return messages.filter((message) => message.sceneId === sceneId);
}

export type AskOutcome =
	| { kind: 'answer'; used: number }
	| { kind: 'language'; used: number; deducted: number }
	| { kind: 'banned_word'; used: number; word: string }
	| { kind: 'limit'; used: number }
	| { kind: 'error'; used: number; key: string };

/** What the sheet does with the server's verdict */
export function askOutcome(response: AskMaterialsResponse): AskOutcome {
	if (response.ok) return { kind: 'answer', used: response.used };
	switch (response.reason) {
		case 'language':
			return { kind: 'language', used: response.used, deducted: response.deducted };
		case 'banned_word':
			return { kind: 'banned_word', used: response.used, word: response.word };
		case 'limit':
			return { kind: 'limit', used: response.used };
		case 'unavailable':
			return { kind: 'error', used: response.used, key: 'mat.err_unavailable' };
		default:
			return { kind: 'error', used: response.used, key: 'mat.err_ask' };
	}
}
