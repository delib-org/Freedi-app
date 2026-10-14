import m from 'mithril';
import {
	AgoraLibraryTag,
	AgoraLibraryTagKind,
	AgoraTopicPackage,
	AgoraTopicStatus,
	isNewerVersionAvailable,
} from '@freedi/shared-types';
import { Icon } from '../../../components/Icon';
import { getLang, t } from '../../../lib/i18n';
import {
	createLibraryTag,
	fetchLibraryScenario,
	fetchSourceVersions,
	unpublishScenario,
} from '../../../lib/scenarioLibrary/api';
import { loadLibrary, reloadTags } from '../../../lib/scenarioLibrary/state';
import { listTopicPackages } from '../../../lib/teacher';
import { getUserState } from '../../../lib/user';
import { PublishSheet } from './PublishSheet';

export interface MineListAttrs {
	tags: readonly AgoraLibraryTag[];
	sort: 'rating' | 'new' | 'used';
}

type Notice = 'published' | 'unpublished' | 'failed' | null;

/**
 * "My scenarios": everything I have written or copied, each with a
 * private / public switch. Going public opens the publish sheet (the card
 * needs a summary and tags); going private asks once, because copies already
 * taken are safe but the listing disappears.
 */
export function MineList(): m.Component<MineListAttrs> {
	let items: AgoraTopicPackage[] = [];
	let sources = new Map<string, { lastUpdate: number; title: string }>();
	let loaded = false;
	let failed = false;
	let publishing: AgoraTopicPackage | null = null;
	let confirmingId: string | null = null;
	let busyId: string | null = null;
	let notice: Notice = null;
	let loadedFor: string | null = null;

	async function load(): Promise<void> {
		const uid = getUserState().user?.uid;
		if (!uid) return;
		loadedFor = uid;
		failed = false;
		try {
			const own = (await listTopicPackages(uid))
				.filter((pkg) => pkg.kind !== 'quick')
				.sort((a, b) => b.lastUpdate - a.lastUpdate);
			items = own;
			loaded = true;
			sources = await fetchSourceVersions(own.filter((pkg) => pkg.sourceScenarioId));
		} catch (error) {
			console.error('[Library] Loading my scenarios failed:', error);
			failed = true;
			loaded = true;
		}
		m.redraw();
	}

	async function refresh(id: string, sort: MineListAttrs['sort']): Promise<void> {
		try {
			const fresh = await fetchLibraryScenario(id);
			if (fresh) items = items.map((pkg) => (pkg.topicPackageId === id ? fresh : pkg));
		} catch (error) {
			console.error('[Library] Refreshing a scenario failed:', error);
		}
		void loadLibrary(sort);
	}

	async function goPrivate(pkg: AgoraTopicPackage, sort: MineListAttrs['sort']): Promise<void> {
		busyId = pkg.topicPackageId;
		try {
			await unpublishScenario({ scenarioId: pkg.topicPackageId });
			notice = 'unpublished';
			confirmingId = null;
			await refresh(pkg.topicPackageId, sort);
		} catch (error) {
			console.error('[Library] Unpublishing failed:', error);
			notice = 'failed';
		} finally {
			busyId = null;
			m.redraw();
		}
	}

	async function createTag(kind: AgoraLibraryTagKind, label: string): Promise<string | null> {
		try {
			const answer = await createLibraryTag({ kind, label, lang: getLang() });
			await reloadTags();

			return answer.tagId;
		} catch (error) {
			console.error('[Library] Creating a tag failed:', error);

			return null;
		}
	}

	function row(pkg: AgoraTopicPackage, sort: MineListAttrs['sort']): m.Children {
		const id = pkg.topicPackageId;
		const isPublic = pkg.visibility === 'public';
		const ready = pkg.status === AgoraTopicStatus.ready;
		const source = pkg.sourceScenarioId ? sources.get(pkg.sourceScenarioId) : undefined;
		const newer = source ? isNewerVersionAvailable(pkg, source) : false;
		const adminHidden = isPublic && pkg.library?.hidden === true;

		return m('li.scn-mine', { key: id }, [
			m('.scn-mine__main', [
				m(
					'span.scn-mine__thumb',
					pkg.library?.coverUrl
						? m('img', { src: pkg.library.coverUrl, alt: '' })
						: m(Icon, { name: ready ? 'tunnel' : 'edit', size: 24 }),
				),
				m('span.scn-mine__text', [
					m(
						m.route.Link,
						{
							href: isPublic ? `/teach/library/${id}` : `/teach/topic/${id}`,
							class: 'scn-mine__title',
						},
						pkg.title,
					),
					m('span.scn-mine__meta', [
						m(
							'span.scn-pill',
							{ class: ready ? undefined : 'scn-pill--draft' },
							t(ready ? 'editor.ready' : 'editor.draft'),
						),
						pkg.sourceScenarioId
							? m(
									'span.scn-mine__credit',
									t('scenlib.source_of', {
										title: pkg.sourceTitle ?? source?.title ?? '',
										author: pkg.sourceAuthorName || t('scenlib.author_anon'),
									}),
								)
							: null,
					]),
				]),
			]),

			newer && pkg.sourceScenarioId
				? m('.scn-mine__update', { role: 'status' }, [
						m('strong', t('scenlib.new_version')),
						m('span', t('scenlib.new_version_text')),
						m(
							m.route.Link,
							{
								href: `/teach/library/${pkg.sourceScenarioId}`,
								class: 'btn btn--secondary btn--sm',
							},
							t('scenlib.see_original'),
						),
					])
				: null,

			adminHidden ? m('p.scn-mine__warn', { role: 'status' }, t('scenlib.hidden_by_admin')) : null,

			m('.scn-mine__controls', [
				m(
					'.scn-switch',
					{ role: 'radiogroup', 'aria-label': t('scenlib.visibility') },
					(['private', 'public'] as const).map((value) => {
						const on = (value === 'public') === isPublic;

						return m(
							'button.scn-switch__opt',
							{
								key: value,
								type: 'button',
								role: 'radio',
								'aria-checked': String(on),
								class: on ? 'scn-switch__opt--on' : undefined,
								disabled: busyId === id,
								onclick: () => {
									notice = null;
									if (on) return;
									if (value === 'public') publishing = pkg;
									else confirmingId = id;
								},
							},
							t(value === 'public' ? 'scenlib.public' : 'scenlib.private'),
						);
					}),
				),
				isPublic
					? m(
							'button.btn.btn--ghost.btn--sm',
							{ type: 'button', onclick: () => (publishing = pkg) },
							t('scenlib.edit_listing'),
						)
					: !ready
						? m('span.scn-mine__hint', t('scenlib.draft_cannot'))
						: null,
			]),

			confirmingId === id
				? m(
						'.scn-mine__confirm',
						{ role: 'alertdialog', 'aria-label': t('scenlib.make_private_title') },
						[
							m('p', t('scenlib.make_private_confirm')),
							m('.scn-mine__confirm-actions', [
								m(
									'button.btn.btn--primary.btn--sm',
									{
										type: 'button',
										disabled: busyId === id,
										onclick: () => void goPrivate(pkg, sort),
									},
									t('scenlib.make_private_yes'),
								),
								m(
									'button.btn.btn--ghost.btn--sm',
									{ type: 'button', onclick: () => (confirmingId = null) },
									t('common.cancel'),
								),
							]),
						],
					)
				: null,
		]);
	}

	return {
		oninit() {
			void load();
		},
		onupdate() {
			// Auth settles after the first paint: read again for the account that arrived
			const uid = getUserState().user?.uid ?? null;
			if (uid && uid !== loadedFor) void load();
		},
		view({ attrs }) {
			return m('.scn-mine-list', [
				m('h2.scn-section-title', t('scenlib.mine_title')),
				m('p.scn-note', t('scenlib.mine_hint')),
				notice
					? m(
							'p.scn-notice',
							{
								role: notice === 'failed' ? 'alert' : 'status',
								class: notice === 'failed' ? 'scn-notice--bad' : undefined,
							},
							t(`scenlib.notice_${notice}`),
						)
					: null,
				!loaded
					? m('.spinner', { role: 'status' })
					: failed
						? m('p', { role: 'alert' }, t('scenlib.error'))
						: items.length === 0
							? m('p.home-explanation', t('scenlib.mine_empty'))
							: m(
									'ul.scn-mine-grid',
									{ role: 'list' },
									items.map((pkg) => row(pkg, attrs.sort)),
								),
				publishing
					? m(PublishSheet, {
							pkg: publishing,
							tags: attrs.tags,
							lang: getLang(),
							onClose: () => (publishing = null),
							onCreateTag: createTag,
							onPublished: (id: string) => {
								publishing = null;
								notice = 'published';
								void refresh(id, attrs.sort);
							},
						})
					: null,
			]);
		},
	};
}
