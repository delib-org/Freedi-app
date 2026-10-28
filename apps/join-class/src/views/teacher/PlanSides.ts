import m from 'mithril';
import { t } from '@/lib/i18n';
import {
	SIDE_CLAIM_MAX_LENGTH,
	SIDE_NAME_MAX_LENGTH,
	SIDE_QUESTION_MAX_LENGTH,
} from '@/lib/classroom/classSettings';
import { fieldValue } from './planController';
import {
	CLAIM_A_KEY,
	CLAIM_B_KEY,
	SIDE_A_KEY,
	SIDE_B_KEY,
	SIDE_QUESTION_KEY,
	commitSideClaim,
	commitSideName,
	commitSideQuestion,
	defaultSideName,
	onDetailInput,
	savedSideClaim,
	savedSideName,
	savedSideQuestion,
} from './planDetails';
import { field, fieldError } from './planFields';

/** The side step's dilemma in "lesson details": the question on the slider and,
 *  per side, its character name and the claim shown under it. Every field is
 *  optional; empty means the translated default (no claim line for a claim). */

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
	const nameKey = side === 'a' ? SIDE_A_KEY : SIDE_B_KEY;
	const claimKey = side === 'a' ? CLAIM_A_KEY : CLAIM_B_KEY;
	const nameLabel = t(side === 'a' ? 'plan.details.side_a' : 'plan.details.side_b');
	const claimLabel = t(side === 'a' ? 'plan.details.claim_a' : 'plan.details.claim_b');

	return m(`fieldset.plan-details__side.plan-details__side--${side}`, [
		m('legend.plan-details__legend', t(side === 'a' ? 'console.side_a' : 'console.side_b')),
		labelled(
			nameLabel,
			field({
				key: nameKey,
				label: nameLabel,
				value: fieldValue(nameKey, savedSideName(nameKey)),
				placeholder: defaultSideName(nameKey),
				max: SIDE_NAME_MAX_LENGTH,
				className: 'plan-card__text plan-details__name',
				onValue: (v) => onDetailInput(nameKey, v, SIDE_NAME_MAX_LENGTH),
				onCommit: () => commitSideName(nameKey),
			}),
		),
		fieldError(nameKey),
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
		questionField(),
		fieldError(SIDE_QUESTION_KEY),
		sideGroup('a'),
		sideGroup('b'),
	]);
}
