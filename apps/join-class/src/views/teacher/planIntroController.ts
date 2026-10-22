import m from 'mithril';
import { getMainStatement } from '@/lib/store';
import { isAdmin } from '@/lib/admin';
import { createDragReorder } from '@/lib/dragReorder';
import { fetchIntroBlocks } from '@/lib/classroom/introData';
import {
	checkIntroText,
	diffIntroBlocks,
	introToText,
	isEmptyDiff,
	type IntroTextCheck,
	type SavedBlock,
} from '@/lib/classroom/introText';
import {
	INTRO_VIDEOS_MAX,
	INTRO_VIDEO_TITLE_MAX,
	MAX_VIDEO_URL_LENGTH,
	introVideoEmbed,
	introVideosOf,
	type IntroVideo,
} from '@/lib/classroom/introVideos';
import {
	dropDraft,
	fieldValue,
	getDraft,
	getMainId,
	onInput,
	runSave,
	setDraft,
} from './planController';
import { applyIdOrder, moveId, orderConverged } from './planHelpers';
import { saveIntroDiff, saveIntroVideos } from './planIntroApi';

/** State and actions of the plan screen's "הקדמה" section: the text (one
 *  textarea, saved on blur as a block diff) and the videos (one card each,
 *  saved on blur, the whole list in one write). Drafts and the save path are
 *  planController's, so "Save" waits for these writes too. */

/** A pasted text is cut here so a runaway paste cannot freeze the page; the limit that matters is INTRO_TEXT_MAX. */
export const INTRO_TEXT_INPUT_CAP = 5000;
export const TEXT_KEY = 'intro:text';

type BlocksLoad = 'loading' | 'ready' | 'error';

let blocksLoad: BlocksLoad = 'loading';
let savedBlocks: SavedBlock[] = [];
let openedFor = '';
let draftRows: string[] = [];
let draftCounter = 0;
let localOrder: string[] | null = null;
let focusKey: string | null = null;
let announcement = '';
const deletedIds = new Set<string>();
const invalidKeys = new Set<string>();

export const introReorder = createDragReorder({
	onCommit: (orderedIds) => commitVideoOrder(orderedIds),
	enabled: () => isAdmin(),
});

// ---- reads --------------------------------------------------------------------

export const getBlocksLoad = (): BlocksLoad => blocksLoad;
export const getIntroAnnouncement = (): string => announcement;
export const isUrlInvalid = (id: string): boolean => invalidKeys.has(urlKey(id));

export const urlKey = (id: string): string => `intro:v:${id}:url`;
export const titleKey = (id: string): string => `intro:v:${id}:title`;
const videoSaveKey = (id: string): string => `intro:video:${id}`;

export function takeIntroFocus(key: string): boolean {
	if (focusKey !== key) return false;
	focusKey = null;

	return true;
}

/** What the textarea shows: the teacher's draft, else the saved blocks as text. */
export function introTextValue(): string {
	return fieldValue(TEXT_KEY, introToText(savedBlocks));
}

export function introTextCheck(): IntroTextCheck {
	return checkIntroText(introTextValue());
}

/** One row of the video list: saved (has a snapshot) or still a draft. */
export interface VideoRow {
	id: string;
	saved: IntroVideo | null;
}

/** Saved videos in the teacher's order, then the rows still being filled in. */
export function videoRows(): VideoRow[] {
	const saved = introVideosOf(getMainStatement()).filter((v) => !deletedIds.has(v.id));
	const rawIds = saved.map((v) => v.id);
	if (localOrder && orderConverged(rawIds, localOrder)) localOrder = null;
	const ordered = applyIdOrder(saved, localOrder, (v: IntroVideo) => v.id);
	const known = new Set(rawIds);
	draftRows = draftRows.filter((id) => !known.has(id));

	return [
		...ordered.map((v): VideoRow => ({ id: v.id, saved: v })),
		...draftRows.map((id): VideoRow => ({ id, saved: null })),
	];
}

export const canAddVideo = (): boolean => videoRows().length < INTRO_VIDEOS_MAX;

// ---- text -----------------------------------------------------------------------

/** Load the saved paragraphs once per screen (called by the section on create). */
export async function openIntro(mainId: string): Promise<void> {
	if (openedFor !== mainId) {
		openedFor = mainId;
		draftRows = [];
		localOrder = null;
		deletedIds.clear();
		invalidKeys.clear();
		announcement = '';
		introReorder.reset();
	}
	blocksLoad = 'loading';
	m.redraw();
	try {
		savedBlocks = await fetchIntroBlocks(mainId);
		blocksLoad = 'ready';
	} catch (err) {
		console.error('[PlanScreen] load introduction text failed:', err);
		blocksLoad = 'error';
	} finally {
		m.redraw();
	}
}

export function onIntroTextInput(value: string): void {
	onInput(TEXT_KEY, value, INTRO_TEXT_INPUT_CAP);
}

/** Blur of the textarea: save the changed blocks. Over the limit nothing is written. */
export function commitIntroText(): void {
	const draft = getDraft(TEXT_KEY);
	const main = getMainStatement();
	if (draft === undefined || !main || blocksLoad !== 'ready') return;
	const check = checkIntroText(draft);
	if (!check.ok) return;
	const diff = diffIntroBlocks(savedBlocks, check.blocks);
	if (isEmptyDiff(diff)) {
		dropDraft(TEXT_KEY);

		return;
	}
	runSave(TEXT_KEY, 'save introduction text', async () => {
		await saveIntroDiff(main, diff);
		savedBlocks = await fetchIntroBlocks(getMainId());
		// show the saved (normalised) text, unless the teacher kept typing meanwhile
		if (getDraft(TEXT_KEY) === draft) dropDraft(TEXT_KEY);
	});
}

// ---- videos ---------------------------------------------------------------------

function newVideoId(): string {
	draftCounter += 1;

	return `v${Date.now().toString(36)}${draftCounter}`;
}

/** The list as it should be saved now, optionally with one more (draft) row at the end. */
function listToSave(extraId?: string): IntroVideo[] {
	const videos: IntroVideo[] = [];
	for (const row of videoRows()) {
		const link = getDraft(urlKey(row.id))?.trim();
		const url = link !== undefined && introVideoEmbed(link) ? link : (row.saved?.url ?? '');
		if (url === '' || (!row.saved && row.id !== extraId)) continue;
		const title = (getDraft(titleKey(row.id)) ?? row.saved?.title ?? '')
			.trim()
			.slice(0, INTRO_VIDEO_TITLE_MAX);
		videos.push({ id: row.id, title, url });
	}

	return videos;
}

function persistVideos(id: string, extraId?: string): void {
	runSave(videoSaveKey(id), 'save introduction videos', () =>
		saveIntroVideos(getMainId(), listToSave(extraId)),
	);
}

export function addVideoRow(): void {
	if (!canAddVideo()) return;
	const empty = draftRows.find((id) => (getDraft(urlKey(id)) ?? '').trim() === '');
	if (empty) {
		focusKey = urlKey(empty);

		return;
	}
	const id = newVideoId();
	draftRows = [...draftRows, id];
	focusKey = urlKey(id);
}

export function onVideoInput(key: string, id: string, value: string, max: number): void {
	onInput(key, value, max);
	// an error shown on blur is re-checked while typing, so the fix lands at once
	if (key === urlKey(id) && invalidKeys.has(key) && introVideoEmbed(value) !== null) {
		invalidKeys.delete(key);
	}
}

export const VIDEO_URL_MAX = MAX_VIDEO_URL_LENGTH;
export const VIDEO_TITLE_MAX = INTRO_VIDEO_TITLE_MAX;

/** Blur of a link field: an empty draft row does nothing, a bad link is flagged and not saved, a good one is saved. */
export function commitVideoUrl(id: string): void {
	const key = urlKey(id);
	const draft = getDraft(key);
	if (draft === undefined) return;
	const url = draft.trim();
	const saved = videoRows().find((row) => row.id === id)?.saved ?? null;
	if (saved && url === saved.url) {
		dropDraft(key);
		invalidKeys.delete(key);

		return;
	}
	if (!saved && url === '') {
		invalidKeys.delete(key);

		return;
	}
	if (introVideoEmbed(url) === null) {
		invalidKeys.add(key);
		m.redraw();

		return;
	}
	invalidKeys.delete(key);
	setDraft(key, url);
	persistVideos(id, saved ? undefined : id);
}

/** Blur of a title field: a saved row saves; a draft row keeps the title until its link is valid. */
export function commitVideoTitle(id: string): void {
	const key = titleKey(id);
	const draft = getDraft(key);
	if (draft === undefined) return;
	const saved = videoRows().find((row) => row.id === id)?.saved ?? null;
	if (!saved) return;
	const title = draft.trim().slice(0, INTRO_VIDEO_TITLE_MAX);
	if (title === saved.title) {
		dropDraft(key);

		return;
	}
	setDraft(key, title);
	persistVideos(id);
}

export function removeVideo(id: string): void {
	const saved = videoRows().find((row) => row.id === id)?.saved ?? null;
	dropDraft(urlKey(id));
	dropDraft(titleKey(id));
	invalidKeys.delete(urlKey(id));
	if (!saved) {
		draftRows = draftRows.filter((x) => x !== id);

		return;
	}
	deletedIds.add(id);
	const remaining = listToSave();
	runSave(videoSaveKey(id), 'delete introduction video', async () => {
		try {
			await saveIntroVideos(getMainId(), remaining);
		} catch (err) {
			deletedIds.delete(id);
			throw err;
		}
	});
}

function savedIds(): string[] {
	return videoRows()
		.filter((row) => row.saved)
		.map((row) => row.id);
}

function commitVideoOrder(orderedIds: string[]): void {
	localOrder = orderedIds;
	const reordered = listToSave();
	runSave('intro:order', 'reorder introduction videos', async () => {
		try {
			await saveIntroVideos(getMainId(), reordered);
		} catch (err) {
			localOrder = null;
			throw err;
		}
	});
}

/** Keyboard reorder from a handle; announces the new 1-based position. */
export function moveVideo(
	id: string,
	delta: number,
	announce: (n: number, total: number) => string,
): void {
	const ids = savedIds();
	const next = moveId(ids, id, delta);
	if (next === ids) return;
	commitVideoOrder(next);
	announcement = announce(next.indexOf(id) + 1, next.length);
}

export function savedVideoIds(): string[] {
	return savedIds();
}

/** The section starts fresh with each screen visit. */
export function teardownIntro(): void {
	openedFor = '';
	blocksLoad = 'loading';
	savedBlocks = [];
	draftRows = [];
	localOrder = null;
	deletedIds.clear();
	invalidKeys.clear();
	announcement = '';
}
