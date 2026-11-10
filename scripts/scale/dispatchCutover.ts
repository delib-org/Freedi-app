/**
 * Read-only checks for the statement dispatcher cutover. Nothing here deploys,
 * deletes or changes anything. Runbook: docs/scale/statement-dispatch-cutover.md.
 *
 *   npx tsx scripts/scale/dispatchCutover.ts preflight --target=test --names=a,b,c
 *   npx tsx scripts/scale/dispatchCutover.ts verify --target=test --project=<project-id>
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
	checkDeployment,
	checkPreflight,
	CUTOVER_CONFIG as config,
	DeployedTrigger,
	EXPECTED_FUNCTIONS,
	parseFunctionDescription,
	parseTriggerDescription,
	readEnvValue,
} from './dispatchCutoverCheck';

const TARGETS = ['test', 'prod'];

function argument(name: string): string | undefined {
	const prefix = `--${name}=`;

	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function stop(message: string): never {
	console.error(message);
	process.exit(2);
}

function report(problems: string[], successMessage: string): void {
	if (problems.length === 0) {
		console.info(successMessage);

		return;
	}

	console.error(`REFUSED: ${problems.length} problem(s)`);
	problems.forEach((problem) => console.error(`- ${problem}`));
	process.exit(1);
}

function readTargetCutover(): string | undefined {
	const target = argument('target');
	if (!target || !TARGETS.includes(target)) stop(`--target must be one of ${TARGETS.join(', ')}`);

	return readEnvValue(readFileSync(join('env', `.env.${target}`), 'utf8'), config.envKey);
}

function gcloudJson(args: string[]): unknown {
	const output = execFileSync('gcloud', [...args, '--format=json'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
	});

	return JSON.parse(output) as unknown;
}

function describeFunction(
	name: string,
	project: string,
): ReturnType<typeof parseFunctionDescription> {
	return parseFunctionDescription(
		name,
		gcloudJson([
			'functions',
			'describe',
			name,
			'--gen2',
			`--region=${config.region}`,
			`--project=${project}`,
		]),
	);
}

function describeTrigger(triggerName: string, project: string): DeployedTrigger {
	return parseTriggerDescription(
		gcloudJson([
			'eventarc',
			'triggers',
			'describe',
			triggerName,
			`--location=${config.region}`,
			`--project=${project}`,
		]),
	);
}

function runPreflight(): void {
	const names = (argument('names') ?? '').split(',').filter(Boolean);
	const problems = checkPreflight({ rawCutover: readTargetCutover(), nowMs: Date.now(), names });

	report(problems, `Preflight passed for ${names.length} functions.`);
}

function runVerify(): void {
	const project = argument('project');
	if (!project) stop('--project is required; there is no default on purpose');

	const functions = EXPECTED_FUNCTIONS.map((name) => describeFunction(name, project));
	const dispatcherTriggerName = functions.find(
		({ name }) => name === config.dispatcher,
	)?.triggerName;
	const dispatcherTrigger = dispatcherTriggerName
		? describeTrigger(dispatcherTriggerName, project)
		: undefined;

	const problems = checkDeployment({
		rawCutover: readTargetCutover(),
		nowMs: Date.now(),
		functions,
		dispatcherTrigger,
	});

	report(problems, `All ${functions.length} functions carry the cutover value.`);
}

const COMMANDS: Record<string, () => void> = { preflight: runPreflight, verify: runVerify };
const command = COMMANDS[process.argv[2] ?? ''];

if (!command) stop(`Usage: dispatchCutover.ts ${Object.keys(COMMANDS).join('|')} --target=...`);
command();
