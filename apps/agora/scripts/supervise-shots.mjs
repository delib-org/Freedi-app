/* Local-only fixture + responsive browser verification. Run with the isolated AGORA_* hosts. */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { callable, db, signInTeacher } from './lib/fastlane.ts';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const {
	emptyClassAggregate,
	mergeClassGame,
	emptyStudentAggregate,
	mergeStudentGame,
	emptyTeacherAggregate,
	mergeTeacherLesson,
	emptyAgoraPoints,
	createAgoraClassMemberId,
	creditHeartbeat,
	dayKeyOf,
} = require('@freedi/shared-types');
await preflight();
// A chart's first paint uses a default width until its size observer fires; let that frame land
const SETTLE_MS = 400;
const out = process.env.SUPERVISION_SHOTS ?? '/private/tmp/supervision-shots';
mkdirSync(out, { recursive: true });
async function seedFixture() {
	const runId = `visual-${Date.now()}`,
		sub = `${runId}-teacher`,
		adminSub = `${runId}-admin`,
		supSub = `${runId}-sup`;
	const teacher = await signInTeacher(sub),
		admin = await signInTeacher(adminSub),
		sup = await signInTeacher(supSub);
	for (const [u, s] of [
		[teacher, sub],
		[admin, adminSub],
		[sup, supSub],
	])
		await db
			.collection('usersV2')
			.doc(u.uid)
			.set(
				{
					systemAdmin: u === admin,
					displayName: u === teacher ? 'דנה / Dana' : 'Supervisor',
					email: `${s}@example.com`,
				},
				{ merge: true },
			);
	const { schoolId } = await callable(
		'agoraAdminManageSchool',
		{ action: 'create', name: 'בית ספר לדוגמה / Example school' },
		admin.idToken,
	);
	await callable(
		'agoraAdminManageSchool',
		{ action: 'assignTeacher', schoolId, teacherEmail: `${sub}@example.com` },
		admin.idToken,
	);
	await callable(
		'agoraAdminManageSchool',
		{ action: 'assignSupervisor', schoolId, supervisorEmail: `${supSub}@example.com` },
		admin.idToken,
	);
	const { classId } = await callable(
		'agoraAdminOpenClass',
		{
			action: 'create',
			schoolId,
			name: 'ז׳ 2 / Year 7',
			gradeLevel: '7',
			teacherEmail: `${sub}@example.com`,
		},
		admin.idToken,
	);
	const now = Date.now();
	let agg = emptyClassAggregate(classId, schoolId),
		ta = emptyTeacherAggregate(teacher.uid),
		usage;
	const names = ['Olive', 'Sky', 'River', 'Sun'],
		careers = names.map((_, i) => emptyStudentAggregate(`${runId}-m${i}`, classId, schoolId));
	for (let i = 0; i < 12; i++) {
		const playedAt = now - (13 - i) * 86400000,
			row = {
				sessionId: `${runId}-${i}`,
				topicPackageId: 'demo',
				playedAt,
				participantCount: 3 + (i % 2),
				classScoreTotal: 40 + i * 4,
				outcome: i % 4 === 0 ? 'honestDisagreement' : 'success',
			};
		agg = mergeClassGame(agg, row, now);
		ta = mergeTeacherLesson(
			ta,
			{ ...row, classId, schoolId, startedAt: playedAt - 1800000, durationMs: 1800000 },
			now,
		);
		for (let n = 0; n < 4; n++) {
			const points = {
				...emptyAgoraPoints(),
				proposals: (i + 1) * (n + 1),
				helping: n + 2,
				rating: 4,
				revising: 2,
				appreciation: 1,
			};
			points.total =
				points.proposals + points.helping + points.rating + points.revising + points.appreciation;
			careers[n] = mergeStudentGame(careers[n], { ...row, classId, points }, now);
		}
		usage = creditHeartbeat(usage, {
			teacherId: teacher.uid,
			surface: 'home',
			now: playedAt,
			sinceMs: 300000,
		}).next;
		await db
			.collection('agoraStats')
			.doc(dayKeyOf(playedAt))
			.set(
				{
					periodType: 'day',
					periodKey: dayKeyOf(playedAt),
					gamesFinished: 1,
					studentsReached: 4,
					classesPlayed: 1,
					byOutcome: { success: 1 },
				},
				{ merge: true },
			);
	}
	await db.collection('agoraClasses').doc(classId).update({ memberCount: 4 });
	await db.collection('agoraClassAggregates').doc(classId).set(agg);
	await db.collection('agoraTeacherAggregates').doc(teacher.uid).set(ta);
	await db.collection('agoraTeacherUsage').doc(`${teacher.uid}--${usage.month}`).set(usage);
	for (let i = 0; i < 4; i++) {
		const memberId = careers[i].memberId;
		await db.collection('agoraStudentAggregates').doc(memberId).set(careers[i]);
		await db
			.collection('agoraClassMembers')
			.doc(createAgoraClassMemberId(classId, memberId))
			.set({
				memberId,
				classId,
				alias: names[i],
				joinedAt: now - 30 * 86400000,
				lastActive: now,
				status: 'active',
				boundUid: `anon-${i}`,
				uidHistory: [],
				rejoinPinHash: 'private-secret',
			});
	}
	return {
		schoolId,
		classId,
		teacherUid: teacher.uid,
		sub,
		adminSub,
		supSub,
		memberId: careers[0].memberId,
	};
}
const fixture = process.env.SUPERVISION_REUSE
	? JSON.parse(readFileSync(`${out}/fixture.json`, 'utf8'))
	: await seedFixture();
writeFileSync(`${out}/fixture.json`, JSON.stringify(fixture));
const { schoolId, classId, teacherUid, sub, supSub } = fixture;
const teacher = { uid: teacherUid },
	careers = [{ memberId: fixture.memberId }];
const browser = await chromium.launch({ headless: true }),
	errors = [];
try {
	for (const lang of ['he', 'en'])
		for (const width of [1280, 390]) {
			const ctx = await browser.newContext({ viewport: { width, height: 900 } }),
				page = await ctx.newPage();
			page.on('pageerror', (e) => {
				errors.push(e.message);
				console.error(e.message);
			});
			page.on('console', (m) => {
				if (m.type() === 'error') {
					console.error(m.text());
					if (/TypeError|RangeError|ReferenceError|fragments/.test(m.text())) errors.push(m.text());
				}
			});
			await page.addInitScript((l) => {
				if (location.protocol !== 'about:') localStorage.setItem('agora_lang', l);
			}, lang);
			await page.goto(`${VITE_HOST}/#!/teach`);
			await page.waitForFunction(() => typeof window.__agoraDevSignIn === 'function');
			await page.evaluate(
				(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com` }),
				sub,
			);
			await page.goto(`${VITE_HOST}/#!/teach/class/${classId}`);
			await page.locator('.roster__graphs-toggle').click();
			await page.locator('.chart__hit').first().waitFor();
			await page.locator('.chart__hit').first().focus();
			await page.locator('.chart__tip').first().waitFor();
			await page.keyboard.press('Escape');
			await page.locator('.chart__tip').first().waitFor({ state: 'hidden' });
			await page.waitForTimeout(SETTLE_MS);
				await page.screenshot({
				path: `${out}/agora-${lang}-${width}-teacher-class.png`,
				fullPage: true,
			});
			await page.locator('.chart button').first().click();
			await page.locator('.chart--table table').first().waitFor({ state: 'visible' });
			await page.locator('.chart button').first().click();
			await page.locator('.roster__row').first().click();
			await page.locator('.roster__drawer .chart__svg').first().waitFor();
			await page.waitForTimeout(SETTLE_MS);
				await page.screenshot({ path: `${out}/agora-${lang}-${width}-drawer.png`, fullPage: true });
			await page.evaluate(
				(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com` }),
				supSub,
			);
			for (const [name, path] of [
				['home', '/supervise'],
				['teacher', `/supervise/teacher/${encodeURIComponent(schoolId)}/${encodeURIComponent(teacher.uid)}`],
				['class', `/supervise/class/${classId}`],
				['student', `/supervise/student/${careers[0].memberId}`],
			]) {
				await page.goto('about:blank');
				await page.goto(`${VITE_HOST}/#!${path}`);
				await page.locator('.indicator-grid').first().waitFor({ timeout: 30000 });
				await page.waitForTimeout(SETTLE_MS);
				await page.screenshot({
					path: `${out}/agora-${lang}-${width}-${name}.png`,
					fullPage: true,
				});
				assert.equal(
					await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
					false,
					`${name}: viewport overflow`,
				);
			}
			await page.goto(`${VITE_HOST}/#!/teach/activity`);
			await page.locator('.indicator-grid').waitFor();
			await page.evaluate(
				(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com` }),
				fixture.adminSub,
			);
			await page.goto('about:blank');
			await page.goto(`${VITE_HOST}/#!/supervise`);
			await page.locator('select.supervise__select').selectOption('__all__');
			await page.locator('.indicator-grid').first().waitFor();
			await page.waitForTimeout(SETTLE_MS);
				await page.screenshot({ path: `${out}/agora-${lang}-${width}-system.png`, fullPage: true });
			await page.evaluate(
				(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com` }),
				sub,
			);
			await page.goto('about:blank');
			await page.goto(`${VITE_HOST}/#!/supervise`);
			// The plain teacher lands on the "you supervise nothing" notice
			await page.locator('p.supervise__notice').first().waitFor();
			assert.equal(await page.locator('.indicator-grid').count(), 0);
			await ctx.close();
		}
	assert.deepEqual(errors, []);
	console.info('Browser verification passed; screenshots:', out);
} finally {
	await browser.close();
}
