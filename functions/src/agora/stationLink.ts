import { HttpsError } from 'firebase-functions/v2/https';
import {
	AGORA_LINKABLE_APPS,
	AGORA_STATION_LINK,
	AgoraStage,
	Collections,
	StatementType,
	parseStationLink,
	type AgoraLinkedApp,
	type AgoraStagePlanItem,
	type AgoraStationLink,
	type CheckStationLinkResponse,
	type Statement,
	type StationLinkError,
} from '@freedi/shared-types';
import { db } from '../db';
import { assertStatementAdmin } from '../progress/assertStatementAdmin';

/**
 * The server half of linked stations: is this link a question the teacher
 * administers, and where do the apps live. The origins are constants per
 * environment — the deep link is built here, never from a client's URL.
 */

const isEmulator = (): boolean => process.env.FUNCTIONS_EMULATOR === 'true';

const MAIN_ORIGIN_BY_PROJECT: Readonly<Record<string, string>> = {
	'wizcol-app': 'https://app.wizcol.com',
	'freedi-test': 'https://freedi-test.web.app',
};

/** The main app's origin: STATION_MAIN_ORIGIN, else the project's own host */
export function mainAppOrigin(): string {
	const override = process.env.STATION_MAIN_ORIGIN?.trim();
	if (override) return override.replace(/\/+$/, '');
	if (isEmulator()) return 'http://localhost:5173';
	const project = process.env.GCLOUD_PROJECT ?? '';

	return MAIN_ORIGIN_BY_PROJECT[project] ?? MAIN_ORIGIN_BY_PROJECT['wizcol-app'];
}

export function appOrigin(app: AgoraLinkedApp): string {
	if (app === 'main') return mainAppOrigin();
	throw new HttpsError('failed-precondition', 'This app cannot be linked yet');
}

/** Refuse with the editor's own error key in the details */
export function refuseLink(reason: StationLinkError, message: string): never {
	throw new HttpsError(
		reason === 'not_admin'
			? 'permission-denied'
			: reason === 'not_found'
				? 'not-found'
				: 'invalid-argument',
		message,
		{ reason },
	);
}

/** The words a station shows for its question, clipped to the plan's limit */
export function linkTitleOf(statement: Pick<Statement, 'statement'>): string {
	return (statement.statement ?? '').trim().slice(0, AGORA_STATION_LINK.MAX_TITLE);
}

/**
 * A question in `app` the caller administers. Agora never writes into it;
 * the students do, in that app, as themselves.
 */
export async function checkStationStatement(
	app: AgoraLinkedApp,
	statementId: string,
	uid: string,
): Promise<CheckStationLinkResponse> {
	if (!AGORA_LINKABLE_APPS.includes(app)) refuseLink('bad_link', 'This app cannot be linked yet');
	const snap = await db.collection(Collections.statements).doc(statementId).get();
	if (!snap.exists) refuseLink('not_found', 'Question not found');
	const statement = snap.data() as Statement;
	if (statement.statementType !== StatementType.question) {
		refuseLink('not_question', 'This link is not a question');
	}
	try {
		await assertStatementAdmin(uid, statement, 'agora.checkStationStatement');
	} catch (error) {
		if (error instanceof HttpsError && error.code === 'permission-denied') {
			refuseLink('not_admin', "Only the question's admin can link it");
		}
		throw error;
	}

	return { app, statementId, title: linkTitleOf(statement) };
}

/** Parse a pasted link and check it — `agoraCheckStationLink`'s whole job */
export async function checkStationLink(
	url: unknown,
	uid: string,
): Promise<CheckStationLinkResponse> {
	const parsed =
		typeof url === 'string' ? parseStationLink(url, { allowLocalhost: isEmulator() }) : null;
	if (!parsed) refuseLink('bad_link', 'That is not a WizCol question link');

	return checkStationStatement(parsed.app, parsed.statementId, uid);
}

const sameLink = (a: AgoraStationLink | undefined, b: AgoraStationLink | undefined): boolean =>
	!!a && !!b && a.app === b.app && a.statementId === b.statementId;

/**
 * Re-check every linked step of a plan the teacher is saving. A link the
 * stored plan already holds is kept as stored (it was checked when it was
 * linked); a new or changed one is checked now, and its title and
 * `linkedAt` come from the server, not from the client.
 */
export async function verifyPlanLinks(
	plan: readonly AgoraStagePlanItem[],
	uid: string,
	stored: readonly AgoraStagePlanItem[],
	now: number,
): Promise<AgoraStagePlanItem[]> {
	const storedById = new Map(stored.map((item) => [item.itemId, item]));

	return Promise.all(
		plan.map(async (item) => {
			if (item.stage !== AgoraStage.linked || !item.link) return item;
			const before = storedById.get(item.itemId)?.link;
			if (before && sameLink(before, item.link)) return { ...item, link: before };
			const checked = await checkStationStatement(item.link.app, item.link.statementId, uid);

			return {
				...item,
				link: {
					app: checked.app,
					statementId: checked.statementId,
					title: checked.title,
					linkedAt: now,
				},
			};
		}),
	);
}
