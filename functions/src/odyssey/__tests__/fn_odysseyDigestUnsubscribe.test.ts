import { Collections } from '@freedi/shared-types';
import { createFakeDb, type FakeDb } from '../../organizations/__tests__/fakeFirestore';

const fakeDb: FakeDb = createFakeDb();

jest.mock('firebase-functions/v2/https', () => ({
	onRequest: (_opts: unknown, handler: unknown) => handler,
}));
jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => fakeDb,
}));

import { odysseyDigestUnsubscribe, odysseyUnsubscribeToken } from '../fn_odysseyDigestUnsubscribe';

type Handler = (req: unknown, res: unknown) => Promise<void>;
const unsubscribe = odysseyDigestUnsubscribe as unknown as Handler;

const USER = 'user-1';

function respond() {
	const res = {
		statusCode: 200,
		body: '',
		status(code: number) {
			this.statusCode = code;

			return this;
		},
		send(body: string) {
			this.body = body;
		},
	};

	return res;
}

async function visit(query: Record<string, string>, method = 'GET') {
	const res = respond();
	await unsubscribe({ query, method }, res);

	return res;
}

describe('odysseyDigestUnsubscribe', () => {
	beforeEach(() => {
		fakeDb.reset();
	});

	it('confirms in Hebrew, right to left, when the link carries no language', async () => {
		const res = await visit({ userId: USER, t: odysseyUnsubscribeToken(USER) });

		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('<html dir="rtl" lang="he">');
		expect(res.body).toContain('⛵ אודיסיאה ישראלית');
		expect(res.body).toContain('הוסרתם מרשימת התפוצה של סיפור המסע. מחכים לכם בים 🌊');
		expect(fakeDb.read(Collections.notificationSettings, USER)).toMatchObject({
			odysseyDigest: { enabled: false },
		});
	});

	it('confirms in English, left to right, when the digest link says so', async () => {
		const res = await visit({ userId: USER, t: odysseyUnsubscribeToken(USER), lang: 'en' });

		expect(res.body).toContain('<html dir="ltr" lang="en">');
		expect(res.body).toContain('⛵ Israeli Odyssey');
		expect(res.body).toContain('removed from the voyage-story mailing list');
	});

	it('rejects a bad token in the asked language and ignores an unknown language', async () => {
		const res = await visit({ userId: USER, t: 'forged', lang: 'ar' });

		expect(res.statusCode).toBe(400);
		expect(res.body).toContain('<html dir="rtl" lang="ar">');
		expect(res.body).toContain('الرابط غير صالح');
		expect(fakeDb.read(Collections.notificationSettings, USER)).toBeUndefined();

		const unknown = await visit({ userId: USER, t: 'forged', lang: 'fr' });
		expect(unknown.body).toContain('lang="he"');
	});

	it('answers the one-click POST with a bare OK', async () => {
		const res = await visit({ userId: USER, t: odysseyUnsubscribeToken(USER), lang: 'en' }, 'POST');

		expect(res.body).toBe('OK');
	});
});
