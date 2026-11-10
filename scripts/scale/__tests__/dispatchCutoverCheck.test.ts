import {
	ACTIVATION_MARGIN_MS,
	checkCutoverValue,
	checkDeployment,
	checkFunctionNames,
	checkPreflight,
	CUTOVER_CONFIG as config,
	DeployedFunction,
	EXPECTED_FUNCTIONS,
	MIN_PREFLIGHT_LEAD_MS,
	parseFunctionDescription,
	parseTriggerDescription,
	readEnvValue,
} from '../dispatchCutoverCheck';

const CUTOVER_MS = 1_800_000_000_000;
const RAW = String(CUTOVER_MS);
const NOW_MS = CUTOVER_MS - 2 * MIN_PREFLIGHT_LEAD_MS;
const DEPLOYED_AT = CUTOVER_MS - 3 * ACTIVATION_MARGIN_MS;
const NAMES = [...EXPECTED_FUNCTIONS];
const healthyTrigger = { updateTimeMs: DEPLOYED_AT, conditionProblems: [] };

function deployed(overrides: Partial<DeployedFunction> = {}): DeployedFunction[] {
	return NAMES.map((name, index) => ({
		name,
		state: 'ACTIVE',
		updateTimeMs: DEPLOYED_AT,
		cutoverValue: RAW,
		...(index === 0 ? overrides : {}),
	}));
}

function deployment(
	functions = deployed(),
	dispatcherTrigger: typeof healthyTrigger | undefined = healthyTrigger,
) {
	return checkDeployment({ rawCutover: RAW, nowMs: NOW_MS, functions, dispatcherTrigger });
}

describe('readEnvValue', () => {
	it('reads the key and strips quotes', () => {
		expect(readEnvValue(`A=1\n${config.envKey}="${RAW}"\n`, config.envKey)).toBe(RAW);
	});

	it('ignores a commented line and a longer key', () => {
		expect(
			readEnvValue(`#${config.envKey}=1\n${config.envKey}_X=2\n`, config.envKey),
		).toBeUndefined();
	});
});

describe('checkCutoverValue', () => {
	it('accepts a time in ms', () => {
		expect(checkCutoverValue(RAW)).toEqual([]);
	});

	it.each([undefined, '', 'soon', '1800000000', String(config.minPlausibleCutoverMs - 1)])(
		'refuses %s',
		(raw) => {
			expect(checkCutoverValue(raw)).toHaveLength(1);
		},
	);
});

describe('checkFunctionNames', () => {
	it('lists exactly 14 functions', () => {
		expect(new Set(EXPECTED_FUNCTIONS).size).toBe(14);
	});

	it('accepts the exact list in any order', () => {
		expect(checkFunctionNames([...NAMES].reverse())).toEqual([]);
	});

	it('names what is missing', () => {
		expect(checkFunctionNames(NAMES.slice(1))).toEqual([
			`missing from the deploy list: ${NAMES[0]}`,
		]);
	});

	it('names what is extra', () => {
		expect(checkFunctionNames([...NAMES, 'newEvaluation'])).toEqual([
			'not one of the 14 cutover functions: newEvaluation',
		]);
	});

	it('refuses a duplicate', () => {
		expect(checkFunctionNames([...NAMES, NAMES[0]])).toEqual([
			'the deploy list contains a duplicate name',
		]);
	});
});

describe('checkPreflight', () => {
	it('passes when the cutover is far enough ahead and the list is exact', () => {
		expect(checkPreflight({ rawCutover: RAW, nowMs: NOW_MS, names: NAMES })).toEqual([]);
	});

	it('passes at exactly the minimum lead', () => {
		const nowMs = CUTOVER_MS - MIN_PREFLIGHT_LEAD_MS;

		expect(checkPreflight({ rawCutover: RAW, nowMs, names: NAMES })).toEqual([]);
	});

	it('refuses a cutover that is too soon', () => {
		const nowMs = CUTOVER_MS - MIN_PREFLIGHT_LEAD_MS + 1;

		expect(checkPreflight({ rawCutover: RAW, nowMs, names: NAMES })).toHaveLength(1);
	});

	it('refuses a value in seconds and still reports the list', () => {
		const problems = checkPreflight({
			rawCutover: '1800000000',
			nowMs: NOW_MS,
			names: NAMES.slice(1),
		});

		expect(problems).toHaveLength(2);
	});
});

describe('checkDeployment', () => {
	it('passes when all 14 are active with the value and the trigger is settled', () => {
		expect(deployment()).toEqual([]);
	});

	it('refuses when one function has no value', () => {
		const [problem] = deployment(deployed({ cutoverValue: undefined }));

		expect(problem).toContain('is unset');
	});

	it('refuses when one function has a different value', () => {
		expect(deployment(deployed({ cutoverValue: String(CUTOVER_MS + 1) }))).toHaveLength(1);
	});

	it('refuses a function that is not active', () => {
		expect(deployment(deployed({ state: 'DEPLOYING' }))).toHaveLength(1);
	});

	it('refuses a revision too close to the cutover', () => {
		expect(
			deployment(deployed({ updateTimeMs: CUTOVER_MS - ACTIVATION_MARGIN_MS + 1 })),
		).toHaveLength(1);
	});

	it('accepts a revision exactly one margin before the cutover', () => {
		expect(deployment(deployed({ updateTimeMs: CUTOVER_MS - ACTIVATION_MARGIN_MS }))).toEqual([]);
	});

	it('refuses when a function is missing from the results', () => {
		expect(deployment(deployed().slice(1))).toEqual([`missing from the deploy list: ${NAMES[0]}`]);
	});

	it('refuses once the cutover has passed', () => {
		const problems = checkDeployment({
			rawCutover: RAW,
			nowMs: CUTOVER_MS,
			functions: deployed(),
			dispatcherTrigger: healthyTrigger,
		});

		expect(problems).toHaveLength(1);
	});

	it('refuses when the dispatcher trigger is missing', () => {
		const problems = checkDeployment({ rawCutover: RAW, nowMs: NOW_MS, functions: deployed() });

		expect(problems).toHaveLength(1);
	});

	it('refuses a trigger with a failing condition', () => {
		const dispatcherTrigger = { updateTimeMs: DEPLOYED_AT, conditionProblems: ['service: bad'] };

		expect(deployment(deployed(), dispatcherTrigger)).toEqual(['Eventarc trigger: service: bad']);
	});

	it('refuses a trigger that changed too close to the cutover', () => {
		const dispatcherTrigger = { updateTimeMs: CUTOVER_MS, conditionProblems: [] };

		expect(deployment(deployed(), dispatcherTrigger)).toHaveLength(1);
	});
});

describe('parseFunctionDescription', () => {
	it('reads the fields gcloud returns', () => {
		expect(
			parseFunctionDescription('fn', {
				state: 'ACTIVE',
				updateTime: '2027-01-15T08:00:00.123Z',
				serviceConfig: { environmentVariables: { [config.envKey]: RAW, OTHER: 'x' } },
				eventTrigger: { trigger: 'projects/p/locations/l/triggers/t' },
			}),
		).toEqual({
			name: 'fn',
			state: 'ACTIVE',
			updateTimeMs: Date.parse('2027-01-15T08:00:00.123Z'),
			cutoverValue: RAW,
			triggerName: 'projects/p/locations/l/triggers/t',
		});
	});

	it('leaves everything unknown on an unexpected shape', () => {
		expect(parseFunctionDescription('fn', null)).toEqual({
			name: 'fn',
			state: undefined,
			updateTimeMs: undefined,
			cutoverValue: undefined,
			triggerName: undefined,
		});
	});
});

describe('parseTriggerDescription', () => {
	it('reports only conditions that are not OK', () => {
		const parsed = parseTriggerDescription({
			updateTime: '2027-01-15T08:00:00Z',
			conditions: {
				a: { code: 'OK' },
				b: { code: 'PERMISSION_DENIED', message: 'no access' },
			},
		});

		expect(parsed.conditionProblems).toEqual(['b: PERMISSION_DENIED no access']);
		expect(parsed.updateTimeMs).toBe(Date.parse('2027-01-15T08:00:00Z'));
	});

	it('has no problems when there are no conditions', () => {
		expect(parseTriggerDescription({}).conditionProblems).toEqual([]);
	});
});
