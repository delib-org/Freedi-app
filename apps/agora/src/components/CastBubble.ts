import m from 'mithril';
import { t } from '../lib/i18n';
import { castLinesFor, type CastMember } from '../lib/flows/scenarioCast';
import type { AgoraStage } from '@freedi/shared-types';

export interface CastBubbleAttrs {
	cast: readonly CastMember[];
	stage: AgoraStage;
	/** The needs scene's question, read above the answers (needs stage only) */
	question?: string;
	/** What the stage is called, as the bubble's small heading */
	heading: string;
	/** Refresh-safe: how far each character has been heard, per stage */
	storageKey: string;
	/** The teacher's class view reads along; it reports nothing */
	watcher?: boolean;
	/** (characters heard to the end, characters) — the class progress the teacher sees */
	onProgress?: (done: number, total: number) => void;
	/** The one thing to do here after listening, e.g. open the positioning scale */
	action?: { label: string; onClick: () => void };
}

/** How many lines of this character the student has heard — kept for the sitting */
function readSeen(key: string): number {
	try {
		return Number(sessionStorage.getItem(key) ?? '0') || 0;
	} catch {
		return 0;
	}
}

function writeSeen(key: string, value: number): void {
	try {
		sessionStorage.setItem(key, String(value));
	} catch {
		// Private/blocked storage: the place holds for this render only
	}
}

/** A face for the bubble: the portrait, or the first letter when there is none */
export function CastFace(): m.Component<{ member: CastMember; size?: 'sm' | 'md' }> {
	return {
		view(vnode) {
			const { member, size } = vnode.attrs;
			const cls = `cast-face${size === 'sm' ? ' cast-face--sm' : ''}`;

			return member.portraitUrl
				? m('img', { class: cls, src: member.portraitUrl, alt: '', loading: 'lazy' })
				: m(
						'span',
						{ class: `${cls} cast-face--letter`, 'aria-hidden': 'true' },
						[...member.name][0],
					);
		},
	};
}

/**
 * The study house's bubble: the scenario's two characters speak, one fixed
 * line at a time, exactly as the package wrote them. Tap the line for the
 * next. Nothing here is generated, and nothing a student types goes in.
 */
export function CastBubble(): m.Component<CastBubbleAttrs> {
	let selected = 0;
	let activeKey = '';

	return {
		view(vnode) {
			const { cast, stage, storageKey } = vnode.attrs;
			if (cast.length === 0) return null;
			if (activeKey !== storageKey) {
				activeKey = storageKey;
				selected = 0;
			}
			const keyOf = (member: CastMember): string => `${storageKey}_${member.characterId}`;
			const linesOf = (member: CastMember): string[] => castLinesFor(member, stage);
			const finished = (member: CastMember): boolean => {
				const lines = linesOf(member);

				return lines.length === 0 || readSeen(keyOf(member)) >= lines.length - 1;
			};
			const member = cast[Math.min(selected, cast.length - 1)];
			const lines = linesOf(member);
			const index = Math.min(readSeen(keyOf(member)), Math.max(0, lines.length - 1));
			const last = index >= lines.length - 1;
			const done = cast.filter(finished).length;
			if (!vnode.attrs.watcher) vnode.attrs.onProgress?.(done, cast.length);
			const other = cast.findIndex((candidate, i) => i !== selected && !finished(candidate));

			const advance = (): void => {
				if (!last) writeSeen(keyOf(member), index + 1);
			};

			return m(
				'section.cast-bubble',
				{ 'aria-label': vnode.attrs.heading, 'data-cast': member.characterId },
				[
					m('.cast-bubble__head', [
						m(CastFace, { member }),
						m('.cast-bubble__who', [
							m('small.cast-bubble__heading', vnode.attrs.heading),
							m('strong.cast-bubble__name', member.name),
							m('small.cast-bubble__role', member.role),
						]),
					]),
					m(
						'.cast-bubble__chips',
						{ role: 'group', 'aria-label': t('cast.who_speaks') },
						cast.map((candidate, i) =>
							m(
								'button.cast-chip',
								{
									key: candidate.characterId,
									'aria-pressed': String(i === selected),
									class: finished(candidate) ? 'cast-chip--heard' : '',
									onclick: () => {
										selected = i;
									},
								},
								[m(CastFace, { member: candidate, size: 'sm' }), candidate.name],
							),
						),
					),
					vnode.attrs.question ? m('p.cast-bubble__question', vnode.attrs.question) : null,
					lines.length > 0
						? m(
								'button.cast-bubble__line',
								{
									'aria-live': 'polite',
									'aria-label': `${member.name}: ${lines[index]}`,
									onclick: advance,
								},
								lines[index],
							)
						: null,
					m('.cast-bubble__foot', [
						m(
							'span.cast-bubble__dots',
							{ 'aria-hidden': 'true' },
							lines.map((_, i) => m('i', { class: i <= index ? 'is-on' : '' })),
						),
						!last
							? m('button.btn.btn--secondary.btn--sm', { onclick: advance }, t('cast.next_line'))
							: other >= 0
								? m(
										'button.btn.btn--secondary.btn--sm',
										{
											onclick: () => {
												selected = other;
											},
										},
										t('cast.meet_other', { name: cast[other].name }),
									)
								: null,
						vnode.attrs.action
							? m(
									'button.btn.btn--primary.btn--sm',
									{ onclick: vnode.attrs.action.onClick },
									vnode.attrs.action.label,
								)
							: null,
					]),
				],
			);
		},
	};
}
