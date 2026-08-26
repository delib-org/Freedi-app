/**
 * The Odyssey "voyage story" email digest — the async bridge of the game.
 *
 * A player who left the sea gets, at hours they chose, a short Hebrew
 * narrative of what actually changed since their last digest: new sailors
 * near their position, consensus shifts on islands they visited, islands
 * still waiting, and one standing challenge from an elder — with a single
 * call back to the map. When nothing changed, nothing is sent.
 *
 * Per-user diff state lives in `odysseyDigestState/{uid}`.
 */
import { getFirestore } from 'firebase-admin/firestore';
import {
	Collections,
	ODYSSEY_DEFAULT_GAME_ID,
	ODYSSEY_GAME_FIELD,
	opinionDistance,
	type AttitudeMap,
	type Evaluation,
	type OdysseyElder,
	type OdysseyGame,
	type OdysseyJourney,
} from '@freedi/shared-types';
import { createOdysseyJourneyId } from '@freedi/shared-types';

const getDb = () => getFirestore();

/** Sailors closer than this count as "near you" (0 = same course, 1 = opposite). */
const NEARBY_DISTANCE = 0.35;

export interface OdysseyDigestState {
	userId: string;
	lastDigestAt: number;
	/** island statementId → the top-supported stance at the last digest */
	islandTopStances: Record<string, string>;
	/** The elder whose challenge went out last — rotated every digest */
	lastElderId: string;
	lastUpdate: number;
}

export interface OdysseyDigest {
	subject: string;
	/** Plain-text fallback carried on the queue item body */
	bodyText: string;
	/** Full RTL HTML for the email channel */
	emailHtml: string;
}

interface DigestSections {
	newSailorsNear: number;
	newSailorsTotal: number;
	consensusShifts: { islandTitle: string; stanceText: string }[];
	unvisitedTitles: string[];
	elderChallenge: { elderName: string; elderRole: string; line: string } | null;
}

/** An elder's declared course as a virtual attitude map (party arithmetic). */
function elderAttitudes(
	elder: OdysseyElder,
	game: OdysseyGame,
	stancesByIsland: Map<string, string[]>,
): AttitudeMap {
	const attitudes: AttitudeMap = {};
	for (const island of game.islands) {
		const declared = elder.positions[island.statementId];
		const stanceIds = stancesByIsland.get(island.statementId);
		if (!declared || !stanceIds) continue;
		for (const stanceId of stanceIds) attitudes[stanceId] = -1;
		attitudes[declared] = 1;
	}

	return attitudes;
}

function attitudeMapsByUser(evaluations: Evaluation[]): Map<string, AttitudeMap> {
	const maps = new Map<string, AttitudeMap>();
	for (const evaluation of evaluations) {
		const map = maps.get(evaluation.evaluatorId) ?? {};
		map[evaluation.statementId] = evaluation.evaluation;
		maps.set(evaluation.evaluatorId, map);
	}

	return maps;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Build one user's digest, or null when nothing changed since the last one.
 * Reads game + journey + all game evaluations; updates nothing — the caller
 * persists the new state AFTER the queue item is enqueued successfully.
 */
export async function buildOdysseyDigest(input: {
	userId: string;
	gameId?: string;
	appBaseUrl: string;
	unsubscribeUrl: string;
}): Promise<{ digest: OdysseyDigest; nextState: OdysseyDigestState } | null> {
	const { userId, appBaseUrl, unsubscribeUrl } = input;
	const gameId = input.gameId ?? ODYSSEY_DEFAULT_GAME_ID;
	const db = getDb();

	const [gameSnap, journeySnap, stateSnap, evaluationsSnap] = await Promise.all([
		db.collection(Collections.odysseyGames).doc(gameId).get(),
		db.collection(Collections.odysseyJourneys).doc(createOdysseyJourneyId(userId, gameId)).get(),
		db.collection(Collections.odysseyDigestState).doc(userId).get(),
		db.collection(Collections.evaluations).where(ODYSSEY_GAME_FIELD, '==', gameId).get(),
	]);
	if (!gameSnap.exists) return null;
	const game = gameSnap.data() as OdysseyGame;
	const journey = journeySnap.exists ? (journeySnap.data() as OdysseyJourney) : null;
	const state = stateSnap.exists ? (stateSnap.data() as OdysseyDigestState) : null;
	const lastDigestAt = state?.lastDigestAt ?? 0;

	const evaluations = evaluationsSnap.docs.map((doc) => doc.data() as Evaluation);
	const byUser = attitudeMapsByUser(evaluations);
	const mine = byUser.get(userId) ?? {};

	const enabledIslands = game.islands.filter((island) => island.enabled);
	const stancesByIsland = new Map<string, string[]>();
	for (const evaluation of evaluations) {
		// Stance→island mapping recovered from parentId, which every stance
		// evaluation carries (parent of a stance option is the island question).
		const list = stancesByIsland.get(evaluation.parentId) ?? [];
		if (!list.includes(evaluation.statementId)) list.push(evaluation.statementId);
		stancesByIsland.set(evaluation.parentId, list);
	}

	// --- Section 1: new sailors near you -------------------------------------
	const updatedSince = new Set(
		evaluations
			.filter(
				(evaluation) =>
					(evaluation.updatedAt ?? 0) > lastDigestAt && evaluation.evaluatorId !== userId,
			)
			.map((evaluation) => evaluation.evaluatorId),
	);
	let newSailorsNear = 0;
	for (const sailorId of updatedSince) {
		const theirs = byUser.get(sailorId);
		if (!theirs) continue;
		const { distance } = opinionDistance(mine, theirs);
		if (distance !== null && distance < NEARBY_DISTANCE) newSailorsNear += 1;
	}

	// --- Section 2: consensus shifts on islands I visited ---------------------
	const myIslands = enabledIslands.filter((island) =>
		(stancesByIsland.get(island.statementId) ?? []).some(
			(stanceId) => mine[stanceId] !== undefined,
		),
	);
	const meanByStance = new Map<string, { sum: number; count: number }>();
	for (const evaluation of evaluations) {
		const entry = meanByStance.get(evaluation.statementId) ?? { sum: 0, count: 0 };
		entry.sum += evaluation.evaluation;
		entry.count += 1;
		meanByStance.set(evaluation.statementId, entry);
	}
	const topStanceOf = (islandId: string): string | null => {
		let best: string | null = null;
		let bestMean = -Infinity;
		for (const stanceId of stancesByIsland.get(islandId) ?? []) {
			const entry = meanByStance.get(stanceId);
			if (!entry) continue;
			const mean = entry.sum / entry.count;
			if (mean > bestMean) {
				bestMean = mean;
				best = stanceId;
			}
		}

		return best;
	};

	const stanceTextById = new Map<string, string>();
	const consensusShifts: DigestSections['consensusShifts'] = [];
	const nextTopStances: Record<string, string> = {};
	for (const island of myIslands) {
		const top = topStanceOf(island.statementId);
		if (!top) continue;
		nextTopStances[island.statementId] = top;
		const previous = state?.islandTopStances?.[island.statementId];
		if (previous && previous !== top) {
			consensusShifts.push({ islandTitle: island.title, stanceText: top });
			stanceTextById.set(top, '');
		}
	}
	// Fetch the shifted stances' texts (only the few that actually flipped).
	if (stanceTextById.size > 0) {
		const snaps = await db.getAll(
			...[...stanceTextById.keys()].map((id) => db.collection(Collections.statements).doc(id)),
		);
		for (const snap of snaps) {
			const text = (snap.data() as { statement?: string } | undefined)?.statement;
			if (text) stanceTextById.set(snap.id, text);
		}
		for (const shift of consensusShifts) {
			shift.stanceText = stanceTextById.get(shift.stanceText) || shift.stanceText;
		}
	}

	// --- Section 3: islands still waiting ------------------------------------
	const unvisitedTitles = enabledIslands
		.filter(
			(island) =>
				!(stancesByIsland.get(island.statementId) ?? []).some(
					(stanceId) => mine[stanceId] !== undefined,
				),
		)
		.map((island) => island.title);

	// --- Section 4: an elder's standing challenge ----------------------------
	const elders =
		game.script?.eldersEnabled === false
			? []
			: (game.elders ?? [])
					.filter((elder) => elder.enabled)
					.sort((a, b) => a.sortOrder - b.sortOrder);
	let elderChallenge: DigestSections['elderChallenge'] = null;
	let nextElderId = state?.lastElderId ?? '';
	if (elders.length > 0) {
		const lastIndex = elders.findIndex((elder) => elder.elderId === state?.lastElderId);
		const elder = elders[(lastIndex + 1) % elders.length];
		nextElderId = elder.elderId;
		// The island where this elder most opposes the player's marked course.
		const virtual = elderAttitudes(elder, game, stancesByIsland);
		let bestIsland: string | null = null;
		let bestGap = -Infinity;
		for (const island of enabledIslands) {
			if (!elder.challenges[island.statementId]) continue;
			let gap = 0;
			for (const stanceId of stancesByIsland.get(island.statementId) ?? []) {
				if (mine[stanceId] === undefined || virtual[stanceId] === undefined) continue;
				gap += Math.abs(mine[stanceId] - virtual[stanceId]);
			}
			if (gap > bestGap) {
				bestGap = gap;
				bestIsland = island.statementId;
			}
		}
		if (bestIsland) {
			elderChallenge = {
				elderName: elder.name,
				elderRole: elder.role,
				line: elder.challenges[bestIsland],
			};
		}
	}

	const sections: DigestSections = {
		newSailorsNear,
		newSailorsTotal: updatedSince.size,
		consensusShifts,
		unvisitedTitles,
		elderChallenge,
	};

	// Only actual MOVEMENT justifies a send — new sailors or a flipped wind.
	// Unvisited islands and the elder's challenge are standing facts; mailing
	// them on their own, digest after digest, would train the reader to
	// ignore us.
	const somethingChanged =
		journey !== null && (sections.newSailorsTotal > 0 || sections.consensusShifts.length > 0);
	if (!somethingChanged) return null;

	const gameTitle = game.texts.gameTitle || 'אודיסיאה ישראלית';
	const digest = renderDigest({
		gameTitle,
		sections,
		mapUrl: `${appBaseUrl.replace(/\/$/, '')}/map`,
		unsubscribeUrl,
	});

	const now = Date.now();

	return {
		digest,
		nextState: {
			userId,
			lastDigestAt: now,
			islandTopStances: { ...state?.islandTopStances, ...nextTopStances },
			lastElderId: nextElderId,
			lastUpdate: now,
		},
	};
}

function renderDigest(input: {
	gameTitle: string;
	sections: DigestSections;
	mapUrl: string;
	unsubscribeUrl: string;
}): OdysseyDigest {
	const { gameTitle, sections, mapUrl, unsubscribeUrl } = input;
	const lines: string[] = [];

	if (sections.newSailorsNear > 0) {
		lines.push(
			sections.newSailorsNear === 1
				? 'מפליג/ה חדש/ה אחד/אחת שט/ה קרוב מאוד למסלול שלכם.'
				: `${sections.newSailorsNear} מפליגים חדשים שטים קרוב למסלול שלכם.`,
		);
	} else if (sections.newSailorsTotal > 0) {
		lines.push(`${sections.newSailorsTotal} מפליגים סימנו עמדות חדשות בים מאז הביקור האחרון שלכם.`);
	}
	for (const shift of sections.consensusShifts) {
		lines.push(`באי ${shift.islandTitle} הרוח התהפכה — החוף המוביל עכשיו: "${shift.stanceText}".`);
	}
	if (sections.unvisitedTitles.length > 0) {
		const named = sections.unvisitedTitles.slice(0, 3).join(', ');
		lines.push(
			sections.unvisitedTitles.length === 1
				? `אי אחד עוד מחכה לכם: ${named}.`
				: `${sections.unvisitedTitles.length} איים עוד מחכים לכם, ביניהם ${named}.`,
		);
	}

	const subject =
		sections.consensusShifts.length > 0
			? `${gameTitle}: הרוח התהפכה באי ${sections.consensusShifts[0].islandTitle}`
			: sections.newSailorsNear > 0
				? `${gameTitle}: מפליגים חדשים קרובים אליכם`
				: `${gameTitle}: הים ממשיך לזוז`;

	const challenge = sections.elderChallenge;
	const bodyText = [
		...lines,
		...(challenge ? [`${challenge.elderName}: "${challenge.line}"`] : []),
		`חזרו אל המפה: ${mapUrl}`,
	].join('\n');

	const listItems = lines
		.map((line) => `<li style="margin:0 0 10px">${escapeHtml(line)}</li>`)
		.join('');
	const challengeHtml = challenge
		? `<div style="margin:18px 0;padding:14px 16px;border-right:4px solid #e8b958;background:#0d2740;border-radius:10px">
			<p style="margin:0 0 6px;font-weight:700">📜 ${escapeHtml(challenge.elderName)} · <span style="font-weight:400;opacity:.8">${escapeHtml(challenge.elderRole)}</span></p>
			<p style="margin:0;font-style:italic">${escapeHtml(challenge.line)}</p>
			<p style="margin:8px 0 0;font-size:11px;opacity:.6">דמות בינה מלאכותית בהשראת דמות היסטורית</p>
		</div>`
		: '';

	const emailHtml = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<body style="margin:0;padding:0;background:#04121f;font-family:Arial,'Segoe UI',sans-serif;color:#e6f2fb">
	<div style="max-width:560px;margin:0 auto;padding:28px 20px">
		<h1 style="margin:0 0 4px;font-size:22px;color:#fff4d3">⛵ ${escapeHtml(gameTitle)}</h1>
		<p style="margin:0 0 18px;font-size:14px;opacity:.8">סיפור המסע שלכם — מה קרה בים מאז שירדתם לחוף</p>
		<ul style="margin:0;padding:0 18px 0 0;font-size:15px;line-height:1.6">${listItems}</ul>
		${challengeHtml}
		<div style="text-align:center;margin:24px 0">
			<a href="${mapUrl}" style="display:inline-block;background:#e8b958;color:#04121f;font-weight:700;font-size:16px;padding:12px 28px;border-radius:999px;text-decoration:none">חזרה אל הים ⛵</a>
		</div>
		<p style="margin:24px 0 0;font-size:11px;opacity:.55;text-align:center">
			קיבלתם את המייל הזה כי ביקשתם עדכונים מהמסע.
			<a href="${unsubscribeUrl}" style="color:#9fd7ff">להסרה מרשימת התפוצה</a>
		</p>
	</div>
</body>
</html>`;

	return { subject, bodyText, emailHtml };
}
