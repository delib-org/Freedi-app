import { browserPopupRedirectResolver, type Auth } from 'firebase/auth';
import { popupResolver, warmPopupResolver } from '../popupResolver';

type Constructible = new () => object;
type WithInitialize = { _initialize: (auth: Auth) => Promise<unknown> };

const fakeAuth = {} as Auth;
const BrowserResolver = browserPopupRedirectResolver as unknown as Constructible;

describe('popupResolver', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('constructs the same instance every time, as Firebase caches it', () => {
		const Resolver = popupResolver as unknown as Constructible;

		expect(new Resolver()).toBe(new Resolver());
	});

	it('passes Firebase instance checks for both classes', () => {
		const Resolver = popupResolver as unknown as Constructible;
		const instance = new Resolver();

		expect(instance).toBeInstanceOf(Resolver);
		expect(instance).toBeInstanceOf(BrowserResolver);
	});

	it('warms the very instance that signInWithPopup will use, once', async () => {
		const initialize = jest
			.spyOn(BrowserResolver.prototype as WithInitialize, '_initialize')
			.mockResolvedValue(undefined);
		const Resolver = popupResolver as unknown as Constructible;

		await warmPopupResolver(fakeAuth);
		await warmPopupResolver(fakeAuth);

		expect(initialize).toHaveBeenCalledTimes(1);
		expect(initialize.mock.contexts[0]).toBe(new Resolver());
		expect(initialize).toHaveBeenCalledWith(fakeAuth);
	});
});
