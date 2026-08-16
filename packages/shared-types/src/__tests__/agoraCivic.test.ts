import {
	AGORA_CIVIC_CENTER_POSITION,
	deriveCivicCampPosition,
	CivicStanceEvaluation,
} from '../models/agora/agoraCivic';
import { deriveCamp } from '../models/agora/agoraBridging';
import { AgoraCamp } from '../models/agora/agoraEnums';
import { ODYSSEY_ATTITUDES } from '../models/odyssey/odysseyGame';

const LEFT = 'stance-left';
const RIGHT = 'stance-right';

const attitude = (key: 'support' | 'livewith' | 'oppose'): number =>
	ODYSSEY_ATTITUDES.find((a) => a.key === key)!.value;

function stances(
	left?: 'support' | 'livewith' | 'oppose',
	right?: 'support' | 'livewith' | 'oppose',
): CivicStanceEvaluation[] {
	const evaluations: CivicStanceEvaluation[] = [];
	if (left) evaluations.push({ statementId: LEFT, evaluation: attitude(left) });
	if (right) evaluations.push({ statementId: RIGHT, evaluation: attitude(right) });

	return evaluations;
}

const position = (evaluations: CivicStanceEvaluation[]): number =>
	deriveCivicCampPosition(evaluations, LEFT, RIGHT);

describe('deriveCivicCampPosition', () => {
	it('puts someone who backs one pole and rejects the other in that wing', () => {
		expect(position(stances('oppose', 'support'))).toBe(100);
		expect(position(stances('support', 'oppose'))).toBe(0);
	});

	it('leaves someone who feels the same about both poles in the centre', () => {
		expect(position(stances('support', 'support'))).toBe(
			AGORA_CIVIC_CENTER_POSITION,
		);
		expect(position(stances('oppose', 'oppose'))).toBe(
			AGORA_CIVIC_CENTER_POSITION,
		);
		expect(position(stances('livewith', 'livewith'))).toBe(
			AGORA_CIVIC_CENTER_POSITION,
		);
	});

	it('still records a lean when only one pole was answered', () => {
		expect(position(stances(undefined, 'support'))).toBe(75);
		expect(position(stances('support', undefined))).toBe(25);
	});

	it('reads "can live with it" as a softer lean than support', () => {
		const soft = position(stances('livewith', 'support'));
		const hard = position(stances('oppose', 'support'));
		expect(soft).toBeLessThan(hard);
		expect(soft).toBeGreaterThan(AGORA_CIVIC_CENTER_POSITION);
	});

	it('centres a player whose island has no anchors configured', () => {
		const answered = stances('oppose', 'support');
		expect(deriveCivicCampPosition(answered)).toBe(AGORA_CIVIC_CENTER_POSITION);
		expect(deriveCivicCampPosition(answered, LEFT, null)).toBe(
			AGORA_CIVIC_CENTER_POSITION,
		);
		expect(deriveCivicCampPosition(answered, null, RIGHT)).toBe(
			AGORA_CIVIC_CENTER_POSITION,
		);
	});

	it('centres a player who never rated either anchor', () => {
		expect(position([{ statementId: 'some-other-stance', evaluation: 1 }])).toBe(
			AGORA_CIVIC_CENTER_POSITION,
		);
		expect(position([])).toBe(AGORA_CIVIC_CENTER_POSITION);
	});

	it('stays inside the 0-100 scale deriveCamp expects', () => {
		const extreme = [
			{ statementId: LEFT, evaluation: -5 },
			{ statementId: RIGHT, evaluation: 5 },
		];
		expect(position(extreme)).toBe(100);
		expect(
			position([
				{ statementId: LEFT, evaluation: 5 },
				{ statementId: RIGHT, evaluation: -5 },
			]),
		).toBe(0);
	});

	it('feeds camps the bridging score can actually cross', () => {
		expect(deriveCamp(position(stances('oppose', 'support')))).toBe(
			AgoraCamp.right,
		);
		expect(deriveCamp(position(stances('support', 'oppose')))).toBe(
			AgoraCamp.left,
		);
		expect(deriveCamp(position(stances('support', 'support')))).toBe(
			AgoraCamp.center,
		);
	});
});
