/**
 * Entry point. Run through scripts/scale/run.sh (npm run scale:baseline), which
 * brings up the solo emulators with the trace shim first. It never runs against
 * anything but a local emulator: see assertEmulatorOnly.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertEmulatorOnly, configFromArgs, EXPECTED_PROJECT_ID } from './config';
import type { ScaleConfig } from './config';
import { SampleClient } from './clients';
import type { PhaseCounts } from './clients';
import { simulateExposure } from './exposure';
import type { ExposureResult } from './exposure';
import { runBurst } from './burst';
import type { PhaseRecord } from './burst';
import { aggregatePhase } from './metrics';
import type { PhaseCost } from './metrics';
import {
	adminDb,
	clearEmulators,
	disableTriggers,
	enableTriggers,
	QUESTION_ID,
	seedPopulation,
	subscriptionFor,
	presenceDoc,
	viewDoc,
	memberCreator,
	TOP_ID,
} from './seed';
import { Collections } from '@freedi/shared-types';
import { TraceTail } from './trace';

export interface RunResult {
	label: string;
	date: string;
	commit: string;
	config: ScaleConfig;
	seedSeconds: number;
	exposure: Omit<ExposureResult, 'answers' | 'ratedBy'>;
	phases: Array<
		PhaseCost & {
			countsBefore: PhaseRecord['countsBefore'];
			countsAfter: PhaseRecord['countsAfter'];
			from: number;
			to: number;
		}
	>;
	clients: {
		uid: string;
		counts: PhaseCounts;
		questionFieldChanges: Record<string, Record<string, number>>;
	}[];
	questionDocBytes: number;
	participationReadMs: number;
	peakFunctionsRssMb: number;
	peakWorkers: number;
}

const CLIENT_OPEN_SETTLE_MS = 2000;

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} must be set (run through scripts/scale/run.sh).`);

	return value;
}

function gitHead(): string {
	return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
}

async function main(): Promise<void> {
	const { projectId } = assertEmulatorOnly(process.env);
	const config = configFromArgs(process.argv.slice(2));
	const traceDir = requireEnv('SCALE_TRACE_DIR');
	const outDir = requireEnv('SCALE_OUT_DIR');
	mkdirSync(traceDir, { recursive: true });
	mkdirSync(outDir, { recursive: true });

	console.info(`[scale] ${config.label}: ${config.members} members, ${config.answers} answers`);
	await disableTriggers();
	await clearEmulators(projectId);

	const db = adminDb();
	const trace = new TraceTail(traceDir);
	const seedStart = Date.now();
	const seeded = await seedPopulation(db, config);

	const clients: SampleClient[] = [];
	for (let i = 0; i < config.sampleClients; i += 1) {
		clients.push(await SampleClient.connect(i, EXPECTED_PROJECT_ID));
	}
	await Promise.all(
		clients.flatMap((client) => {
			const user = memberCreator(client.uid);

			return [
				db
					.collection(Collections.statementsSubscribe)
					.doc(`${client.uid}--${QUESTION_ID}`)
					.set(subscriptionFor(user, seeded.question)),
				db
					.collection(Collections.statementViews)
					.doc(`${client.uid}--${QUESTION_ID}`)
					.set(viewDoc(client.uid, QUESTION_ID, TOP_ID)),
				db
					.collection(Collections.online)
					.doc(`${client.uid}--${QUESTION_ID}`)
					.set(presenceDoc(user, QUESTION_ID)),
			];
		}),
	);

	const exposure = await simulateExposure(seeded, config, clients[0], seedStart);
	const seedSeconds = Math.round((Date.now() - seedStart) / 1000);
	console.info(`[scale] seeded and simulated exposure in ${seedSeconds}s`);

	await Promise.all(clients.map((client) => client.openQuestion(QUESTION_ID)));
	await new Promise((resolve) => setTimeout(resolve, CLIENT_OPEN_SETTLE_MS));
	clients.forEach((client) => client.setPhase('idle'));

	await enableTriggers();
	const phases = await runBurst({
		seeded,
		config,
		answers: exposure.answers,
		ratedBy: exposure.ratedBy,
		clients,
		trace,
	});

	const costs = phases.map((phase) => ({
		...aggregatePhase(trace.records, phase, `${Collections.statements}/${QUESTION_ID}`),
		countsBefore: phase.countsBefore,
		countsAfter: phase.countsAfter,
		from: phase.from,
		to: phase.to,
	}));

	const exposureSummary: RunResult['exposure'] = {
		stats: exposure.stats,
		ifRatedWholeWindow: exposure.ifRatedWholeWindow,
		ratingsWritten: exposure.ratingsWritten,
	};
	const result: RunResult = {
		label: config.label,
		date: new Date().toISOString(),
		commit: gitHead(),
		config,
		seedSeconds,
		exposure: exposureSummary,
		phases: costs,
		clients: clients.map((client) => ({
			uid: client.uid,
			counts: client.counts,
			questionFieldChanges: client.questionFieldChanges,
		})),
		questionDocBytes: Math.max(...clients.map((client) => client.questionDocBytes)),
		participationReadMs: Math.max(...clients.map((client) => client.participationReadMs)),
		peakFunctionsRssMb: trace.peakRssMb,
		peakWorkers: trace.peakWorkers,
	};

	writeFileSync(path.join(outDir, `${config.label}.json`), JSON.stringify(result, null, 2));
	await Promise.all(clients.map((client) => client.close()));
	console.info(`[scale] wrote ${path.join(outDir, `${config.label}.json`)}`);
	process.exit(0);
}

main().catch((error: unknown) => {
	console.error('[scale] failed', error);
	process.exit(1);
});
