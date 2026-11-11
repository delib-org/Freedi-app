import { checkBackfillRun, databaseProjectRefusal, resolveProjectEnv } from '../backfillRunGuard';

describe('checkBackfillRun on projects it does not know', () => {
	const unknown = { project: 'some-other-project', emulatorHost: undefined };

	it('refuses to write without --confirm-prod', () => {
		expect(checkBackfillRun({ ...unknown, argv: ['--execute'] }).ok).toBe(false);
	});

	it('writes with --confirm-prod', () => {
		expect(checkBackfillRun({ ...unknown, argv: ['--execute', '--confirm-prod'] }).ok).toBe(true);
	});

	it('still allows a dry run', () => {
		expect(checkBackfillRun({ ...unknown, argv: [] })).toEqual({
			ok: true,
			project: 'some-other-project',
			execute: false,
		});
	});

	it('needs no confirmation on the emulator', () => {
		expect(
			checkBackfillRun({ ...unknown, emulatorHost: '127.0.0.1:8101', argv: ['--execute'] }).ok,
		).toBe(true);
	});

	it('treats an empty emulator host as a real project', () => {
		expect(checkBackfillRun({ ...unknown, emulatorHost: '', argv: ['--execute'] }).ok).toBe(false);
	});

	it('needs no confirmation on an allowlisted test project', () => {
		expect(
			checkBackfillRun({ project: 'freedi-test', emulatorHost: undefined, argv: ['--execute'] }).ok,
		).toBe(true);
	});

	it.each(['wizcol-app', 'synthesistalyaron'])('still protects %s', (project) => {
		expect(checkBackfillRun({ project, emulatorHost: undefined, argv: ['--execute'] }).ok).toBe(
			false,
		);
	});
});

describe('resolveProjectEnv', () => {
	it('refuses two different projects', () => {
		const result = resolveProjectEnv({
			GOOGLE_CLOUD_PROJECT: 'wizcol-app',
			GCLOUD_PROJECT: 'freedi-test',
		});

		expect(result.ok).toBe(false);
	});

	it('accepts the same project in both', () => {
		expect(
			resolveProjectEnv({ GOOGLE_CLOUD_PROJECT: 'freedi-test', GCLOUD_PROJECT: 'freedi-test' }),
		).toEqual({ ok: true, project: 'freedi-test' });
	});

	it('reads whichever one is set', () => {
		expect(resolveProjectEnv({ GOOGLE_CLOUD_PROJECT: 'wizcol-app' })).toEqual({
			ok: true,
			project: 'wizcol-app',
		});
		expect(resolveProjectEnv({ GCLOUD_PROJECT: 'freedi-test' })).toEqual({
			ok: true,
			project: 'freedi-test',
		});
	});

	it('reports no project when neither is set', () => {
		expect(resolveProjectEnv({ GCLOUD_PROJECT: '  ' })).toEqual({ ok: true, project: undefined });
	});

	it('sends a production project set only in the preferred variable to the production rule', () => {
		const resolved = resolveProjectEnv({ GOOGLE_CLOUD_PROJECT: 'wizcol-app' });
		const project = resolved.ok ? resolved.project : undefined;

		expect(checkBackfillRun({ project, emulatorHost: undefined, argv: ['--execute'] }).ok).toBe(
			false,
		);
	});
});

describe('databaseProjectRefusal', () => {
	it('passes when the database is the checked project', () => {
		expect(databaseProjectRefusal('freedi-test', 'freedi-test')).toBeUndefined();
	});

	it('refuses when the database is a different project', () => {
		expect(databaseProjectRefusal('wizcol-app', 'freedi-test')).toContain('wizcol-app');
	});
});
