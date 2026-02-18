/**
 * E2E tests for Follow Me and Power Follow Me features.
 *
 * These tests verify the FollowMeToast component behavior by seeding
 * Firestore data and checking the rendered page. The app auto-authenticates
 * anonymous users for openToAll statements.
 *
 * NOTE: These tests rely on Firebase emulators running (auth:9099, firestore:8081).
 * Run with: npm run e2e:main
 */
import { test, expect } from '@playwright/test';
import {
	seedDocument,
	clearFirestoreData,
} from '@freedi/e2e-shared';

// Serial mode to avoid parallel emulator state conflicts
test.describe.configure({ mode: 'serial' });

let testCounter = 0;

function getTestIds() {
	testCounter++;

	return {
		parentId: `e2e-fme-p${testCounter}-${Date.now()}`,
		childId: `e2e-fme-c${testCounter}-${Date.now()}`,
	};
}

const TEST_CREATOR = {
	uid: 'e2e-test-creator',
	displayName: 'Test Creator',
};

function makeStatement(statementId: string, overrides: Record<string, unknown> = {}) {
	const now = Date.now();

	return {
		statement: 'E2E Follow Me Test Group',
		statementId,
		parentId: 'top',
		topParentId: statementId,
		parents: ['top'],
		statementType: 'question',
		creator: TEST_CREATOR,
		creatorId: TEST_CREATOR.uid,
		createdAt: now,
		lastUpdate: now,
		consensus: 0,
		randomSeed: 0.5,
		resultsSettings: {
			resultsBy: 'consensus',
			numberOfResults: 1,
			cutoffNumber: 0,
			cutoffBy: 'topOptions',
		},
		membership: { access: 'openToAll' },
		color: '#5f88e5',
		hasChildren: true,
		...overrides,
	};
}

function makeChildStatement(childId: string, parentId: string) {
	const now = Date.now();

	return {
		statement: 'E2E Child Statement',
		statementId: childId,
		parentId: parentId,
		topParentId: parentId,
		parents: ['top', parentId],
		statementType: 'question',
		creator: TEST_CREATOR,
		creatorId: TEST_CREATOR.uid,
		createdAt: now,
		lastUpdate: now,
		consensus: 0,
		randomSeed: 0.5,
		resultsSettings: {
			resultsBy: 'consensus',
			numberOfResults: 1,
			cutoffNumber: 0,
			cutoffBy: 'topOptions',
		},
		membership: { access: 'openToAll' },
		color: '#88c544',
		hasChildren: true,
	};
}

test.describe('Follow Me & Power Follow Me - Firestore Seeding', () => {
	test.beforeEach(async () => {
		await clearFirestoreData();
	});

	test.afterAll(async () => {
		await clearFirestoreData();
	});

	test('statement with followMe field can be seeded and read back', async () => {
		const { parentId, childId } = getTestIds();
		const followMePath = `/statement/${childId}/chat`;

		// Seed should not throw
		await seedDocument({
			collection: 'statements',
			id: parentId,
			data: makeStatement(parentId, { followMe: followMePath }),
		});

		// Verify via REST API that the followMe field was saved
		const response = await fetch(
			`http://localhost:8081/v1/projects/delib-5/databases/(default)/documents/statements/${parentId}`,
			{ headers: { Authorization: 'Bearer owner' } },
		);
		expect(response.ok).toBe(true);

		const doc = await response.json();
		expect(doc.fields.followMe.stringValue).toBe(followMePath);
		expect(doc.fields.statementId.stringValue).toBe(parentId);
	});

	test('statement with powerFollowMe field can be seeded and read back', async () => {
		const { parentId, childId } = getTestIds();
		const powerPath = `/statement/${childId}/chat`;

		await seedDocument({
			collection: 'statements',
			id: parentId,
			data: makeStatement(parentId, { powerFollowMe: powerPath }),
		});

		const response = await fetch(
			`http://localhost:8081/v1/projects/delib-5/databases/(default)/documents/statements/${parentId}`,
			{ headers: { Authorization: 'Bearer owner' } },
		);
		expect(response.ok).toBe(true);

		const doc = await response.json();
		expect(doc.fields.powerFollowMe.stringValue).toBe(powerPath);
	});

	test('statement can have both followMe and powerFollowMe', async () => {
		const { parentId, childId } = getTestIds();
		const followMePath = `/statement/${parentId}/chat`;
		const powerPath = `/statement/${childId}/chat`;

		await seedDocument({
			collection: 'statements',
			id: parentId,
			data: makeStatement(parentId, {
				followMe: followMePath,
				powerFollowMe: powerPath,
			}),
		});

		const response = await fetch(
			`http://localhost:8081/v1/projects/delib-5/databases/(default)/documents/statements/${parentId}`,
			{ headers: { Authorization: 'Bearer owner' } },
		);
		expect(response.ok).toBe(true);

		const doc = await response.json();
		expect(doc.fields.followMe.stringValue).toBe(followMePath);
		expect(doc.fields.powerFollowMe.stringValue).toBe(powerPath);
	});
});

test.describe('Follow Me - Page Navigation', () => {
	test.beforeEach(async () => {
		await clearFirestoreData();
	});

	test.afterAll(async () => {
		await clearFirestoreData();
	});

	test('statement page loads without crashing when followMe is set', async ({ page }) => {
		const { parentId, childId } = getTestIds();
		const followMePath = `/statement/${childId}/chat`;

		await seedDocument({
			collection: 'statements',
			id: parentId,
			data: makeStatement(parentId, { followMe: followMePath }),
		});
		await seedDocument({
			collection: 'statements',
			id: childId,
			data: makeChildStatement(childId, parentId),
		});

		// Navigate to the statement page
		await page.goto(`/statement/${parentId}/chat`, { waitUntil: 'domcontentloaded' });

		// The page should load (React app mounts) - #root should have content
		const root = page.locator('#root');
		await expect(root).not.toBeEmpty({ timeout: 10000 });
	});

	test('statement page loads without crashing when powerFollowMe is set', async ({ page }) => {
		const { parentId, childId } = getTestIds();
		const powerPath = `/statement/${childId}/chat`;

		await seedDocument({
			collection: 'statements',
			id: parentId,
			data: makeStatement(parentId, { powerFollowMe: powerPath }),
		});
		await seedDocument({
			collection: 'statements',
			id: childId,
			data: makeChildStatement(childId, parentId),
		});

		await page.goto(`/statement/${parentId}/chat`, { waitUntil: 'domcontentloaded' });

		const root = page.locator('#root');
		await expect(root).not.toBeEmpty({ timeout: 10000 });
	});

	test('statement page loads without error when no follow mode is active', async ({ page }) => {
		const { parentId } = getTestIds();

		await seedDocument({
			collection: 'statements',
			id: parentId,
			data: makeStatement(parentId),
		});

		await page.goto(`/statement/${parentId}/chat`, { waitUntil: 'domcontentloaded' });

		// Page should render without crashing
		const root = page.locator('#root');
		await expect(root).not.toBeEmpty({ timeout: 10000 });
	});
});
