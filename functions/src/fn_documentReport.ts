/**
 * Firebase Function for Sign Document Report AI narrative generation.
 *
 * Receives a pre-built DocumentReport JSON from the Sign app server (which has
 * already enforced admin access), prompts the LLM to write a decision-maker
 * narrative in the document's language, caches it on documentReports/{docId},
 * and returns it. Runs as a Cloud Function for the 540s timeout (Vercel: 30s).
 */

import { Request, Response } from 'firebase-functions/v1';
import { getFirestore } from 'firebase-admin/firestore';
import {
	Collections,
	DOCUMENT_REPORT_VERSION,
	NARRATIVE_SECTION_IDS,
} from '@freedi/shared-types';
import type {
	DocumentReport,
	DocumentReportNarrative,
	NarrativeSection,
	NarrativeSectionId,
} from '@freedi/shared-types';
import { callLLM, extractJson } from './config/openai-chat';
import { LLM_MODEL_HEAVY } from './config/gemini';
import { logError } from './utils/errorHandling';
import {
	buildNarrativeSystemPrompt,
	buildNarrativeUserPrompt,
} from './documentReport/narrativePrompt';

const db = getFirestore();

const NARRATIVE_MAX_TOKENS = 4096;

interface GenerateNarrativeBody {
	docId?: string;
	report?: DocumentReport;
	language?: string;
	userId?: string;
}

function parseSections(rawText: string): NarrativeSection[] {
	const parsed = JSON.parse(extractJson(rawText)) as { sections?: unknown };

	if (!Array.isArray(parsed.sections)) {
		throw new Error('LLM response missing sections array');
	}

	const validIds = new Set<string>(NARRATIVE_SECTION_IDS);
	const sections = (parsed.sections as Array<Record<string, unknown>>)
		.filter(
			(section) =>
				typeof section.id === 'string' &&
				validIds.has(section.id) &&
				typeof section.title === 'string' &&
				typeof section.body === 'string'
		)
		.map((section) => ({
			id: section.id as NarrativeSectionId,
			title: section.title as string,
			body: section.body as string,
		}));

	if (sections.length === 0) {
		throw new Error('LLM response contained no valid sections');
	}

	// Keep the canonical order regardless of what the model returned
	const byId = new Map(sections.map((s) => [s.id, s]));

	return NARRATIVE_SECTION_IDS.filter((id) => byId.has(id)).map(
		(id) => byId.get(id) as NarrativeSection
	);
}

export async function generateDocumentReportAI(req: Request, res: Response): Promise<void> {
	if (req.method !== 'POST') {
		res.status(405).json({ error: 'Method not allowed' });

		return;
	}

	const { docId, report, language, userId } = (req.body ?? {}) as GenerateNarrativeBody;

	if (!docId || typeof docId !== 'string') {
		res.status(400).json({ error: 'docId is required' });

		return;
	}

	if (!report || typeof report !== 'object' || !Array.isArray(report.paragraphs)) {
		res.status(400).json({ error: 'A valid DocumentReport is required in `report`' });

		return;
	}

	if (report.metadata?.documentId !== docId) {
		res.status(400).json({ error: 'report.metadata.documentId does not match docId' });

		return;
	}

	const narrativeLanguage =
		typeof language === 'string' && language ? language : report.metadata.language || 'en';

	try {
		const rawText = await callLLM({
			model: LLM_MODEL_HEAVY,
			system: buildNarrativeSystemPrompt(narrativeLanguage),
			user: buildNarrativeUserPrompt(report),
			maxTokens: NARRATIVE_MAX_TOKENS,
			temperature: 0.3,
			jsonMode: true,
		});

		const narrative: DocumentReportNarrative = {
			reportVersion: DOCUMENT_REPORT_VERSION,
			generatedAt: Date.now(),
			model: LLM_MODEL_HEAVY,
			language: narrativeLanguage,
			sections: parseSections(rawText),
		};

		await db
			.collection(Collections.documentReports)
			.doc(docId)
			.set({ narrative, generatedAt: Date.now() }, { merge: true });

		res.status(200).json({ ok: true, narrative });
	} catch (error) {
		logError(error, {
			operation: 'fn_documentReport.generateDocumentReportAI',
			statementId: docId,
			userId,
		});
		res.status(500).json({ error: 'Narrative generation failed' });
	}
}
