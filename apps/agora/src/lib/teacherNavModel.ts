import type { IconName } from '../components/Icon';
import { t } from './i18n';
import { classLabel } from './teacher';
import { getTeacherNavState, liveSessions, navClass } from './teacherNav';
import { studioOverviewUrl } from './studioLink';
import { getLibraryStore } from './scenarioLibrary/state';
import { classKey, currentNavKey, liveKey, NAV_KEY, type NavRouteLookup } from './teacherSidebar';

/**
 * The teacher menu as data: which rows exist, in what order, for whom.
 *
 * The ≡ panel (phone, tablet) and the desktop side bar are two skins on one
 * list, so the role gates and the order are written once, here. Neither
 * component decides who sees the library or the supervision row.
 */
/** A row a screen hands the menu for itself alone (listed under "this lesson") */
export interface TeacherNavMenuItem {
	icon: IconName;
	label: string;
	onSelect: () => void;
	/**
	 * The top bar already carries this control at desktop width (the console's
	 * projector button and cog). The side bar leaves it out rather than list
	 * it twice; the phone's ≡ panel, where the bar has no room, still shows it.
	 */
	onBar?: boolean;
}

export interface NavItem {
	/** What {@link currentNavKey} returns for the route this row stands for */
	key: string;
	icon: IconName;
	label: string;
	route: string;
	/** A page outside Agora: opened in its own tab, never "you are here" */
	external?: boolean;
	/** The second line: a live tag and the stage, or a student count */
	meta?: { live?: string; text: string };
	/** A count waiting behind this row; zero shows nothing */
	badge?: { count: number; label: string };
}

export interface NavModel {
	/** The first fill is still in flight */
	loading: boolean;
	failed: boolean;
	live: NavItem[];
	places: NavItem[];
	classes: NavItem[];
	more: NavItem[];
	/** The row that stands for the route on screen, if any */
	currentKey: string | null;
}

function lookup(): NavRouteLookup {
	const { classes, sessions } = getTeacherNavState();
	const live = liveSessions();

	return {
		hasClass: (classId) => classes.some((agoraClass) => agoraClass.classId === classId),
		isLiveSession: (sessionId) => live.some((session) => session.sessionId === sessionId),
		sessionClassId: (sessionId) =>
			sessions.find((session) => session.sessionId === sessionId)?.classId,
	};
}

/** @param route the route on screen, query included (`m.route.get()`) */
export function buildNavModel(route: string): NavModel {
	const { classes, loading, loaded, failed, canSupervise } = getTeacherNavState();
	const library = getLibraryStore();
	const studioUrl = studioOverviewUrl();

	const live: NavItem[] = liveSessions().map((session) => {
		const agoraClass = navClass(session.classId);
		const label = session.classId
			? agoraClass
				? classLabel(agoraClass)
				: t('dashboard.class_gone')
			: t('startGame.guest_game');

		return {
			key: liveKey(session.sessionId),
			icon: 'square',
			label,
			meta: { live: t('dashboard.game_live'), text: t(`stage.${session.stage}`) },
			route: `/teach/session/${session.sessionId}`,
		};
	});

	const places: NavItem[] = [
		{ key: NAV_KEY.home, icon: 'home', label: t('teacher.title'), route: '/teach' },
		{
			key: NAV_KEY.scenarios,
			icon: 'proposal',
			label: t('scenlib.seg_mine'),
			route: '/teach/scenarios',
		},
	];
	if (library.access === 'approved') {
		places.push({
			key: NAV_KEY.library,
			icon: 'search',
			label: t('scenlib.nav'),
			route: '/teach/library',
		});
	}
	places.push({
		key: NAV_KEY.start,
		icon: 'new',
		label: t('dashboard.start_game'),
		route: '/teach/start',
	});

	const classItems: NavItem[] = classes.map((agoraClass) => ({
		key: classKey(agoraClass.classId),
		icon: 'people',
		label: classLabel(agoraClass),
		meta: { text: t('dashboard.members', { count: String(agoraClass.memberCount) }) },
		route: `/teach/class/${agoraClass.classId}`,
	}));

	// Icons: each row in this group gets a shape of its own, so the folded
	// strip, where the icon is the only cue, never shows two twins side by side.
	const more: NavItem[] = [
		{
			key: NAV_KEY.lessons,
			icon: 'watch',
			label: t('dashboard.my_games'),
			route: '/teach/lessons',
		},
		{
			key: NAV_KEY.activity,
			icon: 'trend',
			label: t('supervise.myActivity'),
			route: '/teach/activity',
		},
		{ key: NAV_KEY.words, icon: 'talk', label: t('nav.banned_words'), route: '/teach/words' },
	];
	if (studioUrl) {
		more.push({
			key: 'studio',
			icon: 'podium',
			label: t('nav.my_overview'),
			route: studioUrl,
			external: true,
		});
	}
	if (canSupervise) {
		more.push({
			key: NAV_KEY.supervise,
			icon: 'flag',
			label: t('supervise.title'),
			route: '/supervise',
		});
	}
	if (library.isAdmin) {
		more.push({
			key: NAV_KEY.libraryAdmin,
			icon: 'cog',
			label: t('scenlib.adm_link'),
			badge: {
				count: library.openReports,
				label: t('scenlib.adm_badge', { n: String(library.openReports) }),
			},
			route: '/teach/library/admin',
		});
	}
	more.push({
		key: NAV_KEY.help,
		icon: 'idea',
		label: t('nav.how_to_run'),
		route: '/teach?help=1',
	});

	return {
		loading: loading && !loaded,
		failed,
		live,
		places,
		classes: classItems,
		more,
		currentKey: currentNavKey(route, lookup()),
	};
}
