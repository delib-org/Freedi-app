import m from 'mithril';
import type { StepAttrs } from '../steps/stepSlot';
import { SummaryScreen } from './SummaryScreen';
import { TableFlow } from './TableFlow';
import { VoteScreen } from './VoteScreen';

/** The lazy chunk behind the four C3 step slots (see lazyStep.ts). */

export const TableTalkBody: m.Component<StepAttrs> = {
	view: ({ attrs }) => m(TableFlow, { main: attrs.main, kind: 'tableTalk' }),
};

export const ProposalsBody: m.Component<StepAttrs> = {
	view: ({ attrs }) => m(TableFlow, { main: attrs.main, kind: 'proposals' }),
};

export const VoteBody: m.Component<StepAttrs> = {
	view: ({ attrs }) => m(VoteScreen, { main: attrs.main }),
};

export const SummaryBody: m.Component<StepAttrs> = {
	view: ({ attrs }) => m(SummaryScreen, { main: attrs.main }),
};
