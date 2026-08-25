import m from 'mithril';
import type { OdysseyDigestSettings } from '@freedi/shared-types';
import { Icon } from './Icon';
import { t, tCount } from '../lib/i18n';
import { triggerLook } from '../lib/notificationCopy';
import {
	clearInbox,
	getInboxItems,
	inboxUnreadCount,
	markAllInboxRead,
	markInboxRead,
	type InboxItem,
} from '../lib/inbox';
import { requestFocus } from '../lib/helpedFocus';
import { formatMessageTime } from '../views/ThreadChat';
import {
	DIGEST_TIMEZONE_DEFAULT,
	ODYSSEY_DIGEST_MAX_HOURS,
	loadDigestSettings,
	saveDigestSettings,
} from '../lib/digestPrefs';

export interface InboxAttrs {
	/**
	 * The Odyssey uid whose voyage-story email cadence this post box may edit.
	 * Set only for civic players — they arrived through an island gate under
	 * their own uid, so the setting they change here is the same one the
	 * Odyssey app shows. Classroom students have no voyage to be told about.
	 */
	digestUid?: string;
}

type DigestCadence = 'none' | 'every' | 'daily' | 'multi';

const DIGEST_DEFAULT_HOUR = 19;
const DIGEST_HOURS = Array.from({ length: 24 }, (_unused, hour) => hour);

/**
 * The post box, as a button that lives in the HUD and the sheet it opens.
 *
 * The game's news used to exist only as toasts: six seconds, then gone
 * forever, with nothing anywhere that could answer "what did I miss?". The
 * badge here counts news not yet LOOKED AT — reading the list clears it — so
 * it never becomes a chore-counter competing with the tabs, which count work
 * still owed.
 *
 * For a civic player the sheet also carries the voyage-story email settings,
 * behind a cog in its header: the mail icon is where anyone looks for
 * anything about mail, so the cadence control lives behind it rather than on
 * a separate screen nobody would find. The cog swaps the sheet's body for
 * the settings — the whole sheet, so the hour chips are in view the moment a
 * cadence that needs them is pressed.
 */
export function Inbox(): m.Component<InboxAttrs> {
	let open = false;

	// Voyage-story cadence editor, loaded the first time the cog is pressed
	let settingsOpen = false;
	let digestLoaded = false;
	let digestLoading = false;
	let digestSaving = false;
	let digestSaved = false;
	let digestCadence: DigestCadence = 'none';
	let digestHours: number[] = [DIGEST_DEFAULT_HOUR];

	function openSettings(uid: string): void {
		settingsOpen = true;
		if (digestLoaded || digestLoading) return;
		digestLoading = true;
		void loadDigestSettings(uid)
			.then((existing) => {
				if (existing?.enabled) {
					if (existing.everyUpdate) digestCadence = 'every';
					else if (existing.hoursLocal.length > 0) {
						digestCadence = existing.hoursLocal.length === 1 ? 'daily' : 'multi';
						digestHours = existing.hoursLocal;
					}
				}
				digestLoaded = true;
			})
			.finally(() => {
				digestLoading = false;
				m.redraw();
			});
	}

	function toggleDigestHour(hour: number): void {
		digestSaved = false;
		if (digestCadence === 'daily') {
			digestHours = [hour];

			return;
		}
		digestHours = digestHours.includes(hour)
			? digestHours.filter((entry) => entry !== hour)
			: digestHours.length >= ODYSSEY_DIGEST_MAX_HOURS
				? digestHours
				: [...digestHours, hour].sort((a, b) => a - b);
	}

	function saveDigest(uid: string): void {
		digestSaving = true;
		const timed = digestCadence === 'daily' || digestCadence === 'multi';
		const settings: OdysseyDigestSettings = {
			enabled: digestCadence === 'every' || (timed && digestHours.length > 0),
			hoursLocal: timed ? digestHours : [],
			timezone: DIGEST_TIMEZONE_DEFAULT,
			everyUpdate: digestCadence === 'every',
		};
		void saveDigestSettings(uid, settings)
			.then(() => {
				digestSaved = true;
			})
			.finally(() => {
				digestSaving = false;
				m.redraw();
			});
	}

	function settingsBody(uid: string): m.Children {
		const timed = digestCadence === 'daily' || digestCadence === 'multi';

		return m('.inbox__digest-body', [
			m('p.inbox__digest-blurb', t('digest.blurb')),
			digestLoading
				? m('p.inbox__digest-blurb', t('digest.loading'))
				: [
						m(
							'.inbox__digest-cadence',
							{ role: 'radiogroup', 'aria-label': t('digest.entry') },
							(
								[
									['none', t('digest.none')],
									['every', t('digest.every')],
									['daily', t('digest.daily')],
									['multi', t('digest.multi')],
								] as [DigestCadence, string][]
							).map(([value, label]) =>
								m(
									'button.inbox__digest-chip',
									{
										key: value,
										type: 'button',
										role: 'radio',
										'aria-checked': String(digestCadence === value),
										class: digestCadence === value ? 'inbox__digest-chip--on' : undefined,
										onclick: () => {
											digestSaved = false;
											digestCadence = value;
											// Daily means ONE hour, chosen or defaulted — never
											// an empty picker the save button then sulks about
											if (value === 'daily') {
												digestHours = digestHours.slice(0, 1);
												if (digestHours.length === 0) digestHours = [DIGEST_DEFAULT_HOUR];
											}
										},
									},
									label,
								),
							),
						),
						digestCadence === 'every' ? m('p.inbox__digest-blurb', t('digest.every_blurb')) : null,
						timed
							? [
									m(
										'p.inbox__digest-blurb',
										digestCadence === 'daily'
											? t('digest.hour_q')
											: t('digest.hours_q', { n: ODYSSEY_DIGEST_MAX_HOURS }),
									),
									m(
										'.inbox__digest-hours',
										DIGEST_HOURS.map((hour) =>
											m(
												'button.inbox__digest-chip.inbox__digest-chip--hour',
												{
													key: hour,
													type: 'button',
													'aria-pressed': String(digestHours.includes(hour)),
													class: digestHours.includes(hour) ? 'inbox__digest-chip--on' : undefined,
													onclick: () => toggleDigestHour(hour),
												},
												`${String(hour).padStart(2, '0')}:00`,
											),
										),
									),
								]
							: null,
						m('.inbox__digest-actions', [
							m(
								'button.inbox__digest-save',
								{
									type: 'button',
									disabled: digestSaving || (timed && digestHours.length === 0),
									onclick: () => saveDigest(uid),
								},
								digestSaving ? t('digest.saving') : t('digest.save'),
							),
							digestSaved ? m('span.inbox__digest-saved', t('digest.saved')) : null,
						]),
					],
		]);
	}

	function close(): void {
		if (!open) return;
		open = false;
		// The cadence editor closes with the sheet; what it loaded stays loaded
		settingsOpen = false;
		digestSaved = false;
		// Marked on the way OUT: while the sheet is open the unread marks are
		// exactly what tells a student which lines are the new ones
		markAllInboxRead();
	}

	function onKey(event: KeyboardEvent): void {
		if (event.key === 'Escape') close();
	}

	function row(item: InboxItem): m.Children {
		const look = triggerLook(item.trigger, '');

		return m(
			item.target ? 'button.inbox__row' : '.inbox__row.inbox__row--flat',
			{
				key: item.id,
				class: item.read ? undefined : 'inbox__row--unread',
				type: item.target ? 'button' : undefined,
				onclick: item.target
					? () => {
							markInboxRead(item.id);
							const target = item.target;
							close();
							// After the sheet is gone, so the screen it lands on is the
							// one the student actually sees move
							if (target) requestFocus(target);
						}
					: undefined,
			},
			[
				m('span.inbox__icon', { 'aria-hidden': 'true' }, m(Icon, { name: look.icon, size: 20 })),
				m('span.inbox__body', [
					m('span.inbox__line', look.line),
					item.detail ? m('span.inbox__detail', item.detail) : null,
				]),
				m('span.inbox__meta', [
					item.read ? null : m('span.inbox__dot', { 'aria-label': t('inbox.unread_mark') }),
					m('span.inbox__time', formatMessageTime(item.at)),
				]),
			],
		);
	}

	return {
		oncreate() {
			document.addEventListener('keydown', onKey);
		},

		onremove() {
			document.removeEventListener('keydown', onKey);
		},

		view(vnode) {
			const unread = inboxUnreadCount();
			const items = getInboxItems();
			const digestUid = vnode.attrs.digestUid;

			return [
				m(
					'button.inbox-button',
					{
						type: 'button',
						'aria-expanded': String(open),
						'aria-label': unread > 0 ? tCount('inbox.unread', unread) : t('inbox.open'),
						onclick: () => {
							if (open) close();
							else open = true;
						},
					},
					[
						m(
							'span.inbox-button__icon',
							{ 'aria-hidden': 'true' },
							m(Icon, { name: 'mail', size: 22 }),
						),
						unread > 0
							? m('span.inbox-button__badge', { 'aria-hidden': 'true' }, String(unread))
							: null,
					],
				),
				open
					? [
							m('.inbox__scrim', { onclick: close, 'aria-hidden': 'true' }),
							m('.inbox', { role: 'dialog', 'aria-label': t('inbox.title') }, [
								m('.inbox__head', [
									m('span.inbox__title', settingsOpen ? t('digest.entry') : t('inbox.title')),
									// Emptying it is the student's own business — a record of
									// what happened TO them that they cannot put down turns
									// into a list of chores
									!settingsOpen && items.length > 0
										? m(
												'button.inbox__clear',
												{
													type: 'button',
													onclick: () => {
														clearInbox();
													},
												},
												t('inbox.clear'),
											)
										: null,
									// The cog swaps the sheet between news and mail settings —
									// civic players only, whose uid is their Odyssey uid
									digestUid
										? m(
												'button.inbox__cog',
												{
													type: 'button',
													'aria-label': t('digest.entry'),
													'aria-pressed': String(settingsOpen),
													class: settingsOpen ? 'inbox__cog--on' : undefined,
													onclick: () => {
														if (settingsOpen) settingsOpen = false;
														else openSettings(digestUid);
													},
												},
												m(Icon, { name: 'cog', size: 18 }),
											)
										: null,
									m(
										'button.inbox__close',
										{ type: 'button', 'aria-label': t('inbox.close'), onclick: close },
										'×',
									),
								]),
								settingsOpen && digestUid
									? settingsBody(digestUid)
									: items.length === 0
										? m('p.inbox__empty', t('inbox.empty'))
										: m('.inbox__list', items.map(row)),
							]),
						]
					: null,
			];
		},
	};
}
