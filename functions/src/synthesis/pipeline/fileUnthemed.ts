import { createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement } from '@freedi/shared-types';
import { assignToTheme, type ThemeOption } from '../../services/integration-ai-service';
import { recordLiveSynthEvent } from '../liveSynth/auditLog';
import { enqueueClusterRecompute } from '../liveSynth/clusterRecompute';
import { isCluster, isSynth } from './clusterOps';
import { liveThemes, toThemeOption } from './nestSynthesis';

/**
 * File atoms that no theme claims.
 *
 * Ideas are themed once, at arrival. An idea whose filing call said NONE, or
 * that arrived before any theme existed, or that had no neighbours at all, was
 * never offered to a theme again: 26 of 114 statements on the Bq replay. This
 * cron step re-offers each such ATOM to the themes that exist now, one judge
 * call per atom per theme list.
 *
 * Atom contract: a visible synthesis in no theme, or a visible option in no
 * synthesis and no theme. A synthesis's members are never counted separately.
 *
 * Deliberately file-only. It never creates a theme, never moves an atom that
 * already has one (moving oscillates), and never touches synthesis membership
 * or votes: the only thing written is a theme's `integratedOptions`. An atom
 * the judge refuses stays unthemed and is shown under "Other".
 */

/** Judge calls per parent per sweep. The rest wait for the next tick. */
export const MAX_FILES_PER_SWEEP = 30;

/** Where the last-judged theme list per atom lives. See `themeListFingerprint`. */
const FILE_STATE_COLLECTION = '_liveSynthThemeFile';

function db() {
	return getFirestore();
}

interface FileState {
	judged?: Record<string, string>;
}

export interface FileUnthemedResult {
	atoms: number;
	/** Atoms filed under a theme. */
	filed: number;
	/** Atoms the judge refused (NONE). */
	refused: number;
	/** Atoms whose theme list had already been judged; no LLM call. */
	skipped: number;
	/** Atoms the judge call failed for; retried next sweep. */
	errors: number;
}

/** Identity of what the judge is shown: the atom and the theme list. */
export function themeListFingerprint(atomId: string, themes: Statement[]): string {
	const list = themes
		.map((t) => `${t.statementId}:${t.statement ?? ''}`)
		.sort()
		.join('|');

	return createHash('sha1').update(`${atomId}#${list}`).digest('hex').slice(0, 16);
}

/**
 * Visible synthesis in no theme, or visible option in no synthesis and no
 * theme. Oldest first, so the order is stable across sweeps.
 */
export function findUnthemedAtoms(all: Statement[], themes: Statement[]): Statement[] {
	const themed = new Set(themes.flatMap((t) => t.integratedOptions ?? []));
	const synthesized = new Set(
		all.filter((s) => s.hide !== true && isSynth(s)).flatMap((s) => s.integratedOptions ?? []),
	);
	const themeIds = new Set(themes.map((t) => t.statementId));

	return all
		.filter((s) => {
			if (s.hide === true || themeIds.has(s.statementId)) return false;
			if (themed.has(s.statementId)) return false;
			if (isSynth(s)) return true;
			// A non-synthesis cluster is a theme-like container, not an atom.
			if (isCluster(s) || s.isCluster === true) return false;

			return !synthesized.has(s.statementId);
		})
		.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

async function loadState(parentId: string): Promise<FileState> {
	try {
		const snap = await db().collection(FILE_STATE_COLLECTION).doc(parentId).get();

		return snap.exists ? ((snap.data() as FileState) ?? {}) : {};
	} catch (error) {
		// Fail-open: judge anyway. One redundant call beats an atom never filed.
		logger.warn('synthesis.fileUnthemed: state read failed, judging anyway', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});

		return {};
	}
}

async function recordJudged(parentId: string, atomId: string, fingerprint: string): Promise<void> {
	try {
		await db()
			.collection(FILE_STATE_COLLECTION)
			.doc(parentId)
			.set({ judged: { [atomId]: fingerprint }, judgedAt: Date.now() }, { merge: true });
	} catch (error) {
		logger.warn('synthesis.fileUnthemed: state write failed', {
			parentId,
			atomId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Add the atom to the theme, only if the atom is STILL unthemed (no visible
 * cluster contains it) and the theme is STILL visible. The queue worker files
 * into themes concurrently; a stale read must not double-claim.
 */
async function applyFiling(
	atom: Statement,
	themeId: string,
): Promise<{ previous: string[]; next: string[] } | null> {
	const themeRef = db().collection(Collections.statements).doc(themeId);
	const ownersQuery = db()
		.collection(Collections.statements)
		.where('integratedOptions', 'array-contains', atom.statementId);

	try {
		return await db().runTransaction(async (tx) => {
			const themeSnap = await tx.get(themeRef);
			const ownersSnap = await tx.get(ownersQuery);
			const theme = themeSnap.exists ? (themeSnap.data() as Statement) : null;
			if (!theme || theme.hide === true) throw new Error('theme hidden or gone');
			const owned = ownersSnap.docs.some((d) => (d.data() as Statement).hide !== true);
			if (owned) throw new Error('atom no longer unthemed');

			const previous = theme.integratedOptions ?? [];
			const next = [...previous, atom.statementId];
			tx.update(themeRef, { integratedOptions: next, lastUpdate: Date.now() });

			return { previous, next };
		});
	} catch (error) {
		logger.warn('synthesis.fileUnthemed: filing not applied', {
			atomId: atom.statementId,
			themeId,
			error: error instanceof Error ? error.message : String(error),
		});

		return null;
	}
}

export async function fileUnthemedAtoms(
	parentId: string,
	questionContext: string,
	triggerSource: string,
	maxFiles: number = MAX_FILES_PER_SWEEP,
): Promise<FileUnthemedResult> {
	const result: FileUnthemedResult = { atoms: 0, filed: 0, refused: 0, skipped: 0, errors: 0 };

	let themes: Statement[];
	let titleById: Map<string, string>;
	let all: Statement[];
	try {
		({ themes, titleById, all } = await liveThemes(parentId));
	} catch (error) {
		logger.warn('synthesis.fileUnthemed: listing failed', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});

		return result;
	}
	// Never create a theme: with none, there is nothing to file into.
	if (themes.length === 0) return result;

	const atoms = findUnthemedAtoms(all, themes);
	result.atoms = atoms.length;
	if (atoms.length === 0) return result;

	const state = await loadState(parentId);
	let judgeCalls = 0;

	for (const atom of atoms) {
		if (judgeCalls >= maxFiles) break;

		const fingerprint = themeListFingerprint(atom.statementId, themes);
		if (state.judged?.[atom.statementId] === fingerprint) {
			result.skipped++;
			continue;
		}

		const options: ThemeOption[] = themes.map((t) => toThemeOption(t, titleById));
		judgeCalls++;
		let themeId: string | null;
		try {
			const decision = await assignToTheme({
				proposalTitle: atom.statement ?? '',
				proposalDescription: atom.description,
				themes: options,
				questionContext,
			});
			themeId = decision.themeId;
		} catch (error) {
			// Not recorded: the next sweep retries.
			result.errors++;
			logger.warn('synthesis.fileUnthemed: judge failed', {
				parentId,
				atomId: atom.statementId,
				error: error instanceof Error ? error.message : String(error),
			});
			continue;
		}

		// A verdict on THIS theme list, NONE included; do not re-ask until it changes.
		await recordJudged(parentId, atom.statementId, fingerprint);

		const theme = themeId ? themes.find((t) => t.statementId === themeId) : undefined;
		if (!theme) {
			result.refused++;
			continue;
		}

		const applied = await applyFiling(atom, theme.statementId);
		if (!applied) continue;

		// Keep this sweep's view current so later atoms see the contents.
		theme.integratedOptions = applied.next;
		titleById.set(atom.statementId, atom.statement ?? '');
		result.filed++;

		logger.info('synthesis.fileUnthemed.filed', {
			parentId,
			atomId: atom.statementId,
			topicClusterId: theme.statementId,
			triggerSource,
		});

		await recordLiveSynthEvent({
			action: 'attach',
			clusterId: theme.statementId,
			optionId: atom.statementId,
			reason: 'unthemed atom filed under theme by cron',
			prevState: { integratedOptions: applied.previous },
			newState: { integratedOptions: applied.next },
			triggerSource: `${triggerSource}:fileUnthemed`,
			parentStatementId: parentId,
		});

		await enqueueClusterRecompute(theme.statementId, `${triggerSource}:fileUnthemed`);
	}

	return result;
}
