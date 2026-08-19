import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement } from '@freedi/shared-types';
import { vectorSearchService } from '../../services/vector-search-service';
import { embeddingCache } from '../../services/embedding-cache-service';
import {
	enqueueClusterRecompute,
	findClustersContainingMember,
} from '../liveSynth/clusterRecompute';
import { recordLiveSynthEvent } from '../liveSynth/auditLog';
import { assessCohesion, centroidOf, passesTopicCohesionGate } from './clusterCohesion';
import { isSynth, isTopicCluster } from './clusterOps';
import type { SynthesisSettings } from './types';

/**
 * Put a synthesis inside the theme it belongs to.
 *
 * The two layers were built to compete rather than nest: `spawnClusterFromPair`
 * only ever puts plain options into `integratedOptions`, so a synthesis was
 * never placed inside a topic cluster and five distinct transport ideas were
 * never assembled under "transport". The accuracy benchmark measured the cost
 * exactly — six of ten themes scored 2/10, meaning the only grouping standing
 * for the theme was a single merged twin pair. It is what caps the headline
 * score at ~0.73 no matter how well the synthesis half performs.
 *
 * Ownership model: a statement lives in its synthesis ONLY, and the theme
 * reaches it transitively, one level down. Single ownership at the member
 * level, nesting at the cluster level — the shape the scorer and the app's
 * 3-level view already read.
 *
 * The synthesis is matched to a theme on the centroid of its MEMBERS, not on
 * its own title embedding: an LLM-merged title abstracts and shortens, and
 * drifts away from the theme its members plainly sit in. The members are also
 * embedded synchronously on create, whereas the cluster's own embedding lands
 * asynchronously and may not exist yet at the moment of spawn.
 *
 * Best-effort throughout. A synthesis with no theme is a worse result than a
 * nested one, but it is not a broken one, so every failure path here logs and
 * returns rather than throwing into the trigger.
 */

const NEST_NEIGHBOR_LIMIT = 10;

function db() {
	return getFirestore();
}

export interface NestInput {
	synthId: string;
	/** Members of the synthesis, used to derive its position. */
	memberIds: string[];
	parent: Statement;
	settings: SynthesisSettings;
	triggerSource: string;
}

export interface NestResult {
	nested: boolean;
	topicClusterId?: string;
	reason: string;
}

/**
 * Candidate themes for a synthesis: topic clusters in the synthesis's own
 * neighbourhood, plus the topic clusters that own any plain option in that
 * neighbourhood. The second half matters because a theme's title is a short
 * abstract label ("transport") whose direct cosine to a concrete proposal is
 * often well below its members' — the same title-drift that transitive
 * evidence solves for attach.
 */
async function candidateTopicClusters(
	centroid: number[],
	parentId: string,
	settings: SynthesisSettings,
	excludeIds: Set<string>,
): Promise<Map<string, Statement>> {
	const found = new Map<string, Statement>();
	const neighbors = await vectorSearchService.findSimilarByEmbedding(centroid, parentId, {
		limit: NEST_NEIGHBOR_LIMIT,
		threshold: settings.reviewLowerBound,
	});

	const plainNeighborIds: string[] = [];
	for (const n of neighbors) {
		const s = n.statement;
		if (excludeIds.has(s.statementId)) continue;
		if (isTopicCluster(s) && (s.integratedOptions ?? []).length > 0) {
			found.set(s.statementId, s);
			continue;
		}
		if (!isSynth(s) && (s.integratedOptions ?? []).length === 0) {
			plainNeighborIds.push(s.statementId);
		}
	}

	for (const neighborId of plainNeighborIds) {
		const owners = await findClustersContainingMember(neighborId);
		for (const owner of owners) {
			if (owner.hide === true) continue;
			if (!isTopicCluster(owner)) continue;
			if (excludeIds.has(owner.statementId)) continue;
			found.set(owner.statementId, owner);
		}
	}

	return found;
}

export async function nestSynthUnderTopic(input: NestInput): Promise<NestResult> {
	const { synthId, memberIds, parent, settings, triggerSource } = input;

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

	let memberVectors: number[][];
	try {
		const fetched = await embeddingCache.getBatchEmbeddings(memberIds);
		if (!fetched || typeof fetched.get !== 'function') {
			return { nested: false, reason: 'no-member-embeddings' };
		}
		memberVectors = memberIds
			.map((id) => fetched.get(id))
			.filter((v): v is number[] => Array.isArray(v) && v.length > 0);
	} catch (error) {
		logger.warn('synthesis.nest: member embedding fetch failed', {
			synthId,
			error: error instanceof Error ? error.message : String(error),
		});

		return { nested: false, reason: 'member-embedding-fetch-failed' };
	}
	if (memberVectors.length === 0) return { nested: false, reason: 'no-member-embeddings' };

	const synthCentroid = centroidOf(memberVectors);
	if (synthCentroid.length === 0) return { nested: false, reason: 'no-centroid' };

	const exclude = new Set<string>([synthId, ...memberIds]);
	let candidates: Map<string, Statement>;
	try {
		candidates = await candidateTopicClusters(synthCentroid, parent.statementId, settings, exclude);
	} catch (error) {
		logger.warn('synthesis.nest: candidate search failed', {
			synthId,
			error: error instanceof Error ? error.message : String(error),
		});

		return { nested: false, reason: 'candidate-search-failed' };
	}
	if (candidates.size === 0) return { nested: false, reason: 'no-candidate-themes' };

	// Score every candidate theme on the same centroid gate that governs a plain
	// option's topic attach, then take the best. Using the same gate is the point:
	// a synthesis joins a theme on exactly the terms its members would have.
	const gate = {
		centroidFloor: settings.synthLowerBound,
		memberFloor: settings.clusterThreshold,
		quorumFraction: 0.5,
	};

	const themeMemberIds = new Set<string>();
	for (const theme of candidates.values()) {
		for (const m of theme.integratedOptions ?? []) themeMemberIds.add(m);
	}
	let themeMemberEmbeddings: Map<string, number[]>;
	try {
		const fetched = await embeddingCache.getBatchEmbeddings(Array.from(themeMemberIds));
		themeMemberEmbeddings =
			fetched && typeof fetched.get === 'function' ? fetched : new Map<string, number[]>();
	} catch {
		themeMemberEmbeddings = new Map<string, number[]>();
	}

	let best: { theme: Statement; centroidCosine: number } | null = null;
	for (const theme of candidates.values()) {
		const vecs = (theme.integratedOptions ?? [])
			.map((id) => themeMemberEmbeddings.get(id))
			.filter((v): v is number[] => Array.isArray(v) && v.length > 0);
		// Fail CLOSED here, unlike the attach gate. An attach that cannot measure
		// cohesion falls back to a cosine the caller already checked; a nest with
		// no measurement at all would be a guess.
		if (vecs.length === 0) continue;
		const cohesion = assessCohesion(vecs, synthCentroid, gate.memberFloor);
		if (!passesTopicCohesionGate(cohesion, gate)) continue;
		if (!best || cohesion.centroidCosine > best.centroidCosine) {
			best = { theme, centroidCosine: cohesion.centroidCosine };
		}
	}
	if (!best) return { nested: false, reason: 'no-theme-passed-cohesion' };

	const previous = best.theme.integratedOptions ?? [];
	if (previous.includes(synthId)) return { nested: false, reason: 'already-member' };
	// Any of the synthesis's members sitting directly in the theme are replaced by
	// the synthesis itself, so nothing is claimed twice.
	const next = [...previous.filter((id) => !memberIds.includes(id)), synthId];

	try {
		await db()
			.collection(Collections.statements)
			.doc(best.theme.statementId)
			.update({ integratedOptions: next, lastUpdate: Date.now() });
	} catch (error) {
		logger.warn('synthesis.nest: theme update failed', {
			synthId,
			topicClusterId: best.theme.statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return { nested: false, reason: 'theme-update-failed' };
	}

	logger.info('synthesis.pipeline.nest', {
		synthId,
		topicClusterId: best.theme.statementId,
		centroidCosine: Number(best.centroidCosine.toFixed(3)),
		themeMemberCount: next.length,
		triggerSource,
	});

	await recordLiveSynthEvent({
		action: 'attach',
		clusterId: best.theme.statementId,
		optionId: synthId,
		reason: `nest synthesis under theme centroid=${best.centroidCosine.toFixed(3)}`,
		prevState: { integratedOptions: previous },
		newState: { integratedOptions: next },
		triggerSource: `${triggerSource}:nest`,
		parentStatementId: parent.statementId,
	});

	await enqueueClusterRecompute(best.theme.statementId, `${triggerSource}:nest`);

	return { nested: true, topicClusterId: best.theme.statementId, reason: 'nested' };
}
