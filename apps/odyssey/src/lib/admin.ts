import {
	Collections,
	OdysseyGame,
	StatementType,
	createStatementObject,
	User as FreediUser,
} from '@freedi/shared-types';
import {
	db,
	deleteDoc,
	doc,
	getDoc,
	getDownloadURL,
	setDoc,
	storage,
	storageRef,
	updateDoc,
	uploadBytes,
} from './firebase';

/** Admin mutations. Game config lives on the odysseyGames doc; island and
 *  stance TEXTS live on their Statement docs (they are Freedi statements). */

export async function saveGamePatch(gameId: string, patch: Partial<OdysseyGame>): Promise<void> {
	await updateDoc(doc(db, Collections.odysseyGames, gameId), {
		...patch,
		lastUpdate: Date.now(),
	});
}

/** The two per-island fields the Agora tab owns. */
export interface IslandAnchorPatch {
	leftAnchorStanceId: string | null;
	rightAnchorStanceId: string | null;
}

/**
 * Persist ONLY the camp anchors, merged into a freshly-read islands array.
 *
 * The Agora tab snapshots the islands at mount; writing that whole snapshot
 * back later would silently undo any island edit (text, order, enabled) made
 * elsewhere in the meantime. So the anchors ride on the islands as they are
 * NOW, not as they were when the tab opened.
 */
export async function saveIslandAnchors(
	gameId: string,
	anchors: Record<string, IslandAnchorPatch>,
): Promise<void> {
	const ref = doc(db, Collections.odysseyGames, gameId);
	const snap = await getDoc(ref);
	if (!snap.exists()) throw new Error(`Odyssey game ${gameId} not found`);
	const islands = ((snap.data() as OdysseyGame).islands ?? []).map((island) =>
		anchors[island.statementId] ? { ...island, ...anchors[island.statementId] } : island,
	);
	await updateDoc(ref, { islands, lastUpdate: Date.now() });
}

/** Update the text of an island question or a stance option Statement. */
export async function saveStatementText(statementId: string, text: string): Promise<void> {
	await updateDoc(doc(db, Collections.statements, statementId), {
		statement: text,
		lastUpdate: Date.now(),
	});
}

export async function addStance(params: {
	rootStatementId: string;
	islandStatementId: string;
	text: string;
	order: number;
	creator: FreediUser;
}): Promise<void> {
	const stance = createStatementObject({
		statement: params.text,
		statementType: StatementType.option,
		parentId: params.islandStatementId,
		topParentId: params.rootStatementId,
		parents: [params.rootStatementId, params.islandStatementId],
		creatorId: params.creator.uid,
		creator: params.creator,
	});
	if (!stance) throw new Error('Stance failed validation');
	await setDoc(doc(db, Collections.statements, stance.statementId), {
		...stance,
		order: params.order,
	});
}

export async function deleteStance(statementId: string): Promise<void> {
	await deleteDoc(doc(db, Collections.statements, statementId));
}

/** Creates the island `question` Statement; caller appends the meta entry to
 *  the game doc. Returns the new statementId. */
export async function addIslandStatement(params: {
	rootStatementId: string;
	centralQuestion: string;
	order: number;
	creator: FreediUser;
}): Promise<string> {
	const island = createStatementObject({
		statement: params.centralQuestion,
		statementType: StatementType.question,
		parentId: params.rootStatementId,
		topParentId: params.rootStatementId,
		creatorId: params.creator.uid,
		creator: params.creator,
	});
	if (!island) throw new Error('Island failed validation');
	await setDoc(doc(db, Collections.statements, island.statementId), {
		...island,
		order: params.order,
	});

	return island.statementId;
}

/** Upload an image to Firebase Storage and return its public URL. */
export async function uploadImage(gameId: string, file: File): Promise<string> {
	const path = `odyssey/${gameId}/${Date.now()}-${file.name}`;
	const ref = storageRef(storage, path);
	await uploadBytes(ref, file, { contentType: file.type });

	return getDownloadURL(ref);
}
