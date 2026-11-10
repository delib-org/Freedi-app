/**
 * Sizes, limits and the emulator-only guard for the scale baseline (task 3.0).
 * Nothing here talks to Firestore.
 */

/** Projects the script must never touch, whatever the env says. */
export const PRODUCTION_PROJECT_IDS = [
	'synthesistalyaron',
	'wizcol-app',
	'delib-v3-dev',
	'delib-5',
] as const;

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];
export const SOLO_FIRESTORE_PORT = '8101';
export const SOLO_HUB_PORT = '4420';
export const EXPECTED_PROJECT_ID = 'freedi-test';

export interface ScaleConfig {
	label: string;
	/** Seeded subscribers (the "about 1,000 people"). */
	members: number;
	/** Seeded answers (the "about 300"). */
	answers: number;
	/** Answers each person rates in the exposure simulation. */
	ratingsPerMember: number;
	/** Real client-SDK participants listening during the measurement. */
	sampleClients: number;
	burst: {
		arrivals: number;
		views: number;
		presence: number;
		ratings: number;
		simultaneousRatings: number;
		newAnswers: number;
	};
}

/** `CHAT.INITIAL_MESSAGES_LIMIT` in src/constants/common.ts. */
export const WINDOW_SIZE = 30;
/** `FIREBASE.FIRST_LOAD_LIMIT` in src/constants/common.ts. */
export const HEAD_START_LIMIT = 10;

/** Pacing: this many trigger-firing writes, then wait for the emulator to go quiet. */
export const PACED_BATCH = 5;
export const SETTLE_QUIET_MS = 1500;
export const SETTLE_TIMEOUT_MS = 180_000;
export const SEED_BATCH = 400;
export const MAX_FUNCTIONS_RSS_MB = 12_000;

export const FULL_CONFIG: Omit<ScaleConfig, 'label'> = {
	members: 1000,
	answers: 300,
	ratingsPerMember: 10,
	sampleClients: 10,
	burst: {
		arrivals: 100,
		views: 100,
		presence: 100,
		ratings: 200,
		simultaneousRatings: 15,
		newAnswers: 3,
	},
};

export const SMALL_CONFIG: Omit<ScaleConfig, 'label'> = {
	members: 200,
	answers: 60,
	ratingsPerMember: 10,
	sampleClients: 10,
	burst: {
		arrivals: 50,
		views: 50,
		presence: 50,
		ratings: 100,
		simultaneousRatings: 15,
		newAnswers: 3,
	},
};

function hostOf(hostAndPort: string): string {
	return hostAndPort.slice(0, hostAndPort.lastIndexOf(':'));
}

/** Throws unless every endpoint is a local emulator and the project is not production. */
export function assertEmulatorOnly(env: Record<string, string | undefined>): {
	projectId: string;
} {
	const firestoreHost = env.FIRESTORE_EMULATOR_HOST;
	if (!firestoreHost) {
		throw new Error('Refusing to run: FIRESTORE_EMULATOR_HOST is not set.');
	}
	if (!LOCAL_HOSTS.includes(hostOf(firestoreHost))) {
		throw new Error(`Refusing to run: FIRESTORE_EMULATOR_HOST is not local (${firestoreHost}).`);
	}
	if (!firestoreHost.endsWith(`:${SOLO_FIRESTORE_PORT}`)) {
		throw new Error(`Refusing to run: expected the solo suite on port ${SOLO_FIRESTORE_PORT}.`);
	}
	const authHost = env.FIREBASE_AUTH_EMULATOR_HOST;
	if (!authHost || !LOCAL_HOSTS.includes(hostOf(authHost))) {
		throw new Error('Refusing to run: FIREBASE_AUTH_EMULATOR_HOST must be a local emulator.');
	}
	const projectId = env.AGORA_PROJECT_ID ?? env.GCLOUD_PROJECT ?? EXPECTED_PROJECT_ID;
	if ((PRODUCTION_PROJECT_IDS as readonly string[]).includes(projectId)) {
		throw new Error(`Refusing to run against production project ${projectId}.`);
	}
	if (projectId !== EXPECTED_PROJECT_ID) {
		throw new Error(`Refusing to run: expected project ${EXPECTED_PROJECT_ID}, got ${projectId}.`);
	}

	return { projectId };
}

export function configFromArgs(argv: string[]): ScaleConfig {
	const args = new Map<string, string>();
	for (const arg of argv) {
		const match = /^--([a-z-]+)=(.*)$/.exec(arg);
		if (match) args.set(match[1], match[2]);
	}
	const size = args.get('size') ?? 'full';
	if (size !== 'full' && size !== 'small') throw new Error(`Unknown --size=${size}`);
	const base = size === 'small' ? SMALL_CONFIG : FULL_CONFIG;

	return { ...base, label: args.get('label') ?? size };
}
