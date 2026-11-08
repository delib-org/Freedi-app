import {
	AgoraStudentAggregate,
	AgoraTopicPackage,
	AgoraTopicStatus,
	type AgoraClassAggregate,
	type AgoraClassGameRow,
	type AgoraSession,
	type TeacherConsoleMember,
} from '@freedi/shared-types';
import { defaultTopicPackageId } from './defaultTopic';

/**
 * Pure rules of the teacher area: what the home shows of the scenario shelf,
 * how "my scenarios" is searched and sorted, how a class's students and
 * lessons are ordered and grouped. No Mithril, no Firestore, no clock — the
 * screens hand in what they hold and print what comes back.
 */

/** How many scenarios the home shows before "all my scenarios" */
export const HOME_SCENARIO_LIMIT = 5;

/** The roster gets a search box once it would not fit one screen */
export const STUDENT_SEARCH_FROM = 12;

export type ScenarioFilter = 'all' | 'ready' | 'draft' | 'public';
export type ScenarioSort = 'recent' | 'title';

export interface ScenarioQuery {
	query: string;
	filter: ScenarioFilter;
	sort: ScenarioSort;
}

export const NO_SCENARIO_QUERY: ScenarioQuery = { query: '', filter: 'all', sort: 'recent' };

/** Scenarios a teacher can pick: the own-question lesson's hidden one is not among them */
export function reusableScenarios(topics: readonly AgoraTopicPackage[]): AgoraTopicPackage[] {
	return topics.filter((topic) => topic.kind !== 'quick');
}

/** Finished first, then the most recently edited — the order of the home shelf */
export function shelfOrder(topics: readonly AgoraTopicPackage[]): AgoraTopicPackage[] {
	const rank = (topic: AgoraTopicPackage): number =>
		topic.status === AgoraTopicStatus.ready ? 0 : 1;

	return [...topics].sort((a, b) => rank(a) - rank(b) || b.lastUpdate - a.lastUpdate);
}

/** The few the home prints; the rest is one tap away on /teach/scenarios */
export function homeScenarios(topics: readonly AgoraTopicPackage[]): AgoraTopicPackage[] {
	return shelfOrder(reusableScenarios(topics)).slice(0, HOME_SCENARIO_LIMIT);
}

/** The scenario every new teacher is given — marked "sample" until they make one */
export function isSampleScenario(topic: AgoraTopicPackage): boolean {
	return topic.topicPackageId === defaultTopicPackageId(topic.creatorId);
}

function matchesFilter(topic: AgoraTopicPackage, filter: ScenarioFilter): boolean {
	if (filter === 'ready') return topic.status === AgoraTopicStatus.ready;
	if (filter === 'draft') return topic.status !== AgoraTopicStatus.ready;
	if (filter === 'public') return topic.visibility === 'public';

	return true;
}

/** How many scenarios each chip would show, for the chips' own labels */
export function scenarioCounts(
	topics: readonly AgoraTopicPackage[],
): Record<ScenarioFilter, number> {
	const list = reusableScenarios(topics);

	return {
		all: list.length,
		ready: list.filter((topic) => matchesFilter(topic, 'ready')).length,
		draft: list.filter((topic) => matchesFilter(topic, 'draft')).length,
		public: list.filter((topic) => matchesFilter(topic, 'public')).length,
	};
}

/** The list on /teach/scenarios: search by title, one status chip, one sort */
export function filterScenarios(
	topics: readonly AgoraTopicPackage[],
	options: ScenarioQuery,
): AgoraTopicPackage[] {
	const needle = options.query.trim().toLocaleLowerCase();
	const list = reusableScenarios(topics).filter(
		(topic) =>
			matchesFilter(topic, options.filter) &&
			(needle === '' || topic.title.toLocaleLowerCase().includes(needle)),
	);

	return options.sort === 'title'
		? list.sort((a, b) => a.title.localeCompare(b.title))
		: list.sort((a, b) => b.lastUpdate - a.lastUpdate);
}

/** The one headline number on a class card — null until a lesson was scored */
export function classAverage(aggregate: AgoraClassAggregate | null | undefined): number | null {
	if (!aggregate) return null;

	return aggregate.avgClassScore === null ? null : Math.round(aggregate.avgClassScore);
}

/** The class's best scored lesson, for the "best lesson" card */
export function bestClassLesson(
	aggregate: AgoraClassAggregate | null | undefined,
): AgoraClassGameRow | null {
	let best: AgoraClassGameRow | null = null;
	for (const row of aggregate?.perGame ?? []) {
		if (row.classScoreTotal === undefined) continue;
		if (best === null || (best.classScoreTotal ?? 0) < row.classScoreTotal) best = row;
	}

	return best;
}

/** Scored lessons, oldest first — the bars of "class score by lesson" */
export function scoredLessonBars(
	aggregate: AgoraClassAggregate | null | undefined,
): AgoraClassGameRow[] {
	return (aggregate?.perGame ?? []).filter((row) => row.classScoreTotal !== undefined);
}

export type StudentSort = 'name' | 'points';

export interface StudentEntry {
	member: TeacherConsoleMember;
	career: AgoraStudentAggregate | undefined;
}

/** Roster rows, searched by alias and ordered by alias or by points */
export function arrangeStudents(
	members: readonly TeacherConsoleMember[],
	careers: ReadonlyMap<string, AgoraStudentAggregate>,
	options: { query: string; sort: StudentSort },
): StudentEntry[] {
	const needle = options.query.trim().toLocaleLowerCase();
	const entries = members
		.filter((member) => needle === '' || member.alias.toLocaleLowerCase().includes(needle))
		.map((member) => ({ member, career: careers.get(member.memberId) }));
	const points = (entry: StudentEntry): number => entry.career?.totals.total ?? 0;

	return options.sort === 'points'
		? entries.sort((a, b) => points(b) - points(a) || a.member.alias.localeCompare(b.member.alias))
		: entries.sort((a, b) => a.member.alias.localeCompare(b.member.alias));
}

/** The letter in the student's round avatar */
export function memberInitial(alias: string): string {
	const first = Array.from(alias.trim())[0];

	return first ? first.toLocaleUpperCase() : '?';
}

/** The meter under a student: their points against the best in the class, 0 to 100 */
export function pointsShare(points: number, best: number): number {
	if (best <= 0 || points <= 0) return 0;

	return Math.min(100, Math.round((points / best) * 100));
}

export interface MonthGroup<T> {
	/** Sorts newest first; "2026-03" */
	key: string;
	label: string;
	items: T[];
}

function monthKey(timestamp: number): string {
	const date = new Date(timestamp);

	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Newest-first rows folded into their calendar months, the order kept */
export function groupByMonth<T>(
	items: readonly T[],
	at: (item: T) => number,
	monthLabel: (timestamp: number) => string,
): MonthGroup<T>[] {
	const groups = new Map<string, MonthGroup<T>>();
	for (const item of items) {
		const key = monthKey(at(item));
		const group = groups.get(key) ?? { key, label: monthLabel(at(item)), items: [] };
		group.items.push(item);
		groups.set(key, group);
	}

	return [...groups.values()];
}

/** A past-lessons row's searchable text: its scenario, its class and its code */
export function lessonSearchText(
	session: Pick<AgoraSession, 'code'>,
	scenarioTitle: string,
	className: string,
): string {
	return `${scenarioTitle} ${className} ${session.code}`.toLocaleLowerCase();
}

/** True when every word of the search is somewhere in the row's text */
export function matchesLessonSearch(text: string, query: string): boolean {
	const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

	return words.every((word) => text.includes(word));
}
