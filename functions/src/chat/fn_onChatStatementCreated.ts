/**
 * `onChatStatementCreated` (§5b) — Firestore `onCreate` on `statements/{id}`,
 * guarded to **evidence edges only**:
 *   parent ∈ {option, evidence} AND child.statementType === evidence.
 *
 * Pipeline: score → write the verdict to `evidenceVerdicts/{id}/versions/{ver}`
 * (retains features+rationale) → denormalize the active verdict onto the
 * statement → `recomputeAncestors`. On any scorer error, falls back to a
 * `user-fallback` verdict (never hard-fails the write). Non-evidence nodes are
 * never AI-scored.
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { FirestoreEvent, QueryDocumentSnapshot } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	StatementType,
	EvidenceRelation,
	EvidenceStatus,
	DialogicType,
	SourceApp,
} from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import {
	getScorer,
	getIndependence,
	createTaxonomy,
	type EvidenceVerdict,
	type DialecticPolarity,
} from '@freedi/evidence';
import { recomputeAncestors } from './recomputeAncestors';
import './scorerV1'; // registers evidenceScorerV1

const taxonomy = createTaxonomy();
const VERDICTS = 'evidenceVerdicts';

function relationToDialectic(relation: string): DialogicType {
	if (relation === EvidenceRelation.corroborate) return DialogicType.strengthen;
	if (relation === EvidenceRelation.falsify) return DialogicType.critique;

	return DialogicType.standard;
}

export async function onChatStatementCreated(
	event: FirestoreEvent<QueryDocumentSnapshot | undefined, { statementId: string }>,
): Promise<void> {
	const child = event.data?.data() as Statement | undefined;
	if (!child) return;

	// Chat-only: ignore statements from other apps.
	if (child.sourceApp !== SourceApp.CHAT) return;
	if (child.statementType !== StatementType.evidence) return;

	const db = getFirestore();
	const parentSnap = await db.collection(Collections.statements).doc(child.parentId).get();
	const parent = parentSnap.data() as Statement | undefined;
	if (!parent) return;

	const isEvidenceEdge =
		parent.statementType === StatementType.option || parent.statementType === StatementType.evidence;
	if (!isEvidenceEdge) return;

	const pill = (child.dialecticType as DialecticPolarity) ?? 'standard';

	let verdict: EvidenceVerdict;
	try {
		verdict = await getScorer().score({
			parentText: parent.statement,
			statementText: child.statement,
			threadContext: parent.replyTo?.statement,
			userPillHint: pill,
		});

		// Independence against sibling evidence under the same parent (§1.3 seam 4).
		const siblingsSnap = await db
			.collection(Collections.statements)
			.where('parentId', '==', child.parentId)
			.where('statementType', '==', StatementType.evidence)
			.get();
		const siblingVerdicts: EvidenceVerdict[] = siblingsSnap.docs
			.filter((d) => d.id !== child.statementId)
			.map((d) => d.data())
			.filter((s) => typeof s.effectiveWeight === 'number')
			.map((s) => ({
				relation: (s.relation as EvidenceRelation) ?? EvidenceRelation.neutral,
				evidenceClass: s.evidenceClass ?? '',
				baseStrength: 0,
				confidence: s.evidenceConfidence ?? 0,
				independenceFactor: s.effectiveWeight ?? 1,
				effectiveWeight: s.effectiveWeight ?? 1,
				rationale: '',
				source: 'ai',
			}));
		const independence = await getIndependence().estimate({
			candidate: verdict,
			siblingVerdicts,
			// embeddings omitted in v1 → independence defaults to 1 (open problem §8).
		});
		verdict.independenceFactor = independence;
		verdict.effectiveWeight = independence;
	} catch (error) {
		logger.error('[onChatStatementCreated] scorer failed, using fallback', {
			statementId: child.statementId,
			error: error instanceof Error ? error.message : String(error),
		});
		verdict = {
			relation:
				pill === 'critique'
					? EvidenceRelation.falsify
					: pill === 'strengthen'
						? EvidenceRelation.corroborate
						: EvidenceRelation.neutral,
			evidenceClass: `pill:${pill}`,
			baseStrength: taxonomy.fallbackForPill(pill),
			confidence: 0,
			independenceFactor: 1,
			effectiveWeight: 1,
			rationale: 'Automatic fallback — scorer unavailable.',
			source: 'user-fallback',
		};
	}

	const scorerVersion = getScorer().version;

	// Retain the full verdict (features + rationale) non-destructively.
	await db
		.collection(VERDICTS)
		.doc(child.statementId)
		.collection('versions')
		.doc(scorerVersion)
		.set({ ...verdict, statementId: child.statementId, scorerVersion, createdAt: Date.now() });

	// Denormalize the active verdict onto the statement.
	const lowConfidence = verdict.source === 'user-fallback' || verdict.lowConfidence === true;
	const dialecticType = lowConfidence
		? ((child.dialecticType as DialogicType) ?? DialogicType.standard)
		: relationToDialectic(verdict.relation);

	await db
		.collection(Collections.statements)
		.doc(child.statementId)
		.update({
			relation: verdict.relation,
			dialecticType,
			evidenceClass: verdict.evidenceClass,
			effectiveWeight: verdict.effectiveWeight,
			evidenceConfidence: verdict.confidence,
			activeScorerVersion: scorerVersion,
			evidenceStatus:
				verdict.source === 'user-fallback' ? EvidenceStatus.fallback : EvidenceStatus.scored,
			lastUpdate: Date.now(),
		});

	await recomputeAncestors(child.statementId);
}
