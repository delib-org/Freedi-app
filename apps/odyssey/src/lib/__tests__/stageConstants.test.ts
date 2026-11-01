import { describe, expect, it } from 'vitest';
import { mirrorSign, mirrorX, myShipLabel } from '../stageConstants';
import { setLang } from '../../i18n/i18n';
import he from '../../i18n/locales/he';

describe('mirrorX', () => {
	it('leaves a right-to-left stage as composed', () => {
		expect(mirrorX(100, 1280, 'rtl')).toBe(100);
		expect(mirrorX(0, 1280, 'rtl')).toBe(0);
	});

	it('mirrors across the stage for a left-to-right reader', () => {
		expect(mirrorX(100, 1280, 'ltr')).toBe(1180);
		expect(mirrorX(0, 1280, 'ltr')).toBe(1280);
		expect(mirrorX(640, 1280, 'ltr')).toBe(640);
	});

	it('reads the current language when no direction is given', async () => {
		await setLang('he', false);
		expect(mirrorX(100, 1000)).toBe(100);
		expect(mirrorSign()).toBe(1);
		// the chunk is only loaded in a browser; an empty dictionary is enough here
		await setLang('en', false);
		expect(mirrorX(100, 1000)).toBe(900);
		expect(mirrorSign()).toBe(-1);
		await setLang('ar', false);
		expect(mirrorX(100, 1000)).toBe(100);
		await setLang('he', false);
	});
});

describe('myShipLabel', () => {
	it('is read at call time, in the current language', async () => {
		await setLang('he', false);
		expect(myShipLabel()).toBe(he['stage.myShip']);
	});
});
