import m from 'mithril';
import { t } from '../lib/i18n';
import { CampScale } from '../components/CampScale';
import { db, doc, updateDoc } from '../lib/firebase';
import { Collections, AgoraParticipant, AgoraTopicPackage, deriveCamp } from '@freedi/shared-types';

export interface PositioningAttrs {
	topic: AgoraTopicPackage;
	myParticipant: AgoraParticipant;
}

/**
 * The bridge: the student places their marker between the two camps.
 * Confirming writes campPosition + derived camp onto their own
 * participant doc (allowed by rules; points stay frozen).
 */
export function Positioning(): m.Component<PositioningAttrs> {
	let value = 50;
	let initialized = false;
	let saving = false;

	return {
		view(vnode) {
			const { topic, myParticipant } = vnode.attrs;
			const scale = topic.positioningScale;
			const confirmed = myParticipant.campPosition !== undefined;

			if (!initialized) {
				value = myParticipant.campPosition ?? 50;
				initialized = true;
			}

			function confirm(): void {
				if (saving) return;
				saving = true;
				updateDoc(doc(db, Collections.agoraParticipants, myParticipant.participantId), {
					campPosition: value,
					camp: deriveCamp(value),
					lastActive: Date.now(),
				})
					.catch((error: unknown) => {
						console.error('[Positioning] Saving position failed:', error);
					})
					.finally(() => {
						saving = false;
						m.redraw();
					});
			}

			return m('.shell', [
				m('.shell__content', { style: { justifyContent: 'center', gap: 'var(--space-xl)' } }, [
					m('h2.text-center', t('positioning.title')),
					m('p.home-explanation', t('positioning.hint')),

					m('.card.stack', [
						m(CampScale, {
							leftLabel: scale.leftLabel,
							rightLabel: scale.rightLabel,
							value,
							disabled: confirmed,
							onChange: (next) => {
								value = next;
							},
						}),
						confirmed
							? m('p.text-center.lobby__status', t('positioning.confirmed'))
							: m(
									'button.btn.btn--primary.btn--full.btn--lg',
									{ disabled: saving, onclick: confirm },
									t('positioning.confirm'),
								),
					]),
				]),
			]);
		},
	};
}
