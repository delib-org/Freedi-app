import m from 'mithril';
import { preferencesAccess } from '@/logic/nextAction';
import { stepNumber, stepsOf } from '@/logic/steps';
import { ParticipantFrame } from '@/components/ParticipantFrame';
import type { ParticipantContext } from '@/components/ParticipantFrame';
import { Redirect } from '@/components/Redirect';
import { StateBox } from '@/components/StateBox';
import { stepLabel } from '@/components/StepHeader';
import { DirectPicker } from '@/views/participant/DirectPicker';
import { RankedPreferences } from '@/views/participant/RankedPreferences';
import { participantHomePath } from '@/paths';

/**
 * `/sessions/:id/preferences`: step 2. Mix mode ranks topics; free mode lists
 * the tables to sit at. Opened without a registration, or after closing, it
 * goes back to the assignment link (IA section 5).
 */
export const ParticipantPreferences: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(ParticipantFrame, {
			sessionId: attrs.id,
			topics: true,
			occupancy: true,
			barLabel: ({ session }: ParticipantContext) =>
				stepLabel(stepNumber(session, 'preferences'), stepsOf(session).length),
			render: (context: ParticipantContext) => {
				const access = preferencesAccess(context.session.status, context.seated);

				if (context.me && access === 'checking') return m(StateBox, { kind: 'loading' });
				if (!context.me || access !== 'allowed') {
					return m(Redirect, { to: participantHomePath(attrs.id) });
				}

				return context.session.mode === 'direct'
					? m(DirectPicker, { context })
					: m(RankedPreferences, { context });
			},
		});
	},
};
