import m from 'mithril';
import { AGORA_LIBRARY, AgoraScenarioRating, AgoraTopicPackage } from '@freedi/shared-types';
import { Stars, StarPicker } from '../../../components/scenarioLibrary/Stars';
import { getLang, t } from '../../../lib/i18n';
import {
	fetchMyRating,
	fetchScenarioRatings,
	moderateLibrary,
	rateScenario,
} from '../../../lib/scenarioLibrary/api';
import { getLibraryStore } from '../../../lib/scenarioLibrary/state';
import { getUserState } from '../../../lib/user';

export interface ScenarioFeedbackAttrs {
	scenario: AgoraTopicPackage;
	/** The signed-in teacher wrote it */
	mine: boolean;
	/** The ratings changed the scenario's numbers: the page reads it again */
	onChanged: () => void;
}

type Saving = 'idle' | 'saving' | 'saved' | 'blocked' | 'failed';

/**
 * Ratings and reviews of one scenario, under the lesson preview: the star
 * form (any approved teacher but the author), the written reviews, and — for
 * a system admin only — the hide controls. The discussion (phase 4) will sit
 * beside this; the page mounts it and hands it the scenario.
 */
export function ScenarioFeedback(): m.Component<ScenarioFeedbackAttrs> {
	let reviews: AgoraScenarioRating[] = [];
	let mine: AgoraScenarioRating | null = null;
	let stars = 0;
	let text = '';
	let saving: Saving = 'idle';
	let loadedFor = '';
	let reason = '';
	let adminFailed = false;

	async function load(scenarioId: string, isOwner: boolean): Promise<void> {
		loadedFor = scenarioId;
		const uid = getUserState().user?.uid;
		try {
			const [list, own] = await Promise.all([
				fetchScenarioRatings(scenarioId, getLibraryStore().isAdmin),
				uid && !isOwner ? fetchMyRating(scenarioId, uid) : Promise.resolve(null),
			]);
			reviews = list;
			mine = own;
			stars = own?.stars ?? 0;
			text = own?.text ?? '';
		} catch (error) {
			console.error('[Library] Loading the reviews failed:', error);
		}
		m.redraw();
	}

	async function save(attrs: ScenarioFeedbackAttrs): Promise<void> {
		if (stars < 1 || saving === 'saving') return;
		saving = 'saving';
		m.redraw();
		try {
			await rateScenario({
				scenarioId: attrs.scenario.topicPackageId,
				stars,
				...(text.trim() ? { text: text.trim() } : {}),
			});
			saving = 'saved';
			await load(attrs.scenario.topicPackageId, attrs.mine);
			attrs.onChanged();
		} catch (error) {
			console.error('[Library] Rating failed:', error);
			saving =
				(error as { code?: string }).code === 'functions/invalid-argument' ? 'blocked' : 'failed';
		}
		m.redraw();
	}

	async function moderate(
		attrs: ScenarioFeedbackAttrs,
		kind: 'scenario' | 'review',
		targetId: string,
		hide: boolean,
	): Promise<void> {
		adminFailed = false;
		try {
			await moderateLibrary({
				action: hide ? 'hide' : 'unhide',
				targetKind: kind,
				targetId,
				...(hide && reason.trim() ? { reason: reason.trim() } : {}),
			});
			reason = '';
			await load(attrs.scenario.topicPackageId, attrs.mine);
			attrs.onChanged();
		} catch (error) {
			console.error('[Library] Moderation failed:', error);
			adminFailed = true;
		}
		m.redraw();
	}

	function form(attrs: ScenarioFeedbackAttrs): m.Children {
		if (attrs.mine) return m('p.scn-note', t('scenlib.rate_own'));
		const left = AGORA_LIBRARY.REVIEW_MAX - text.length;

		return m('.scn-rate', [
			m('h3.scn-rate__title', t(mine ? 'scenlib.rate_title_edit' : 'scenlib.rate_title')),
			m('p.scn-note', t('scenlib.rate_hint')),
			m(StarPicker, {
				value: stars,
				label: t('scenlib.rate_group'),
				onChange: (next: number) => {
					stars = next;
					saving = 'idle';
				},
			}),
			m('.scn-field', [
				m('label.scn-field__label', { for: 'scn-review' }, t('scenlib.review_label')),
				m('textarea.text-input', {
					id: 'scn-review',
					rows: 3,
					value: text,
					maxlength: AGORA_LIBRARY.REVIEW_MAX,
					placeholder: t('scenlib.review_ph'),
					oninput: (event: InputEvent) => {
						text = (event.target as HTMLTextAreaElement).value;
						saving = 'idle';
					},
				}),
				m(
					'p.scn-field__hint.scn-field__hint--end',
					left <= 100
						? t('scenlib.review_count', { n: text.length, max: AGORA_LIBRARY.REVIEW_MAX })
						: '',
				),
			]),
			m(
				'button.btn.btn--primary',
				{
					type: 'button',
					'aria-disabled': stars < 1 || saving === 'saving' ? 'true' : undefined,
					onclick: () => void save(attrs),
				},
				saving === 'saving'
					? t('scenlib.rate_saving')
					: t(mine ? 'scenlib.rate_update' : 'scenlib.rate_save'),
			),
			stars < 1 ? m('p.scn-note', t('scenlib.rate_pick')) : null,
			saving === 'saved' ? m('p.scn-notice', { role: 'status' }, t('scenlib.rate_saved')) : null,
			saving === 'blocked'
				? m('p.scn-field__error', { role: 'alert' }, t('scenlib.rate_blocked'))
				: null,
			saving === 'failed'
				? m('p.scn-field__error', { role: 'alert' }, t('scenlib.rate_failed'))
				: null,
		]);
	}

	function review(
		attrs: ScenarioFeedbackAttrs,
		entry: AgoraScenarioRating,
		admin: boolean,
	): m.Children {
		const own = entry.teacherId === getUserState().user?.uid;

		return m(
			'li.scn-review',
			{ key: entry.ratingId, class: own ? 'scn-review--mine' : undefined },
			[
				m('.scn-review__head', [
					m(Stars, { value: entry.stars, size: 18 }),
					m('span.sr-only', t('scenlib.review_stars', { n: entry.stars })),
					m(
						'span.scn-review__who',
						own ? t('scenlib.review_yours') : entry.authorName || t('scenlib.author_anon'),
					),
					m('span.scn-review__date', new Date(entry.lastUpdate).toLocaleDateString(getLang())),
					entry.hidden ? m('span.scn-pill.scn-pill--draft', t('scenlib.review_hidden')) : null,
				]),
				entry.text ? m('p.scn-review__text', entry.text) : null,
				admin
					? m(
							'button.btn.btn--ghost.btn--sm.scn-review__admin',
							{
								type: 'button',
								onclick: () => void moderate(attrs, 'review', entry.ratingId, !entry.hidden),
							},
							t(entry.hidden ? 'scenlib.admin_unhide_review' : 'scenlib.admin_hide_review'),
						)
					: null,
			],
		);
	}

	function adminPanel(attrs: ScenarioFeedbackAttrs): m.Children {
		const hidden = attrs.scenario.library?.hidden === true;

		return m('section.scn-admin', { 'aria-label': t('scenlib.admin_title') }, [
			m('h3.scn-rate__title', t('scenlib.admin_title')),
			hidden ? m('p.scn-notice.scn-notice--bad', t('scenlib.admin_hidden_note')) : null,
			hidden
				? null
				: m('.scn-field', [
						m('label.scn-field__label', { for: 'scn-hide-reason' }, t('scenlib.admin_reason')),
						m('input.text-input#scn-hide-reason', {
							type: 'text',
							value: reason,
							maxlength: 200,
							oninput: (event: InputEvent) => {
								reason = (event.target as HTMLInputElement).value;
							},
						}),
					]),
			m(
				'button.btn.btn--secondary.btn--sm',
				{
					type: 'button',
					onclick: () => void moderate(attrs, 'scenario', attrs.scenario.topicPackageId, !hidden),
				},
				t(hidden ? 'scenlib.admin_unhide' : 'scenlib.admin_hide'),
			),
			adminFailed ? m('p.scn-field__error', { role: 'alert' }, t('scenlib.admin_failed')) : null,
		]);
	}

	return {
		view({ attrs }) {
			if (loadedFor !== attrs.scenario.topicPackageId) {
				void load(attrs.scenario.topicPackageId, attrs.mine);
			}
			const admin = getLibraryStore().isAdmin;

			return m('section.scn-feedback', { 'aria-label': t('scenlib.reviews') }, [
				form(attrs),
				reviews.length === 0
					? m('p.scn-note', t('scenlib.reviews_empty'))
					: m(
							'ul.scn-reviews',
							{ role: 'list' },
							reviews.map((entry) => review(attrs, entry, admin)),
						),
				admin ? adminPanel(attrs) : null,
			]);
		},
	};
}
