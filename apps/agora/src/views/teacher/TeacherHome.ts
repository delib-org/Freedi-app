import m from 'mithril';
import { t } from '../../lib/i18n';
import { getUserState, signInWithGoogle, ensureUser } from '../../lib/user';
import {
	fetchTeacherDashboard,
	listTopicPackages,
	patchTopicPackage,
	saveTopicPackage,
	type TeacherDashboard,
} from '../../lib/teacher';
import { teacherClass } from '../../lib/callables';
import { ClassForm, type ClassFormValue } from '../../components/ClassForm';
import { AgoraClassAggregate, AgoraSession, AgoraTopicPackage } from '@freedi/shared-types';
import { buildDefaultFrenchRevolutionTopic, backfillDefaultArtwork } from '../../lib/defaultTopic';
import { LanguagePicker } from '../../components/LanguagePicker';
import { TeacherNav } from '../../components/TeacherNav';
import { isSessionLive, noteTeacherDashboard } from '../../lib/teacherNav';
import { countedSteps, teacherStepLabel } from '../../lib/teacherSteps';
import { fetchSourceVersions } from '../../lib/scenarioLibrary/api';
import { lessonClassName, lessonTitle } from '../../lib/lessonLabels';
import { isSampleScenario, reusableScenarios } from '../../lib/teacherHome';
import { classesSection, firstRunStrip, liveBanner, scenariosSection } from './home/HomeSections';

/** Once dismissed, the three-step strip stays away on this device */
const FIRST_RUN_KEY = 'agora.teacher.firstRunDismissed';

function firstRunDismissed(): boolean {
	try {
		return window.localStorage.getItem(FIRST_RUN_KEY) === '1';
	} catch {
		return false;
	}
}

/**
 * The teacher's room (/teach): four things and nothing else. A lesson running
 * now (one tap back into it), my scenarios (a tap on one starts a lesson), my
 * classes (a tap on one opens its achievements), and — on a teacher's first
 * visit — the three lines that are the whole of running a lesson. Past lessons,
 * supervision and the teacher's own activity live in the ≡ menu.
 */
export function TeacherHome(): m.Component {
	let topics: AgoraTopicPackage[] = [];
	let classes: TeacherDashboard['classes'] = [];
	let schools: TeacherDashboard['schools'] = [];
	let addClassOpen = false;
	let creatingClass = false;
	let addClassError: string | null = null;
	let sessions: AgoraSession[] = [];
	let aggregates = new Map<string, AgoraClassAggregate>();
	/**
	 * The shelf and the classes are two independent reads, so they are two
	 * independent waits (and two independent failures). They used to share one
	 * flag and one page-wide spinner: the whole dashboard stayed blank until the
	 * slower of the two landed.
	 */
	let topicsLoaded = false;
	let topicsFailed = false;
	let dashboardLoaded = false;
	let dashboardFailed = false;
	/** The library originals behind copies on the shelf — for "a new version is available" */
	let sourceVersions = new Map<string, { lastUpdate: number; title: string }>();
	/**
	 * Whose library is on screen. Auth settles in two beats — an anonymous
	 * account first, the teacher's Google one a moment later — and the dashboard
	 * used to read the library on the first beat and never again: the header
	 * said "teacher" while the shelf below it said "no scenarios yet". The uid
	 * the data belongs to is the thing to watch.
	 */
	let loadedForUid: string | null = null;
	let refilling = false;
	/**
	 * The load running now, keyed by the account it reads for. A
	 * credential-recovery sign-in changes the uid, and then both the sign-in
	 * button's `.then(load)` and {@link refillIfAccountChanged} ask for the new
	 * account at once: two shelf reads could both come back empty and both
	 * provision the default scenario. Callers for the same account share one
	 * load instead.
	 */
	let inFlight: { key: string; promise: Promise<void> } | null = null;
	/** Accounts this page already provisioned for — never twice, whatever races */
	const provisionedFor = new Set<string>();
	let firstRunHidden = firstRunDismissed();

	function dismissFirstRun(): void {
		firstRunHidden = true;
		try {
			window.localStorage.setItem(FIRST_RUN_KEY, '1');
		} catch {
			// A private window forgets; the strip comes back next time, harmlessly
		}
		// Opened from the menu's "how to run a lesson": drop the request as well
		if (m.route.param('help') === '1') m.route.set('/teach', undefined, { replace: true });
	}

	/** Refill the shelf when auth settles on a different account than it was
	 *  filled for. Guarded so a burst of redraws cannot stack reads. */
	function refillIfAccountChanged(uid: string | undefined): void {
		if (!uid || refilling || loadedForUid === null || loadedForUid === uid) return;
		refilling = true;
		void load().finally(() => {
			refilling = false;
		});
	}

	async function provisionDefaultTopic(creatorId: string): Promise<AgoraTopicPackage | null> {
		try {
			const defaultTopic = buildDefaultFrenchRevolutionTopic(creatorId);
			await saveTopicPackage(defaultTopic);

			return defaultTopic;
		} catch (error) {
			console.error('[Teacher] Provisioning default topic failed:', error);

			return null;
		}
	}

	/**
	 * Heal packages provisioned before the bundled artwork existed.
	 *
	 * Truly fire-and-forget: it is a backfill write, and awaiting it held the
	 * shelf behind one Firestore round trip per package. The patched copy is
	 * folded back in and redrawn when it lands.
	 */
	function healArtwork(pkg: AgoraTopicPackage): void {
		const patch = backfillDefaultArtwork(pkg);
		if (!patch) return;
		patchTopicPackage(pkg.topicPackageId, patch)
			.then(() => {
				topics = topics.map((current) =>
					current.topicPackageId === pkg.topicPackageId
						? { ...current, ...patch, lastUpdate: Date.now() }
						: current,
				);
				m.redraw();
			})
			.catch((error: unknown) => {
				console.error('[Teacher] Backfilling default artwork failed:', error);
			});
	}

	/** The scenario shelf. Independent of the console — it reads Firestore direct. */
	async function loadTopics(user: { uid: string; isAnonymous: boolean }): Promise<void> {
		topicsFailed = false;
		try {
			const loadedTopics = await listTopicPackages(user.uid);
			if (loadedForUid !== user.uid) return;
			topics = loadedTopics;
			topicsLoaded = true;
			m.redraw();
			loadedTopics.forEach(healArtwork);
			const copies = loadedTopics.filter((topic) => topic.sourceScenarioId);
			if (copies.length > 0) {
				void fetchSourceVersions(copies).then((found) => {
					if (loadedForUid !== user.uid) return;
					sourceVersions = found;
					m.redraw();
				});
			}
			if (loadedTopics.length === 0 && !user.isAnonymous && !provisionedFor.has(user.uid)) {
				provisionedFor.add(user.uid);
				const defaultTopic = await provisionDefaultTopic(user.uid);
				if (defaultTopic && loadedForUid === user.uid) {
					topics = [defaultTopic];
					m.redraw();
				}
			}
		} catch (error) {
			console.error('[Teacher] Loading the scenario shelf failed:', error);
			topicsFailed = true;
			topicsLoaded = true;
			m.redraw();
		}
	}

	/**
	 * One round trip for classes, aggregates and recent lessons — fails soft: a
	 * console hiccup must not blank the scenarios. Not asked at all before the
	 * Google sign-in: the console refuses an anonymous caller, and the refusal
	 * read as an error on a page that was simply still waiting for the teacher
	 * to sign in.
	 */
	async function loadDashboard(user: { uid: string; isAnonymous: boolean }): Promise<void> {
		// Auth's first beat is an anonymous account and the console refuses it.
		// That beat is not an answer, so it must not be recorded as one: marked
		// loaded here, the classes area spent the wait for the Google account
		// saying "no classes yet — ask your admin", which is a different
		// sentence from "still looking".
		if (user.isAnonymous) return;
		dashboardFailed = false;
		try {
			const dashboard = await fetchTeacherDashboard(user.uid);
			if (loadedForUid !== user.uid) return;
			classes = dashboard.classes;
			schools = dashboard.schools;
			sessions = dashboard.sessions;
			aggregates = dashboard.aggregates;
			noteTeacherDashboard(dashboard, user.uid);
		} catch (error) {
			console.error('[Teacher] Loading dashboard data failed:', error);
			dashboardFailed = true;
		}
		dashboardLoaded = true;
		m.redraw();
	}

	/** Forget everything the last account put on screen */
	function clearAccountData(): void {
		topics = [];
		classes = [];
		schools = [];
		sessions = [];
		aggregates = new Map();
		addClassOpen = false;
		addClassError = null;
	}

	/** Single-flight: concurrent callers for the same account share one load */
	async function load(): Promise<void> {
		let user: Awaited<ReturnType<typeof ensureUser>>;
		try {
			user = await ensureUser();
		} catch (error) {
			console.error('[Teacher] Loading dashboard failed:', error);
			topicsLoaded = true;
			dashboardLoaded = true;
			m.redraw();

			return;
		}
		const key = `${user.uid}:${user.isAnonymous ? 'anon' : 'signed'}`;
		if (inFlight?.key === key) return inFlight.promise;
		const promise = loadFor(user).finally(() => {
			if (inFlight?.promise === promise) inFlight = null;
		});
		inFlight = { key, promise };

		return promise;
	}

	async function loadFor(user: { uid: string; isAnonymous: boolean }): Promise<void> {
		try {
			if (loadedForUid !== user.uid) {
				// A different account's answers are not this one's. Both sections
				// go back to waiting rather than show the last teacher's shelf —
				// and the data itself goes too, so a failed read for the new
				// account paints empty, never the previous teacher's cards.
				clearAccountData();
				topicsLoaded = false;
				dashboardLoaded = false;
			}
			loadedForUid = user.uid;

			// The shelf and the console answer different questions of different
			// servers. Asked together, the page waits for the slower one — not
			// for both, one after the other.
			await Promise.all([loadTopics(user), loadDashboard(user)]);
		} catch (error) {
			console.error('[Teacher] Loading dashboard failed:', error);
			topicsLoaded = true;
			dashboardLoaded = true;
		}
		m.redraw();
	}

	/** Retry one section: forget its failure, show its skeleton, ask again */
	function retry(section: 'topics' | 'dashboard'): void {
		if (section === 'topics') topicsLoaded = false;
		else dashboardLoaded = false;
		void load();
	}

	/** The live banner's second line: class · scenario · step i of n · step name */
	function liveMeta(session: AgoraSession): string {
		const steps = countedSteps(session.stagePlan ?? []);
		const stepIndex = Math.min(session.stageIndex ?? 0, Math.max(0, steps.length - 1));
		const current = steps[stepIndex];

		return [
			lessonClassName(session, classes),
			lessonTitle(session),
			current
				? `${t('teacher.step_of', { i: stepIndex + 1, n: steps.length })} · ${teacherStepLabel(current)}`
				: null,
		]
			.filter(Boolean)
			.join(' · ');
	}

	/** Open a class in the teacher's school; the cards pick it up on the reload */
	async function createClass(value: ClassFormValue): Promise<void> {
		if (creatingClass) return;
		creatingClass = true;
		addClassError = null;
		m.redraw();
		try {
			await teacherClass({
				action: 'create',
				name: value.name,
				...(value.gradeLevel ? { gradeLevel: value.gradeLevel } : {}),
				...(value.schoolId ? { schoolId: value.schoolId } : {}),
			});
			const uid = loadedForUid;
			const dashboard = await fetchTeacherDashboard(uid ?? undefined);
			// The account can change under the round trip; its answer is not the new one's
			if (loadedForUid === uid) {
				classes = dashboard.classes;
				schools = dashboard.schools;
				aggregates = dashboard.aggregates;
				noteTeacherDashboard(dashboard, uid);
			}
			addClassOpen = false;
		} catch (error) {
			console.error('[Teacher] Creating a class failed:', error);
			addClassError = t('classForm.error');
		}
		creatingClass = false;
		m.redraw();
	}

	function newClassForm(): m.Children {
		if (!addClassOpen) return null;

		return m('.card.stack', [
			m(ClassForm, {
				schools,
				submitLabel: t('classForm.create'),
				busyLabel: t('classForm.creating'),
				busy: creatingClass,
				error: addClassError,
				onSubmit: (value) => void createClass(value),
				onCancel: () => {
					addClassOpen = false;
				},
			}),
		]);
	}

	function signInView(signInError: string | null): m.Children {
		return m('.shell', [
			m(
				'.shell__content.text-center',
				{ style: { justifyContent: 'center', gap: 'var(--space-lg)' } },
				[
					m('h2', t('teacher.title')),
					m('p.home-explanation', t('teacher.sign_in_required')),
					signInError
						? m(
								'p.join__error',
								t(
									signInError === 'popup-blocked'
										? 'teacher.sign_in_popup_blocked'
										: 'teacher.sign_in_failed',
								),
							)
						: null,
					m(
						'button.btn.btn--primary',
						{
							onclick: () => {
								signInWithGoogle()
									.then(() => {
										topicsLoaded = false;
										dashboardLoaded = false;
										void load();
									})
									.catch((error: unknown) => {
										console.error('[Teacher] Sign-in failed:', error);
									});
							},
						},
						t('home.sign_in'),
					),
					m('button.btn.btn--ghost', { onclick: () => m.route.set('/') }, t('common.back')),
				],
			),
		]);
	}

	void load();

	return {
		view() {
			const { tier, loading, signInError, user } = getUserState();
			refillIfAccountChanged(user?.uid);

			if (loading) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}
			if (tier !== 2) return signInView(signInError ?? null);

			const live = sessions.filter(isSessionLive);
			const reusable = reusableScenarios(topics);
			// First visit, or asked for again from the ≡ menu ("how to run a lesson")
			const showFirstRun =
				m.route.param('help') === '1' ||
				(!firstRunHidden && sessions.every((session) => session.classScore === undefined));

			return m('.shell', [
				m(TeacherNav, {
					title: t('teacher.title'),
					onBack: () => m.route.set('/'),
					trailing: m(LanguagePicker),
				}),

				m('.shell__content.teach-page', [
					// A lesson running now leads: the teacher who reloaded mid-period
					// wants back in, not a shelf
					live.map((session) => liveBanner(session.sessionId, liveMeta(session))),

					dashboardLoaded && showFirstRun ? firstRunStrip(dismissFirstRun) : null,

					scenariosSection({
						loaded: topicsLoaded,
						failed: topicsFailed,
						topics,
						reusableCount: reusable.length,
						sourceVersions,
						onlyStarter:
							reusable.length === 0 || (reusable.length === 1 && isSampleScenario(reusable[0])),
						onRetry: () => retry('topics'),
					}),

					classesSection({
						loaded: dashboardLoaded,
						failed: dashboardFailed,
						classes,
						hasSchool: schools.length > 0,
						aggregates,
						onAddClass: () => {
							addClassOpen = !addClassOpen;
						},
						onRetry: () => retry('dashboard'),
						form: newClassForm(),
					}),
				]),
			]);
		},
	};
}
