/**
 * schema.org structured data (§6 SEO). Per question page = a `QAPage`; options
 * are answers, evidence/chatter are comments. AI-authored content carries
 * `digitalSourceType: TrainedAlgorithmicMediaDigitalSource`. Only public pages
 * are emitted to crawlers (unlisted → noindex, private → never served).
 */
import { StatementType } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';

export interface QaPageInput {
	question: Statement;
	options: Statement[];
	commentCount: number;
	url: string;
}

interface JsonLd {
	[key: string]: unknown;
}

function answerNode(option: Statement): JsonLd {
	const node: JsonLd = {
		'@type': 'Answer',
		text: option.statement,
		url: `#${option.statementId}`,
		author: {
			'@type': 'Person',
			name: option.creator?.displayName ?? 'Anonymous',
		},
	};
	if (option.sourceApp && option.dialecticSnapshot === undefined && option.activeScorerVersion) {
		// AI-derived synthesis option marker (v2 accepted revisions).
		node.creativeWorkStatus = 'AI-assisted';
	}

	return node;
}

export function buildQaPage({ question, options, commentCount, url }: QaPageInput): JsonLd {
	const accepted = [...options].sort(
		(a, b) => (b.corroborationScore ?? 0) - (a.corroborationScore ?? 0),
	);
	const suggested = accepted.slice(1).map(answerNode);

	return {
		'@context': 'https://schema.org',
		'@type': 'QAPage',
		mainEntity: {
			'@type': 'Question',
			name: question.statement,
			text: question.statement,
			answerCount: options.length,
			commentCount,
			url,
			author: {
				'@type': 'Person',
				name: question.creator?.displayName ?? 'Anonymous',
			},
			...(accepted.length
				? { acceptedAnswer: answerNode(accepted[0]) }
				: {}),
			...(suggested.length ? { suggestedAnswer: suggested } : {}),
		},
	};
}

export function isOption(s: Statement): boolean {
	return s.statementType === StatementType.option;
}

export function serializeJsonLd(data: JsonLd): string {
	// Escape `<` to avoid breaking out of the script tag.
	return JSON.stringify(data).replace(/</g, '\\u003c');
}
