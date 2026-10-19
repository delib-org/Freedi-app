/**
 * The teacher's side bar on a desktop screen: when it shows, whether it is
 * open or folded, and which row is "you are here".
 *
 * Pure and storage-light on purpose. The component only draws; every rule that
 * can be wrong (the width, the remembered state, the route-to-row mapping) is
 * here, where a test can reach it without a browser.
 */

/** Below this width the top bar and its ≡ panel stay exactly as they were */
export const DESKTOP_MIN_WIDTH = 1024;
export const DESKTOP_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;

/** The one thing remembered per device: open or folded */
export const SIDEBAR_STORAGE_KEY = 'agora_teacher_sidebar';

export type SidebarState = 'open' | 'folded';

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

/** localStorage can throw (private window, blocked site data); that is not an error to show anyone */
function defaultStorage(): Storage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

/** The stored choice; anything missing, odd or unreadable is "open" */
export function readSidebarState(storage: ReadableStorage | null = defaultStorage()): SidebarState {
	try {
		return storage?.getItem(SIDEBAR_STORAGE_KEY) === 'folded' ? 'folded' : 'open';
	} catch {
		return 'open';
	}
}

/** Remember the choice. A storage that refuses just means it is not remembered. */
export function writeSidebarState(
	state: SidebarState,
	storage: WritableStorage | null = defaultStorage(),
): void {
	try {
		storage?.setItem(SIDEBAR_STORAGE_KEY, state);
	} catch {
		// Not remembered on this device; the bar still folds for this visit
	}
}

// --- the live state, shared by every screen that renders the bar ---

let current: SidebarState | null = null;

/** Read once, synchronously, so the first paint is already the right width */
export function getSidebarState(): SidebarState {
	if (current === null) current = readSidebarState();

	return current;
}

export function setSidebarState(state: SidebarState): void {
	current = state;
	writeSidebarState(state);
}

/** Is the viewport wide enough for the side bar right now? */
export function isDesktop(): boolean {
	return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		? window.matchMedia(DESKTOP_QUERY).matches
		: false;
}

/** Tell `onChange` whenever the viewport crosses the breakpoint; returns the way to stop listening */
export function watchDesktop(onChange: (desktop: boolean) => void): () => void {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
		return () => undefined;
	const query = window.matchMedia(DESKTOP_QUERY);
	const listener = (event: MediaQueryListEvent): void => onChange(event.matches);
	query.addEventListener('change', listener);

	return () => query.removeEventListener('change', listener);
}

// --- which row is "you are here" ---

/** What the mapping needs to know about this teacher's classes and lessons */
export interface NavRouteLookup {
	hasClass: (classId: string) => boolean;
	isLiveSession: (sessionId: string) => boolean;
	/** The class a lesson belonged to, when the cache knows it */
	sessionClassId: (sessionId: string) => string | undefined;
}

export const NAV_KEY = {
	home: 'home',
	help: 'help',
	scenarios: 'scenarios',
	library: 'library',
	libraryAdmin: 'library-admin',
	start: 'start',
	lessons: 'lessons',
	activity: 'activity',
	words: 'words',
	supervise: 'supervise',
} as const;

export const classKey = (classId: string): string => `class:${classId}`;
export const liveKey = (sessionId: string): string => `live:${sessionId}`;

/**
 * The one row that stands for the route on screen, or null when no row does.
 * The query is ignored except for the help link, which shares /teach with the
 * teachers' room.
 */
export function currentNavKey(route: string, lookup: NavRouteLookup): string | null {
	const [path, query = ''] = route.split('?');
	const parts = path.split('/').filter(Boolean);
	const [area, section, id] = parts;

	if (area === 'supervise') return NAV_KEY.supervise;
	if (area !== 'teach') return null;

	if (!section) return new URLSearchParams(query).get('help') === '1' ? NAV_KEY.help : NAV_KEY.home;

	switch (section) {
		case 'scenarios':
			return NAV_KEY.scenarios;
		case 'library':
			if (id === 'admin') return NAV_KEY.libraryAdmin;

			return NAV_KEY.library;
		case 'start':
			return NAV_KEY.start;
		case 'lessons':
			return NAV_KEY.lessons;
		case 'activity':
			return NAV_KEY.activity;
		case 'words':
			return NAV_KEY.words;
		case 'class':
			return id && lookup.hasClass(id) ? classKey(id) : null;
		case 'session':
			return id && lookup.isLiveSession(id) ? liveKey(id) : null;
		case 'report': {
			const classId = id ? lookup.sessionClassId(id) : undefined;

			return classId && lookup.hasClass(classId) ? classKey(classId) : NAV_KEY.lessons;
		}
		default:
			// /teach/topic, /teach/new and the like redirect before they draw
			return null;
	}
}
