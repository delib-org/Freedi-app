import { useRef } from 'react';
import { Statement } from '@freedi/shared-types';

/**
 * Fields of a question that change with activity and that no answer card reads.
 * A rating or a new answer rewrites these on the question document, and at
 * 1,000 people that would redraw every card each time.
 */
const ACTIVITY_FIELDS: ReadonlySet<string> = new Set<keyof Statement>([
	'lastUpdate',
	'lastChildUpdate',
	'lastMessage',
	'lastSubStatements',
	'numberOfOptions',
	'numberOfMembers',
	'totalSubStatements',
	'totalEvaluators',
	'viewed',
	'evaluation',
	'consensus',
]);

export function questionFingerprint(question: Statement): string {
	return JSON.stringify(question, (key, value: unknown) =>
		ACTIVITY_FIELDS.has(key) ? undefined : value,
	);
}

/** The same object for as long as the parts of the question a card reads stay the same. */
export function useStableQuestion(question: Statement | undefined): Statement | undefined {
	const stableRef = useRef(question);
	const fingerprintRef = useRef(question ? questionFingerprint(question) : '');

	if (question && question !== stableRef.current) {
		const fingerprint = questionFingerprint(question);
		if (fingerprint !== fingerprintRef.current || !stableRef.current) {
			stableRef.current = question;
			fingerprintRef.current = fingerprint;
		}
	} else if (!question) {
		stableRef.current = undefined;
		fingerprintRef.current = '';
	}

	return stableRef.current;
}
