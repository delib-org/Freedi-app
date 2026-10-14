import m from 'mithril';
import type {
	AgoraLibraryTag,
	AgoraScenarioCardText,
	AgoraTopicPackage,
} from '@freedi/shared-types';
import { getLang } from '../i18n';
import { getUserState } from '../user';
import {
	checkLibraryAccess,
	fetchHiddenScenarios,
	fetchLibraryScenarios,
	fetchLibraryTags,
	translateScenarios,
	type LibrarySort,
} from './api';
import { untranslatedIds } from './view';

/**
 * The library's session state: who may enter, the tags, the loaded cards and
 * their translations. One module-level store (the app's pattern for shared
 * screens), keyed by the signed-in uid so a second account never reads the
 * first one's library.
 */

export type LibraryAccess = 'unknown' | 'checking' | 'approved' | 'denied' | 'error';

export interface LibraryStore {
	access: LibraryAccess;
	isAdmin: boolean;
	tags: Map<string, AgoraLibraryTag>;
	scenarios: AgoraTopicPackage[];
	hidden: AgoraTopicPackage[];
	sort: LibrarySort;
	loading: boolean;
	loadedOnce: boolean;
	failed: boolean;
	/** Card text in `translationLang`, by scenario id */
	translations: Map<string, AgoraScenarioCardText>;
	translationLang: string;
	translating: boolean;
}

/** An answer for "is this teacher approved" is trusted this long before the next page re-asks */
const ACCESS_TTL_MS = 10 * 60 * 1000;
const TRANSLATE_BATCH = 30;

const store: LibraryStore = {
	access: 'unknown',
	isAdmin: false,
	tags: new Map(),
	scenarios: [],
	hidden: [],
	sort: 'rating',
	loading: false,
	loadedOnce: false,
	failed: false,
	translations: new Map(),
	translationLang: '',
	translating: false,
};

let ownerUid: string | null = null;
let accessAt = 0;
let accessPending: Promise<void> | null = null;

export function getLibraryStore(): Readonly<LibraryStore> {
	forgetOtherAccount();

	return store;
}

function forgetOtherAccount(): void {
	const uid = getUserState().user?.uid ?? null;
	if (ownerUid !== null && ownerUid !== uid) resetLibrary();
}

/** Forget everything — on sign-out, or when a different account is signed in */
export function resetLibrary(): void {
	store.access = 'unknown';
	store.isAdmin = false;
	store.tags = new Map();
	store.scenarios = [];
	store.hidden = [];
	store.loading = false;
	store.loadedOnce = false;
	store.failed = false;
	store.translations = new Map();
	store.translationLang = '';
	store.translating = false;
	ownerUid = null;
	accessAt = 0;
	accessPending = null;
}

/**
 * Ask the server whether this account is an approved teacher (once per
 * TTL). The answer also refreshes the marker the rules read, so it is asked
 * on opening the library, not trusted from an old visit.
 */
export function ensureLibraryAccess(force = false): Promise<void> {
	forgetOtherAccount();
	const uid = getUserState().user?.uid ?? null;
	if (!uid || getUserState().user?.isAnonymous) {
		store.access = 'denied';

		return Promise.resolve();
	}
	if (!force && store.access === 'approved' && Date.now() - accessAt < ACCESS_TTL_MS) {
		return Promise.resolve();
	}
	if (!force && store.access === 'denied' && Date.now() - accessAt < ACCESS_TTL_MS) {
		return Promise.resolve();
	}
	if (accessPending) return accessPending;
	store.access = 'checking';
	ownerUid = uid;
	accessPending = checkLibraryAccess({})
		.then((answer) => {
			store.access = answer.approved ? 'approved' : 'denied';
			store.isAdmin = answer.isAdmin;
			accessAt = Date.now();
		})
		.catch((error: unknown) => {
			console.error('[Library] Checking access failed:', error);
			store.access = 'error';
		})
		.finally(() => {
			accessPending = null;
			m.redraw();
		});

	return accessPending;
}

export async function reloadTags(): Promise<void> {
	store.tags = new Map((await fetchLibraryTags()).map((tag) => [tag.tagId, tag]));
}

/** Read the tags and one page of scenarios under `sort`, then translate what needs it */
export async function loadLibrary(sort: LibrarySort): Promise<void> {
	if (store.access !== 'approved') return;
	store.sort = sort;
	store.loading = true;
	store.failed = false;
	m.redraw();
	try {
		const [, scenarios, hidden] = await Promise.all([
			reloadTags(),
			fetchLibraryScenarios(sort),
			store.isAdmin ? fetchHiddenScenarios() : Promise.resolve([]),
		]);
		store.scenarios = scenarios;
		store.hidden = hidden;
		store.loadedOnce = true;
	} catch (error) {
		console.error('[Library] Loading the library failed:', error);
		store.failed = true;
	} finally {
		store.loading = false;
		m.redraw();
	}
	void translateLoaded();
}

/**
 * Ask for the viewer-language card text of every loaded scenario written in
 * another language. The server answers from its per-scenario cache; a
 * scenario that fails to translate simply stays in its own language.
 */
export async function translateLoaded(extra: readonly AgoraTopicPackage[] = []): Promise<void> {
	const lang = getLang();
	if (store.translationLang !== lang) {
		store.translations = new Map();
		store.translationLang = lang;
	}
	const wanted = untranslatedIds(
		[...store.scenarios, ...store.hidden, ...extra],
		lang,
		store.translations,
	);
	if (wanted.length === 0 || store.translating) return;
	store.translating = true;
	m.redraw();
	try {
		for (let start = 0; start < wanted.length; start += TRANSLATE_BATCH) {
			const answer = await translateScenarios({
				scenarioIds: wanted.slice(start, start + TRANSLATE_BATCH),
				lang,
			});
			if (store.translationLang !== lang) return;
			for (const [id, text] of Object.entries(answer.translations)) {
				store.translations.set(id, text);
			}
			m.redraw();
		}
	} catch (error) {
		console.error('[Library] Translating the cards failed:', error);
	} finally {
		store.translating = false;
		m.redraw();
		// The language changed while this one was running: start over in the new one
		if (getLang() !== lang) void translateLoaded(extra);
	}
}

/** Merge a scenario the page has just changed into the loaded list */
export function noteScenario(pkg: AgoraTopicPackage): void {
	store.scenarios = store.scenarios.map((entry) =>
		entry.topicPackageId === pkg.topicPackageId ? pkg : entry,
	);
}
