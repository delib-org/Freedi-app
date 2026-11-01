import { logger } from 'firebase-functions';
import type { Statement } from '@freedi/shared-types';
import { isSynth, isTopicCluster } from '../pipeline/clusterOps';
import { findUnthemedAtoms } from '../pipeline/fileUnthemed';
import { liveThemes } from '../pipeline/nestSynthesis';
import { ATOM_DESCRIPTION_CHARS, MAX_ATOMS } from './constants';
import type { QuestionAtoms, RebuildAtom } from './types';

/**
 * The atoms of a question: every visible synthesis plus every visible plain
 * option that sits in no synthesis. The same contract as the live
 * file-unthemed sweep, without its "unthemed" filter: with no themes passed,
 * `findUnthemedAtoms` returns exactly the atom set.
 */
export function selectAtoms(all: Statement[]): Statement[] {
	return findUnthemedAtoms(all, []);
}

/** Visible theme docs, uncapped (the live filing listing caps at 60). */
export function selectLiveThemes(all: Statement[]): Statement[] {
	return all.filter((s) => s.isCluster === true && s.hide !== true && isTopicCluster(s));
}

export function toRebuildAtom(statement: Statement): RebuildAtom {
	const title = (statement.statement ?? '').trim();
	const description = (statement.description ?? '').trim().replace(/\s+/g, ' ');
	const brief =
		description.length > ATOM_DESCRIPTION_CHARS
			? `${description.slice(0, ATOM_DESCRIPTION_CHARS)}…`
			: description;

	return {
		id: statement.statementId,
		title,
		text: brief ? `${title} — ${brief}` : title,
		isSynth: isSynth(statement),
	};
}

export async function collectAtoms(questionId: string): Promise<QuestionAtoms> {
	const { all } = await liveThemes(questionId);
	const atomDocs = selectAtoms(all);
	if (atomDocs.length > MAX_ATOMS) {
		logger.warn('themeRebuild.collectAtoms: atom cap reached, newest left out', {
			questionId,
			atoms: atomDocs.length,
			cap: MAX_ATOMS,
		});
	}

	return {
		atoms: atomDocs.slice(0, MAX_ATOMS).map(toRebuildAtom),
		liveThemes: selectLiveThemes(all),
	};
}
