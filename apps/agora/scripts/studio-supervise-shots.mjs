/** Studio browser regression using supervise-shots.mjs emulator fixtures. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const out = process.env.SUPERVISION_SHOTS ?? '/private/tmp/supervision-shots';
const base = process.env.STUDIO_VITE_HOST ?? 'http://localhost:3048';
const f = JSON.parse(readFileSync(`${out}/fixture.json`, 'utf8'));
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
	for (const lang of ['en', 'he'])
		for (const width of [1280, 390]) {
			const context = await browser.newContext({ viewport: { width, height: 900 } });
			const page = await context.newPage();
			page.on('pageerror', (e) => errors.push(e.message));
			await page.addInitScript((lang) => localStorage.setItem('studio-language', lang), lang);
			await page.goto(base);
			await page.evaluate(async (sub) => {
				const { auth } = await import('/src/firebase.ts');
				const { GoogleAuthProvider, signInWithCredential } = await import(
					'/node_modules/.vite/deps/firebase_auth.js'
				);
				await signInWithCredential(
					auth,
					GoogleAuthProvider.credential(
						JSON.stringify({ sub, email: `${sub}@example.com`, email_verified: true }),
					),
				);
			}, f.adminSub);
			for (const [name, path] of [
				['system', '/admin/agora'],
				['school', `/admin/agora/schools/${f.schoolId}`],
				['teacher', `/admin/agora/teachers/${f.schoolId}/${f.teacherUid}`],
				['class', `/admin/agora/classes/${f.classId}`],
				['student', `/admin/agora/students/${f.memberId}`],
			]) {
				await page.goto(`${base}${path}`);
				await page.locator('.chart__svg').first().waitFor({ timeout: 30000 });
				await page.locator('.chart__hit').first().focus();
				await page.locator('.chart__tip').first().waitFor();
				await page.keyboard.press('Escape');
				await page.locator('.chart__tip').first().waitFor({ state: 'hidden' });
				await page.locator('.chart button').first().click();
				await page.locator('.chart--table table').first().waitFor({ state: 'visible' });
				await page.locator('.chart button').first().click();
				await page.screenshot({
					path: `${out}/studio-${lang}-${width}-${name}.png`,
					fullPage: true,
				});
				assert.equal(
					await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
					false,
					`${lang} ${width} ${name}: overflow`,
				);
			}
			await page.emulateMedia({ colorScheme: 'dark' });
			assert.equal(
				await page.evaluate(() =>
					getComputedStyle(document.documentElement).getPropertyValue('--chart-1').trim(),
				),
				'#3f8fd6',
			);
			await page.screenshot({ path: `${out}/studio-${lang}-${width}-dark.png`, fullPage: true });
			await context.close();
		}
	assert.deepEqual(errors, []);
	console.info('Studio browser checks passed.');
} finally {
	await browser.close();
}
