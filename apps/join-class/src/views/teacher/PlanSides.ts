import m from 'mithril';
import { t } from '@/lib/i18n';
import { SIDE_CLAIM_MAX_LENGTH, SIDE_QUESTION_MAX_LENGTH } from '@/lib/classroom/classSettings';
import { fieldValue } from './planController';
import {
	CLAIM_A_KEY,
	CLAIM_B_KEY,
	SIDE_QUESTION_KEY,
	commitSideClaim,
	commitSideQuestion,
	onDetailInput,
	savedSideClaim,
	savedSideQuestion,
} from './planDetails';
import { field, fieldError } from './planFields';

/** The side step's dilemma in "lesson details": the question on the slider and,
 *  per side ("Side A" / "Side B", never a character name), what that side says.
 *  Every field is optional; empty means the translated default (no claim line
 *  for a claim). */

/** Enough rows for a claim of SIDE_CLAIM_MAX_LENGTH on a phone. */
const CLAIM_ROWS = 3;

function labelled(label: string, input: m.Vnode): m.Vnode {
	return m('label.plan-details__field', [m('span.plan-details__label', label), input]);
}

function questionField(): m.Vnode {
	const label = t('plan.details.side_question');

	return labelled(
		label,
		field({
			key: SIDE_QUESTION_KEY,
			label,
			value: fieldValue(SIDE_QUESTION_KEY, savedSideQuestion()),
			placeholder: t('side.title'),
			max: SIDE_QUESTION_MAX_LENGTH,
			className: 'plan-card__text',
			onValue: (v) => onDetailInput(SIDE_QUESTION_KEY, v, SIDE_QUESTION_MAX_LENGTH),
			onCommit: commitSideQuestion,
		}),
	);
}

function sideGroup(side: 'a' | 'b'): m.Vnode {
	const claimKey = side === 'a' ? CLAIM_A_KEY : CLAIM_B_KEY;
	const claimLabel = t(side === 'a' ? 'plan.details.claim_a' : 'plan.details.claim_b');

	return m(`fieldset.plan-details__side.plan-details__side--${side}`, [
		m('legend.plan-details__legend', t(side === 'a' ? 'console.side_a' : 'console.side_b')),
		labelled(
			claimLabel,
			field({
				key: claimKey,
				label: claimLabel,
				value: fieldValue(claimKey, savedSideClaim(claimKey)),
				placeholder: t('plan.details.claim.placeholder'),
				max: SIDE_CLAIM_MAX_LENGTH,
				rows: CLAIM_ROWS,
				className: 'plan-card__text plan-details__claim',
				onValue: (v) => onDetailInput(claimKey, v, SIDE_CLAIM_MAX_LENGTH),
				onCommit: () => commitSideClaim(claimKey),
			}),
		),
		fieldError(claimKey),
	]);
}

export function renderSides(): m.Vnode {
	return m('.plan-details__sides', [
		m('h3.plan-details__sides-title', t('plan.sides.title')),
		m('p.plan__help', t('plan.sides.help')),
		questionField(),
		fieldError(SIDE_QUESTION_KEY),
		sideGroup('a'),
		sideGroup('b'),
	]);
}
