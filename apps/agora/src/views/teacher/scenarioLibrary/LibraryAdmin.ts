import m from 'mithril';
import {
	AgoraLibraryReport,
	AgoraScenarioPost,
	AgoraScenarioRating,
	AgoraTopicPackage,
} from '@freedi/shared-types';
import { getLang, t } from '../../../lib/i18n';
import {
	fetchHiddenPosts,
	fetchHiddenReviews,
	fetchHiddenScenarios,
	fetchOpenReports,
	fetchReportTarget,
	moderateLibrary,
	resolveReports,
	type ReportTarget,
} from '../../../lib/scenarioLibrary/api';
import { groupReports, type ReportGroup } from '../../../lib/scenarioLibrary/adminView';
import {
	getLibraryStore,
	reloadTags,
	setOpenReportCount,
} from '../../../lib/scenarioLibrary/state';
import { AdminHidden } from './AdminHidden';
import { AdminReports, groupKey } from './AdminReports';
import { AdminTags } from './AdminTags';
import { LibraryShell } from './LibraryShell';

/**
 * The library's moderation page, for system admins only (the rules and the
 * callables enforce it; this screen merely does not offer itself to anyone
 * else): the reports queue, everything hidden, and merging duplicate tags.
 */
export function LibraryAdmin(): m.Component {
	let loaded = false;
	let failed = false;
	let reports: AgoraLibraryReport[] = [];
	let hiddenScenarios: AgoraTopicPackage[] = [];
	let hiddenReviews: AgoraScenarioRating[] = [];
	let hiddenPosts: AgoraScenarioPost[] = [];
	const targets = new Map<string, ReportTarget | null>();
	let busy: string | null = null;
	let actionFailed = false;

	async function loadTargets(groups: readonly ReportGroup[]): Promise<void> {
		await Promise.all(
			groups
				.filter((group) => !targets.has(groupKey(group)))
				.map(async (group) => {
					try {
						targets.set(groupKey(group), await fetchReportTarget(group.targetKind, group.targetId));
					} catch (error) {
						console.error('[Library] Reading a reported item failed:', error);
						targets.set(groupKey(group), null);
					}
					m.redraw();
				}),
		);
	}

	async function load(): Promise<void> {
		try {
			[reports, hiddenScenarios, hiddenReviews, hiddenPosts] = await Promise.all([
				fetchOpenReports(),
				fetchHiddenScenarios(),
				fetchHiddenReviews(),
				fetchHiddenPosts(),
				reloadTags(),
			]).then(([a, b, c, d]) => [a, b, c, d]);
			failed = false;
			// The menu's badge counts what this queue lists
			setOpenReportCount(groupReports(reports).length);
		} catch (error) {
			console.error('[Library] Loading the admin page failed:', error);
			failed = true;
		}
		loaded = true;
		m.redraw();
		void loadTargets(groupReports(reports));
	}

	async function resolve(group: ReportGroup, resolution: 'hidden' | 'dismissed'): Promise<void> {
		busy = groupKey(group);
		actionFailed = false;
		m.redraw();
		try {
			await resolveReports({
				targetKind: group.targetKind,
				targetId: group.targetId,
				resolution,
			});
			targets.delete(groupKey(group));
			await load();
		} catch (error) {
			console.error('[Library] Resolving reports failed:', error);
			actionFailed = true;
		}
		busy = null;
		m.redraw();
	}

	async function unhide(kind: 'scenario' | 'review' | 'post', id: string): Promise<void> {
		busy = `${kind}:${id}`;
		actionFailed = false;
		m.redraw();
		try {
			await moderateLibrary({ action: 'unhide', targetKind: kind, targetId: id });
			await load();
		} catch (error) {
			console.error('[Library] Showing an item again failed:', error);
			actionFailed = true;
		}
		busy = null;
		m.redraw();
	}

	function body(): m.Children {
		const store = getLibraryStore();
		if (!store.isAdmin) {
			return m('.card.stack.scn-gate', [
				m('p', { role: 'alert' }, t('scenlib.adm_only')),
				m(m.route.Link, { href: '/teach/library', class: 'btn btn--secondary' }, t('scenlib.back')),
			]);
		}
		if (!loaded) return m('.spinner', { role: 'status' });
		if (failed) {
			return m('.card.stack.scn-gate', [
				m('p', { role: 'alert' }, t('scenlib.error')),
				m(
					'button.btn.btn--primary',
					{ type: 'button', onclick: () => void load() },
					t('scenlib.retry'),
				),
			]);
		}
		const groups = groupReports(reports);
		const hiddenCount = hiddenScenarios.length + hiddenReviews.length + hiddenPosts.length;

		return m('.scn-adm', [
			actionFailed ? m('p.scn-field__error', { role: 'alert' }, t('scenlib.admin_failed')) : null,
			m('section.scn-adm__section', { 'aria-labelledby': 'scn-adm-reports' }, [
				m(
					'h2.scn-section-title',
					{ id: 'scn-adm-reports' },
					`${t('scenlib.adm_reports')} (${groups.length})`,
				),
				m(AdminReports, {
					groups,
					targets,
					busy,
					failed: actionFailed,
					onResolve: (group, how) => void resolve(group, how),
				}),
			]),
			m('section.scn-adm__section', { 'aria-labelledby': 'scn-adm-hidden' }, [
				m(
					'h2.scn-section-title',
					{ id: 'scn-adm-hidden' },
					`${t('scenlib.adm_hidden')} (${hiddenCount})`,
				),
				m(AdminHidden, {
					scenarios: hiddenScenarios,
					reviews: hiddenReviews,
					posts: hiddenPosts,
					busy,
					onUnhide: (kind, id) => void unhide(kind, id),
				}),
			]),
			m('section.scn-adm__section', { 'aria-labelledby': 'scn-adm-tags' }, [
				m('h2.scn-section-title', { id: 'scn-adm-tags' }, t('scenlib.adm_tags')),
				m(AdminTags, {
					tags: [...store.tags.values()],
					lang: getLang(),
					onMerged: () => void load(),
				}),
			]),
		]);
	}

	return {
		view() {
			return m(
				LibraryShell,
				{
					title: t('scenlib.adm_title'),
					onBack: () => m.route.set('/teach/library'),
					onApproved: () => {
						if (getLibraryStore().isAdmin && !loaded) void load();
					},
				},
				body(),
			);
		},
	};
}
