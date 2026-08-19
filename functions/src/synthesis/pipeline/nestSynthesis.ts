import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, StatementType, type Statement, getRandomUID } from '@freedi/shared-types';
import { assignToTheme, generateTopicLabel, type ThemeOption } from '../../services/integration-ai-service';
import {
	enqueueClusterRecompute,
	findClustersContainingMember,
} from '../liveSynth/clusterRecompute';
import { recordLiveSynthEvent } from '../liveSynth/auditLog';
import { isTopicCluster } from './clusterOps';
import type { SynthesisSettings } from './types';

/**
 * Put a synthesis inside the theme it belongs to.
 *
 * The two layers were built to compete rather than nest: `spawnClusterFromPair`
 * only ever puts plain options into `integratedOptions`, so a synthesis was
 * never placed inside a topic cluster and five distinct transport ideas were
 * never assembled under "transport".
 *
 * Ownership model: a statement lives in its synthesis ONLY, and the theme
 * reaches it transitively, one level down. Single ownership at the member
 * level, nesting at the cluster level — the shape the scorer and the app's
 * 3-level view already read.
 *
 * WHY THE PLACEMENT IS AN LLM CALL. With the synthesis layer solved (F1 0.926,
 * every ground-truth pair recovered) the theme layer is the entire remaining
 * gap, and measurement says it is not a tuning gap. On the accuracy corpus:
 *
 *   same-theme synth pairs      median cosine 0.743
 *   different-theme synth pairs median cosine 0.670
 *
 *   best single pairwise cut, 3-small        F1 0.480
 *   best single pairwise cut, 3-large @1536  F1 0.535
 *   global agglomerative clustering to k=10  F1 0.432
 *   the shipped greedy pipeline reached      F1 0.388
 *
 * The pipeline was already at ~90% of its mechanism's ceiling; a better
 * embedding model buys ~0.05 and a global re-clustering sweep buys nothing.
 * Theme membership is a semantic judgement embedding distance does not encode
 * on a single-question corpus, so cosine is out of this decision entirely —
 * every live theme is offered to the judge, not a cosine-filtered shortlist.
 *
 * Best-effort throughout. A synthesis with no theme is a worse result than a
 * nested one, but it is not a broken one, so every failure path here logs and
 * returns rather than throwing into the trigger.
 */

function db() {
	return getFirestore();
}

/**
 * A question's live themes are capped so one pathological question cannot send
 * an unbounded prompt. Well past the ~10-15 a real question produces.
 */
const MAX_THEMES_IN_PROMPT = 60;

export interface NestInput {
	synthId: string;
	/** Members of the synthesis — what the theme must NOT also claim directly. */
	memberIds: string[];
	/** Title of the synthesis; what the judge actually reads. */
	synthTitle: string;
	synthDescription?: string;
	parent: Statement;
	settings: SynthesisSettings;
	triggerSource: string;
}

export interface NestResult {
	nested: boolean;
	topicClusterId?: string;
	/** True when the theme was created for this synthesis. */
	created?: boolean;
	reason: string;
}

/** Every live topic cluster under this question. */
async function liveThemes(parentId: string): Promise<Statement[]> {
	const snap = await db()
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('statementType', '==', StatementType.option)
		.get();

	return snap.docs
		.map((d) => d.data() as Statement)
		.filter((s) => s.isCluster === true && s.hide !== true && isTopicCluster(s))
		.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
		.slice(0, MAX_THEMES_IN_PROMPT);
}

/**
 * Create a theme around a single synthesis.
 *
 * A theme born from one synthesis is the correct starting state, not a
 * degenerate one: the judge above files later syntheses into it by name, so a
 * theme only has to exist and be well-labelled to start collecting. Themes used
 * to be born from a pair of raw options instead, which is what produced four
 * near-duplicate themes ("Public Service Access", "Essential service
 * accessibility", "Public access and mobility", "Community Support Services")
 * in a single run — each spawned because cosine could not see it already had a
 * home.
 */
async function createThemeForSynth(
	synthId: string,
	synthDoc: Statement,
	parent: Statement,
	triggerSource: string,
): Promise<NestResult> {
	let title: string;
	let description: string;
	try {
		const label = await generateTopicLabel(
			[synthDoc],
			parent.statement || parent.statementId,
		);
		title = label.title;
		description = label.description;
	} catch (error) {
		logger.warn('synthesis.nest: topic label generation failed', {
			synthId,
			error: error instanceof Error ? error.message : String(error),
		});

		return { nested: false, reason: 'theme-label-failed' };
	}

	const themeId = getRandomUID();
	const now = Date.now();
	const theme: Partial<Statement> & Record<string, unknown> = {
		statementId: themeId,
		statement: title,
		description,
		statementType: StatementType.option,
		parentId: parent.statementId,
		parents: [...(parent.parents ?? []), parent.statementId],
		topParentId: synthDoc.topParentId ?? parent.statementId,
		creatorId: synthDoc.creatorId,
		creator: synthDoc.creator,
		createdAt: now,
		lastUpdate: now,
		consensus: 0,
		integratedOptions: [synthId],
		isCluster: true,
		isSynthesis: false,
		derivedByPipeline: 'topic-cluster',
		synthesisMechanism: 'live-spawn',
		liveSynthOrigin: 'spawn',
		hide: false,
	};

	try {
		await db().collection(Collections.statements).doc(themeId).set(theme);
	} catch (error) {
		logger.warn('synthesis.nest: theme write failed', {
			synthId,
			themeId,
			error: error instanceof Error ? error.message : String(error),
		});

		return { nested: false, reason: 'theme-write-failed' };
	}

	logger.info('synthesis.pipeline.nest.themeCreated', {
		synthId,
		topicClusterId: themeId,
		title: title?.substring(0, 60),
		triggerSource,
	});

	await recordLiveSynthEvent({
		action: 'spawn',
		clusterId: themeId,
		optionId: synthId,
		reason: 'new theme created for synthesis (no existing theme fit)',
		prevState: { synthId },
		newState: { clusterId: themeId, integratedOptions: [synthId] },
		triggerSource: `${triggerSource}:themeCreate`,
		parentStatementId: parent.statementId,
	});

	await enqueueClusterRecompute(themeId, `${triggerSource}:themeCreate`);

	return { nested: true, topicClusterId: themeId, created: true, reason: 'new-theme' };
}

export async function nestSynthUnderTopic(input: NestInput): Promise<NestResult> {
	const { synthId, memberIds, synthTitle, synthDescription, parent, settings, triggerSource } =
		input;

	// Already themed? Nothing to do — and re-adding would double-claim.
	try {
		const owners = await findClustersContainingMember(synthId);
		if (owners.some((c) => c.hide !== true)) {
			return { nested: false, reason: 'already-themed' };
		}
	} catch (error) {
		logger.warn('synthesis.nest: ownership check failed', {
			synthId,
			error: error instanceof Error ? error.message : String(error),
		});

		return { nested: false, reason: 'ownership-check-failed' };
	}

	let themes: Statement[];
	try {
		themes = await liveThemes(parent.statementId);
	} catch (error) {
		logger.warn('synthesis.nest: theme listing failed', {
			synthId,
			error: error instanceof Error ? error.message : String(error),
		});

		return { nested: false, reason: 'theme-listing-failed' };
	}

	const options: ThemeOption[] = themes.map((t) => ({
		id: t.statementId,
		title: t.statement ?? '',
		description: t.description,
	}));

	const decision = await assignToTheme({
		proposalTitle: synthTitle,
		proposalDescription: synthDescription,
		themes: options,
		questionContext: parent.statement || parent.statementId,
	});

	if (!decision.themeId) {
		if (!settings.createThemesFromSyntheses) {
			return { nested: false, reason: `no-theme-fit: ${decision.reason}` };
		}
		const synthSnap = await db().collection(Collections.statements).doc(synthId).get();
		if (!synthSnap.exists) return { nested: false, reason: 'synth-not-found' };

		return createThemeForSynth(
			synthId,
			synthSnap.data() as Statement,
			parent,
			triggerSource,
		);
	}

	const theme = themes.find((t) => t.statementId === decision.themeId);
	if (!theme) return { nested: false, reason: 'chosen-theme-vanished' };

	const previous = theme.integratedOptions ?? [];
	if (previous.includes(synthId)) return { nested: false, reason: 'already-member' };
	// Any of the synthesis's members sitting directly in the theme are replaced by
	// the synthesis itself, so nothing is claimed twice.
	const next = [...previous.filter((id) => !memberIds.includes(id)), synthId];

	try {
		await db()
			.collection(Collections.statements)
			.doc(theme.statementId)
			.update({ integratedOptions: next, lastUpdate: Date.now() });
	} catch (error) {
		logger.warn('synthesis.nest: theme update failed', {
			synthId,
			topicClusterId: theme.statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return { nested: false, reason: 'theme-update-failed' };
	}

	logger.info('synthesis.pipeline.nest', {
		synthId,
		topicClusterId: theme.statementId,
		themeTitle: theme.statement?.substring(0, 60),
		reason: decision.reason,
		themeMemberCount: next.length,
		themesOffered: options.length,
		triggerSource,
	});

	await recordLiveSynthEvent({
		action: 'attach',
		clusterId: theme.statementId,
		optionId: synthId,
		reason: `nest synthesis under theme (judge: ${decision.reason})`,
		prevState: { integratedOptions: previous },
		newState: { integratedOptions: next },
		triggerSource: `${triggerSource}:nest`,
		parentStatementId: parent.statementId,
	});

	await enqueueClusterRecompute(theme.statementId, `${triggerSource}:nest`);

	return { nested: true, topicClusterId: theme.statementId, reason: 'judged' };
}

/**
 * File a PLAIN OPTION into an existing theme, when cosine could not.
 *
 * The theme judge was first wired only to syntheses, and that left a hole:
 * turning off theme-spawn-from-option-pairs removed the path that used to place
 * an option with no twin yet, and the measured result was `review-queued`
 * jumping from 7 to 42 in one run — a queue nothing drains.
 *
 * Deliberately NOT allowed to create a theme. Only a synthesis may do that. An
 * option is one person's wording of one idea and makes a poor seed for a theme
 * label, and letting every unplaced option mint a theme is how a question ends
 * up with more themes than ideas. An option that fits no existing theme simply
 * waits — for its twin, or for a theme it fits to appear.
 */
export async function assignOptionToTheme(input: {
	option: Statement;
	parent: Statement;
	triggerSource: string;
}): Promise<{ themeId: string | null; reason: string }> {
	const { option, parent, triggerSource } = input;

	let themes: Statement[];
	try {
		themes = await liveThemes(parent.statementId);
	} catch (error) {
		logger.warn('synthesis.nest: theme listing failed for option', {
			optionId: option.statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return { themeId: null, reason: 'theme-listing-failed' };
	}
	if (themes.length === 0) return { themeId: null, reason: 'no-themes-yet' };

	const decision = await assignToTheme({
		proposalTitle: option.statement ?? '',
		proposalDescription: option.description,
		themes: themes.map((t) => ({
			id: t.statementId,
			title: t.statement ?? '',
			description: t.description,
		})),
		questionContext: parent.statement || parent.statementId,
	});
	if (!decision.themeId) return { themeId: null, reason: decision.reason };

	const theme = themes.find((t) => t.statementId === decision.themeId);
	if (!theme) return { themeId: null, reason: 'chosen-theme-vanished' };

	const previous = theme.integratedOptions ?? [];
	if (previous.includes(option.statementId)) {
		return { themeId: theme.statementId, reason: 'already-member' };
	}
	const next = [...previous, option.statementId];

	try {
		await db()
			.collection(Collections.statements)
			.doc(theme.statementId)
			.update({ integratedOptions: next, lastUpdate: Date.now() });
	} catch (error) {
		logger.warn('synthesis.nest: theme update failed for option', {
			optionId: option.statementId,
			topicClusterId: theme.statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return { themeId: null, reason: 'theme-update-failed' };
	}

	logger.info('synthesis.pipeline.optionThemed', {
		optionId: option.statementId,
		topicClusterId: theme.statementId,
		reason: decision.reason,
		themesOffered: themes.length,
		triggerSource,
	});

	await recordLiveSynthEvent({
		action: 'attach',
		clusterId: theme.statementId,
		optionId: option.statementId,
		reason: `option filed under theme (judge: ${decision.reason})`,
		prevState: { integratedOptions: previous },
		newState: { integratedOptions: next },
		triggerSource: `${triggerSource}:optionTheme`,
		parentStatementId: parent.statementId,
	});

	await enqueueClusterRecompute(theme.statementId, `${triggerSource}:optionTheme`);

	return { themeId: theme.statementId, reason: 'judged' };
}
