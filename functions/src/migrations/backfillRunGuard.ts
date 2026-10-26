/**
 * Safety gate for backfill scripts that write: dry run unless `--execute`,
 * and a production project additionally needs `--confirm-prod`.
 */

/** Firebase projects that hold real participants' data. */
export const PROD_PROJECT_IDS: readonly string[] = ['synthesistalyaron', 'wizcol-app'];

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
	const isProd = PROD_PROJECT_IDS.includes(project) && !emulatorHost;
	if (execute && isProd && !argv.includes('--confirm-prod')) {
		return {
			ok: false,
			reason: `Refusing to write to production project "${project}" without --confirm-prod.`,
		};
	}

	return { ok: true, project, execute };
}
