import m from 'mithril';
import { ParticipantFrame } from '@/components/ParticipantFrame';
import type { ParticipantContext } from '@/components/ParticipantFrame';
import { DirectPicker } from '@/views/participant/DirectPicker';
import { RankedPreferences } from '@/views/participant/RankedPreferences';

/**
 * `/sessions/:id/preferences`: My preferences. Ranked mode ranks topics;
 * direct mode lists the tables to sit at (same route, IA section 4).
 */
export const ParticipantPreferences: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(ParticipantFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.screen.preferences',
			occupancy: true,
			render: (context: ParticipantContext) =>
				context.session.mode === 'direct'
					? m(DirectPicker, { context })
					: m(RankedPreferences, { context }),
		});
	},
};
