import { describe, expect, it } from 'vitest';
import { AGORA_MATERIALS } from '@freedi/shared-types';
import {
	askOutcome,
	checkPdfFile,
	failureKey,
	messagesForScene,
	pdfObjectName,
	questionsLeft,
} from '../flows/materialsFlow';
import { translations } from '../i18n';

describe('materialsFlow', () => {
	it('counts questions left, never below zero', () => {
		expect(questionsLeft(0)).toBe(AGORA_MATERIALS.QUESTIONS_PER_SESSION);
		expect(questionsLeft(14)).toBe(1);
		expect(questionsLeft(15)).toBe(0);
		expect(questionsLeft(99)).toBe(0);
		expect(AGORA_MATERIALS.QUESTIONS_PER_SESSION).toBe(15);
	});

	it('accepts a PDF within the cap and says why it refuses anything else', () => {
		expect(checkPdfFile({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toEqual({
			ok: true,
		});
		expect(checkPdfFile({ name: 'A.PDF', type: '', size: 1000 })).toEqual({ ok: true });
		expect(checkPdfFile({ name: 'a.docx', type: 'application/msword', size: 10 })).toEqual({
			ok: false,
			key: 'mat.err_pdf_type',
		});
		expect(
			checkPdfFile({
				name: 'a.pdf',
				type: 'application/pdf',
				size: AGORA_MATERIALS.MAX_PDF_BYTES + 1,
			}),
		).toEqual({ ok: false, key: 'mat.err_pdf_size' });
	});

	it('gives every upload a safe, unique storage name', () => {
		expect(pdfObjectName('דוח שנתי.pdf', 5)).toBe('materials/5-material.pdf');
		expect(pdfObjectName('My Report v2.PDF', 5)).toBe('materials/5-My-Report-v2.pdf');
	});

	it('maps every server refusal to a translation that exists in all six languages', () => {
		const reasons = [
			'empty',
			'too_many',
			'too_big',
			'pdf_unreadable',
			'pdf_no_text',
			'link_invalid',
			'link_unreachable',
			'link_not_text',
			'link_no_text',
		] as const;
		for (const reason of reasons) {
			const key = failureKey(reason);
			for (const lang of Object.keys(translations) as Array<keyof typeof translations>) {
				expect(translations[lang][key], `${lang}:${key}`).toBeTruthy();
			}
		}
	});

	it('turns the server verdict into what the sheet does', () => {
		expect(
			askOutcome({ ok: true, answer: 'a', notInMaterials: false, used: 3, limit: 15 }),
		).toEqual({
			kind: 'answer',
			used: 3,
		});
		expect(askOutcome({ ok: false, reason: 'limit', used: 15, limit: 15 })).toEqual({
			kind: 'limit',
			used: 15,
		});
		expect(
			askOutcome({
				ok: false,
				reason: 'language',
				used: 2,
				limit: 15,
				strikes: 1,
				deducted: 2,
				pointsTotal: 4,
			}),
		).toEqual({ kind: 'language', used: 2, deducted: 2 });
		expect(askOutcome({ ok: false, reason: 'banned_word', used: 2, limit: 15, word: 'x' })).toEqual(
			{
				kind: 'banned_word',
				used: 2,
				word: 'x',
			},
		);
		expect(askOutcome({ ok: false, reason: 'unavailable', used: 2, limit: 15 })).toMatchObject({
			kind: 'error',
			key: 'mat.err_unavailable',
		});
	});

	it("shows one scene's turns only", () => {
		const messages = [
			{ id: '1', sceneId: 'a', role: 'student' as const, text: 'q', at: 1 },
			{ id: '2', sceneId: 'b', role: 'student' as const, text: 'q', at: 2 },
		];
		expect(messagesForScene(messages, 'a').map((message) => message.id)).toEqual(['1']);
	});
});
