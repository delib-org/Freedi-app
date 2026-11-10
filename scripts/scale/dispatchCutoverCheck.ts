import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Pure checks behind dispatchCutover.ts. Each returns the problems it found; an
 * empty list means safe to continue. The runbook is
 * docs/scale/statement-dispatch-cutover.md.
 */
interface CutoverConfig {
	region: string;
	envKey: string;
	dispatcher: string;
	minPlausibleCutoverMs: number;
	functions: string[];
}

/** Read from the repository root, where the runbook runs this and where jest runs. */
export const CUTOVER_CONFIG = JSON.parse(
	readFileSync(join(process.cwd(), 'scripts/scale/dispatchCutover.config.json'), 'utf8'),
) as CutoverConfig;

const config = CUTOVER_CONFIG;

const MINUTE_MS = 60_000;

/** Long enough to deploy all 14, verify, and redeploy once if a function fails. */
export const MIN_PREFLIGHT_LEAD_MS = 90 * MINUTE_MS;

/** Eventarc says a new trigger can take minutes to go active; this is a wide margin. */
export const ACTIVATION_MARGIN_MS = 15 * MINUTE_MS;

export const EXPECTED_FUNCTIONS: readonly string[] = config.functions;

export interface DeployedFunction {
	name: string;
	state?: string;
	updateTimeMs?: number;
	cutoverValue?: string;
	triggerName?: string;
}

export interface DeployedTrigger {
	updateTimeMs?: number;
	conditionProblems: string[];
}

/** Reads one KEY=value line from an env file's text, ignoring comments and quotes. */
export function readEnvValue(envFileText: string, key: string): string | undefined {
	for (const line of envFileText.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.startsWith('#') || !trimmed.startsWith(`${key}=`)) continue;

		return trimmed
			.slice(key.length + 1)
			.trim()
			.replace(/^["']|["']$/g, '');
	}

	return undefined;
}

export function checkCutoverValue(raw: string | undefined): string[] {
	if (!raw) return [`${config.envKey} is not set`];

	const value = Number(raw);
	if (!Number.isFinite(value) || value < config.minPlausibleCutoverMs) {
		return [
			`${config.envKey}=${raw} is not a time in ms at or after ${config.minPlausibleCutoverMs}`,
		];
	}

	return [];
}

export function checkFunctionNames(names: readonly string[]): string[] {
	const given = new Set(names);
	const expected = new Set(EXPECTED_FUNCTIONS);
	const problems: string[] = [];

	if (given.size !== names.length) problems.push('the deploy list contains a duplicate name');
	for (const name of expected) {
		if (!given.has(name)) problems.push(`missing from the deploy list: ${name}`);
	}
	for (const name of given) {
		if (!expected.has(name)) problems.push(`not one of the 14 cutover functions: ${name}`);
	}

	return problems;
}

/** Run before deploying. */
export function checkPreflight(input: {
	rawCutover: string | undefined;
	nowMs: number;
	names: readonly string[];
}): string[] {
	const valueProblems = checkCutoverValue(input.rawCutover);
	const nameProblems = checkFunctionNames(input.names);
	if (valueProblems.length > 0) return [...valueProblems, ...nameProblems];

	const leadMs = Number(input.rawCutover) - input.nowMs;
	const leadProblems =
		leadMs < MIN_PREFLIGHT_LEAD_MS
			? [
					`the cutover is ${Math.floor(leadMs / MINUTE_MS)} minutes away; ` +
						`it must be at least ${MIN_PREFLIGHT_LEAD_MS / MINUTE_MS} minutes ahead`,
				]
			: [];

	return [...leadProblems, ...nameProblems];
}

function checkOneFunction(deployed: DeployedFunction, rawCutover: string): string[] {
	const problems: string[] = [];

	if (deployed.state !== 'ACTIVE') {
		problems.push(`${deployed.name}: state is ${deployed.state ?? 'unknown'}, expected ACTIVE`);
	}
	if (deployed.cutoverValue !== rawCutover) {
		problems.push(
			`${deployed.name}: ${config.envKey} is ${deployed.cutoverValue ?? 'unset'}, expected ${rawCutover}`,
		);
	}
	if (
		deployed.updateTimeMs === undefined ||
		deployed.updateTimeMs + ACTIVATION_MARGIN_MS > Number(rawCutover)
	) {
		problems.push(`${deployed.name}: last revision is too close to the cutover, or has no time`);
	}

	return problems;
}

/** Run after deploying and before the cutover time. */
export function checkDeployment(input: {
	rawCutover: string | undefined;
	nowMs: number;
	functions: readonly DeployedFunction[];
	dispatcherTrigger?: DeployedTrigger;
}): string[] {
	const valueProblems = checkCutoverValue(input.rawCutover);
	if (valueProblems.length > 0) return valueProblems;

	const rawCutover = input.rawCutover as string;
	const problems = checkFunctionNames(input.functions.map(({ name }) => name));

	if (input.nowMs >= Number(rawCutover)) {
		problems.push('the cutover time has already passed; see the runbook failure table');
	}
	problems.push(...input.functions.flatMap((deployed) => checkOneFunction(deployed, rawCutover)));

	const trigger = input.dispatcherTrigger;
	if (!trigger) {
		problems.push(`${config.dispatcher}: its Eventarc trigger was not found`);
	} else {
		problems.push(...trigger.conditionProblems.map((text) => `Eventarc trigger: ${text}`));
		if (
			trigger.updateTimeMs === undefined ||
			trigger.updateTimeMs + ACTIVATION_MARGIN_MS > Number(rawCutover)
		) {
			problems.push('Eventarc trigger: it changed too close to the cutover, or has no time');
		}
	}

	return problems;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asTimeMs(value: unknown): number | undefined {
	const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;

	return Number.isNaN(parsed) ? undefined : parsed;
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

/** Shapes the output of `gcloud functions describe --format=json`. */
export function parseFunctionDescription(name: string, described: unknown): DeployedFunction {
	const root = asRecord(described);
	const serviceConfig = asRecord(root.serviceConfig);

	return {
		name,
		state: asString(root.state),
		updateTimeMs: asTimeMs(root.updateTime),
		cutoverValue: asString(asRecord(serviceConfig.environmentVariables)[config.envKey]),
		triggerName: asString(asRecord(root.eventTrigger).trigger),
	};
}

/** Shapes `gcloud eventarc triggers describe --format=json`. A condition other than OK is a problem. */
export function parseTriggerDescription(described: unknown): DeployedTrigger {
	const root = asRecord(described);
	const conditionProblems = Object.entries(asRecord(root.conditions)).flatMap(([key, value]) => {
		const condition = asRecord(value);

		return condition.code === undefined || condition.code === 'OK'
			? []
			: [`${key}: ${String(condition.code)} ${String(condition.message ?? '')}`.trim()];
	});

	return { updateTimeMs: asTimeMs(root.updateTime), conditionProblems };
}
