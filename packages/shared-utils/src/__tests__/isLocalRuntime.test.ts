import { isLocalRuntime } from '../isLocalRuntime';

/**
 * The two failure modes pull in opposite directions: a false negative puts a
 * laptop's errors in the production project, a false positive silently blinds
 * production. Both directions are pinned here.
 */
describe('isLocalRuntime', () => {
	// Held separately: the browser cases blank out globalThis.process, which is
	// the very binding the bare `process` identifier resolves to.
	const realProcess = process;
	const savedEnv = { ...realProcess.env };
	const globals = globalThis as { location?: unknown; process?: unknown };
	const savedLocation = globals.location;

	/** A browser page at `host`, with no process.env in reach. */
	function inBrowser(host: string): void {
		globals.location = { hostname: host };
		globals.process = undefined;
	}

	/**
	 * A Node process with exactly these variables set. Asserted to the env's own
	 * type because Next's ambient ProcessEnv declares NODE_ENV as required, and
	 * some of these cases are precisely "NODE_ENV is not set".
	 */
	function inNode(vars: Record<string, string>): void {
		globals.location = undefined;
		globals.process = realProcess;
		realProcess.env = { ...vars } as typeof realProcess.env;
	}

	afterEach(() => {
		globals.location = savedLocation;
		globals.process = realProcess;
		realProcess.env = { ...savedEnv };
	});

	describe('in a browser', () => {
		it.each([
			'localhost',
			'127.0.0.1',
			'0.0.0.0',
			'::1',
			'[::1]',
			'Tals-Mac-mini.local',
			'app.localhost',
		])('treats %s as local', (host) => {
			inBrowser(host);
			expect(isLocalRuntime()).toBe(true);
		});

		it.each(['freedi.app', 'wizcol-od.web.app', 'mc.wizcol.com', 'localhost.attacker.com'])(
			'treats %s as deployed',
			(host) => {
				inBrowser(host);
				expect(isLocalRuntime()).toBe(false);
			},
		);

		it('reports anyway when the app forwards an explicit override', () => {
			inBrowser('localhost');
			expect(isLocalRuntime(true)).toBe(false);
		});
	});

	describe('in Node', () => {
		it('treats a Firebase emulator as local, deployment marker or not', () => {
			inNode({ K_SERVICE: 'someFunction', FUNCTIONS_EMULATOR: 'true' });
			expect(isLocalRuntime()).toBe(true);

			inNode({ K_SERVICE: 'someFunction', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081' });
			expect(isLocalRuntime()).toBe(true);
		});

		it('treats a development or test NODE_ENV as local', () => {
			inNode({ K_SERVICE: 'someFunction', NODE_ENV: 'development' });
			expect(isLocalRuntime()).toBe(true);

			inNode({ K_SERVICE: 'someFunction', NODE_ENV: 'test' });
			expect(isLocalRuntime()).toBe(true);
		});

		it('treats a process with no deployment marker as local', () => {
			inNode({ NODE_ENV: 'production' });
			expect(isLocalRuntime()).toBe(true);
		});

		it.each([['K_SERVICE'], ['FUNCTION_TARGET'], ['FUNCTION_NAME'], ['VERCEL']])(
			'treats a process marked by %s as deployed',
			(marker) => {
				inNode({ [marker]: '1', NODE_ENV: 'production' });
				expect(isLocalRuntime()).toBe(false);
			},
		);

		it('honours SENTRY_ENABLE_IN_LOCAL', () => {
			inNode({ FUNCTIONS_EMULATOR: 'true', SENTRY_ENABLE_IN_LOCAL: 'true' });
			expect(isLocalRuntime()).toBe(false);
		});
	});
});
