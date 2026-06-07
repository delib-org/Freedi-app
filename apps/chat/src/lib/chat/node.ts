/**
 * Chat-domain helpers over the shared `Statement`. The chat app only ever deals
 * with four `StatementType`s — `question`, `option`, `evidence`, `statement` —
 * mapped to the pure `NodeKind` used by `@freedi/evidence`.
 */
import { StatementType, DialogicType } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import type { NodeKind, DialecticPolarity } from '@freedi/evidence';

export function toNodeKind(type: StatementType): NodeKind {
	switch (type) {
		case StatementType.question:
			return 'question';
		case StatementType.option:
			return 'option';
		case StatementType.evidence:
			return 'evidence';
		default:
			return 'statement';
	}
}

export function isScored(type: StatementType): boolean {
	return type === StatementType.option || type === StatementType.evidence;
}

export function polarityOf(statement: Statement): DialecticPolarity {
	return (statement.dialecticType as DialecticPolarity) ?? 'standard';
}

/** The composer choices available under a given parent (§4.1 / §6 composer). */
export type ComposerChoice =
	| 'propose-option'
	| 'ask-sub-question'
	| 'standard'
	| 'strengthen'
	| 'critique';

export function composerChoicesFor(parentType: StatementType): ComposerChoice[] {
	switch (parentType) {
		case StatementType.question:
			return ['propose-option', 'ask-sub-question'];
		case StatementType.option:
		case StatementType.evidence:
			return ['standard', 'strengthen', 'critique', 'ask-sub-question'];
		default:
			return [];
	}
}

export interface ResolvedKind {
	statementType: StatementType;
	dialecticType: DialogicType;
}

/** Resolve a composer choice into the concrete node type + polarity (§4.1 table). */
export function resolveKind(choice: ComposerChoice): ResolvedKind {
	switch (choice) {
		case 'propose-option':
			return { statementType: StatementType.option, dialecticType: DialogicType.standard };
		case 'ask-sub-question':
			return { statementType: StatementType.question, dialecticType: DialogicType.standard };
		case 'strengthen':
			return { statementType: StatementType.evidence, dialecticType: DialogicType.strengthen };
		case 'critique':
			return { statementType: StatementType.evidence, dialecticType: DialogicType.critique };
		case 'standard':
		default:
			return { statementType: StatementType.statement, dialecticType: DialogicType.standard };
	}
}
