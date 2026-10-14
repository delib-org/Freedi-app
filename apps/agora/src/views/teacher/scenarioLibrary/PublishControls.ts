import m from 'mithril';
import {
	AgoraLibraryTag,
	AgoraLibraryTagKind,
	AgoraTopicPackage,
	AgoraTopicStatus,
} from '@freedi/shared-types';
import { Icon } from '../../../components/Icon';
import { getLang, t } from '../../../lib/i18n';
import {
	createLibraryTag,
	fetchLibraryScenario,
	unpublishScenario,
} from '../../../lib/scenarioLibrary/api';
import { getLibraryStore, loadLibrary, reloadTags } from '../../../lib/scenarioLibrary/state';
import { PublishSheet } from './PublishSheet';

export interface PublishControlsAttrs {
	pkg: AgoraTopicPackage;
	tags: readonly AgoraLibraryTag[];
	/** The scenario as the server now has it, after a publish or an unpublish */
	onChanged: (fresh: AgoraTopicPackage) => void;
}

type Notice = 'published' | 'unpublished' | 'failed' | null;

/**
 * One scenario's private / public switch, for a teacher approved for the
 * library. Going public opens the publish sheet (the card needs a summary and
 * tags); going private asks once, because copies already taken are safe but
 * the listing disappears.
 *
 * It sits under a scenario's row on /teach/scenarios and is not rendered at
 * all for a teacher who is not approved: publishing is the library's, and the
 * server enforces it either way.
 */
export function PublishControls(): m.Component<PublishControlsAttrs> {
	let open = false;
	let publishing = false;
	let confirming = false;
	let busy = false;
	let notice: Notice = null;

	async function refresh(pkg: AgoraTopicPackage, onChanged: PublishControlsAttrs['onChanged']) {
		try {
			const fresh = await fetchLibraryScenario(pkg.topicPackageId);
			if (fresh) onChanged(fresh);
		} catch (error) {
			console.error('[Library] Refreshing a scenario failed:', error);
		}
		void loadLibrary(getLibraryStore().sort);
	}

	async function goPrivate(pkg: AgoraTopicPackage, onChanged: PublishControlsAttrs['onChanged']) {
		busy = true;
		try {
			await unpublishScenario({ scenarioId: pkg.topicPackageId });
			notice = 'unpublished';
			confirming = false;
			await refresh(pkg, onChanged);
		} catch (error) {
			console.error('[Library] Unpublishing failed:', error);
			notice = 'failed';
		} finally {
			busy = false;
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

	return {
		view({ attrs }) {
			const { pkg, tags, onChanged } = attrs;
			const isPublic = pkg.visibility === 'public';
			const ready = pkg.status === AgoraTopicStatus.ready;
			const adminHidden = isPublic && pkg.library?.hidden === true;

			// A draft cannot be published: nothing to show, so no footer line either
			if (!ready && !notice && !adminHidden) return null;

			return m('.scn-mine__controls-wrap', [
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
				adminHidden
					? m('p.scn-mine__warn', { role: 'status' }, t('scenlib.hidden_by_admin'))
					: null,
				// Closed, it is one quiet line; the switch only appears when asked for.
				// A draft cannot be published, so it offers nothing at all.
				ready
					? m(
							'button.btn.btn--secondary.btn--sm.publish-pill',
							{
								type: 'button',
								'aria-expanded': String(open),
								onclick: () => {
									open = !open;
									notice = null;
								},
							},
							[
								m(Icon, { name: 'megaphone', size: 18 }),
								t(isPublic ? 'scenlib.edit_listing' : 'teach.publish_to_library'),
							],
						)
					: null,
				open || confirming
					? m('.scn-mine__controls', [
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
											disabled: busy,
											onclick: () => {
												notice = null;
												if (on) return;
												if (value === 'public') publishing = true;
												else confirming = true;
											},
										},
										t(value === 'public' ? 'scenlib.public' : 'scenlib.private'),
									);
								}),
							),
							isPublic
								? m(
										'button.btn.btn--ghost.btn--sm',
										{ type: 'button', onclick: () => (publishing = true) },
										t('scenlib.edit_listing'),
									)
								: !ready
									? m('span.scn-mine__hint', t('scenlib.draft_cannot'))
									: null,
						])
					: null,
				confirming
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
											disabled: busy,
											onclick: () => void goPrivate(pkg, onChanged),
										},
										t('scenlib.make_private_yes'),
									),
									m(
										'button.btn.btn--ghost.btn--sm',
										{ type: 'button', onclick: () => (confirming = false) },
										t('common.cancel'),
									),
								]),
							],
						)
					: null,
				publishing
					? m(PublishSheet, {
							pkg,
							tags,
							lang: getLang(),
							onClose: () => (publishing = false),
							onCreateTag: createTag,
							onPublished: () => {
								publishing = false;
								notice = 'published';
								void refresh(pkg, onChanged);
							},
						})
					: null,
			]);
		},
	};
}
