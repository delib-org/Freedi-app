import { configureEmulatorEnv, DEFAULT_STORAGE_EMULATOR_HOST } from '../emulatorEnv';

function makeEnv(vars: Record<string, string>): NodeJS.ProcessEnv {
  return { ...vars } as NodeJS.ProcessEnv;
}

describe('configureEmulatorEnv', () => {
  describe('emulator mode', () => {
    it('keeps the Firestore and Auth hosts', () => {
      const env = makeEnv({
        USE_FIREBASE_EMULATOR: 'true',
        FIRESTORE_EMULATOR_HOST: 'localhost:8081',
        FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
      });

      expect(configureEmulatorEnv(env)).toBe(true);
      expect(env.FIRESTORE_EMULATOR_HOST).toBe('localhost:8081');
      expect(env.FIREBASE_AUTH_EMULATOR_HOST).toBe('localhost:9099');
    });

    it('points Storage at the emulator when no host is given', () => {
      const env = makeEnv({ USE_FIREBASE_EMULATOR: 'true' });

      configureEmulatorEnv(env);

      expect(env.FIREBASE_STORAGE_EMULATOR_HOST).toBe(DEFAULT_STORAGE_EMULATOR_HOST);
    });

    it('keeps an explicit Storage host (another emulator suite)', () => {
      const env = makeEnv({
        USE_FIREBASE_EMULATOR: 'true',
        FIREBASE_STORAGE_EMULATOR_HOST: 'localhost:9219',
      });

      configureEmulatorEnv(env);

      expect(env.FIREBASE_STORAGE_EMULATOR_HOST).toBe('localhost:9219');
    });
  });

  describe('cloud mode', () => {
    it('removes every emulator host', () => {
      const env = makeEnv({
        USE_FIREBASE_EMULATOR: 'false',
        FIRESTORE_EMULATOR_HOST: 'localhost:8081',
        FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
        FIREBASE_STORAGE_EMULATOR_HOST: 'localhost:9199',
      });

      expect(configureEmulatorEnv(env)).toBe(false);
      expect(env.FIRESTORE_EMULATOR_HOST).toBeUndefined();
      expect(env.FIREBASE_AUTH_EMULATOR_HOST).toBeUndefined();
      expect(env.FIREBASE_STORAGE_EMULATOR_HOST).toBeUndefined();
    });

    it('treats a missing flag as cloud mode and adds no Storage host', () => {
      const env = makeEnv({});

      expect(configureEmulatorEnv(env)).toBe(false);
      expect(env.FIREBASE_STORAGE_EMULATOR_HOST).toBeUndefined();
    });
  });
});
