/**
 * Safety gate for backfill scripts that write: dry run unless `--execute`, and
 * any real project outside the test allowlist additionally needs `--confirm-prod`.
 */

/** The only real projects that may be written to without `--confirm-prod`. */
export const TEST_PROJECT_IDS: readonly string[] = ['freedi-test'];

export type BackfillRunCheck =
	| { ok: true; project: string; execute: boolean }
	| { ok: false; reason: string };

export function checkBackfillRun(input: {
	project: string | undefined;
	emulatorHost: string | undefined;
	argv: readonly string[];
}): BackfillRunCheck {
	const { project, emulatorHost, argv } = input;
	if (!project) {
		return { ok: false, reason: 'Set GCLOUD_PROJECT=<project>. Add --execute to write.' };
	}
	const execute = argv.includes('--execute');
	const needsConfirmation = !emulatorHost && !TEST_PROJECT_IDS.includes(project);
	if (execute && needsConfirmation && !argv.includes('--confirm-prod')) {
		return {
			ok: false,
			reason: `Refusing to write to project "${project}" without --confirm-prod.`,
		};
	}

	return { ok: true, project, execute };
}

export type ProjectEnvResolution =
	| { ok: true; project: string | undefined }
	| { ok: false; reason: string };

/**
 * The project the Admin SDK will use: it prefers GOOGLE_CLOUD_PROJECT, so a
 * guard reading only GCLOUD_PROJECT can approve one project and write to another.
 */
export function resolveProjectEnv(env: {
	GCLOUD_PROJECT?: string;
	GOOGLE_CLOUD_PROJECT?: string;
}): ProjectEnvResolution {
	const gcloud = env.GCLOUD_PROJECT?.trim();
	const google = env.GOOGLE_CLOUD_PROJECT?.trim();
	if (gcloud && google && gcloud !== google) {
		return {
			ok: false,
			reason: `GOOGLE_CLOUD_PROJECT ("${google}") and GCLOUD_PROJECT ("${gcloud}") differ. Set one project.`,
		};
	}

	return { ok: true, project: google || gcloud || undefined };
}

/** Why the connected database is not the project that was checked, if it is not. */
export function databaseProjectRefusal(
	databaseProject: string,
	checkedProject: string,
): string | undefined {
	if (databaseProject === checkedProject) return undefined;

	return `Connected to project "${databaseProject}" but the checks passed for "${checkedProject}".`;
}
