// Lesson status phase of e2e-entry.mjs (IA 13.6): the lesson language on the
// plan screen, pause / resume, the end choice (end, keep open), reopen, and what
// the student phone and the projector show at each status. Runs against the
// real engine (classSetLessonStatus) and the real rules.

/** A different side every time: an unchanged value is not a change, so the rules would not see it. */
let nextSide = 10;
const STATE_TIMEOUT = 20000;

export async function runStatusPhase({ check, teacher, student, mid, db, base, timeout, waitFor }) {
	const plan = async () => (await db.doc(`statements/${mid}`).get()).data()?.statementSettings?.lessonPlan;
	const main = async () => (await db.doc(`statements/${mid}`).get()).data();
	const statusIs = async (status) =>
		(await waitFor(plan, (p) => p?.status === status, timeout))?.status === status;

	// The student joins the lesson, so there is a subscription to write a side to.
	await student.evaluate(async (id) => {
		const mod = await import('/src/lib/classroom/studentWrites.ts');
		await mod.ensureMemberSubscription(id);
	}, mid);

	// A student write: resolves 'ok' or the error code. Goes through the page's own Firestore.
	const studentWrite = () =>
		student.evaluate(
			async ([id, side]) => {
				const mod = await import('/src/lib/classroom/studentWrites.ts');
				try {
					await mod.setMySide(id, side);

					return 'ok';
				} catch (err) {
					return err && typeof err === 'object' && 'code' in err ? String(err.code) : 'error';
				}
			},
			[mid, (nextSide += 7)],
		);

	// The teacher calling a table callable through the app's own client.
	const teacherAllTablesTo = () =>
		teacher.evaluate(async (id) => {
			const mod = await import('/src/lib/classroom/api.ts');
			try {
				await mod.classAllTablesTo({ mainId: id, step: 'rate' });

				return 'ok';
			} catch (err) {
				return err && typeof err === 'object' && 'code' in err ? String(err.code) : 'error';
			}
		}, mid);

	// ---- lesson language (plan screen) -------------------------------------------
	await teacher.goto(`${base}/t/${mid}/plan`, { waitUntil: 'domcontentloaded' });
	await teacher.waitForSelector('#lesson-language', { timeout });
	check(
		'the lesson language is the first field of "lesson details"',
		await teacher.evaluate(() => document.querySelector('.plan-details .plan-card__main')?.firstElementChild?.querySelector('#lesson-language') !== null),
	);
	check('its label is "שפת השיעור"', (await teacher.locator('label[for=lesson-language]').innerText()) === 'שפת השיעור');
	check('a new lesson carries the teacher\'s language (Hebrew)', (await teacher.inputValue('#lesson-language')) === 'he');
	await teacher.selectOption('#lesson-language', 'ar');
	check(
		'choosing a language saves it as defaultLanguage + forceLanguage',
		(await waitFor(main, (d) => d?.defaultLanguage === 'ar', timeout))?.forceLanguage === true,
	);
	await student.waitForFunction(() => document.documentElement.lang === 'ar', null, { timeout });
	check('the student phone follows the lesson language', true);
	check('the teacher\'s own plan screen stays in the teacher\'s language', (await teacher.evaluate(() => document.documentElement.lang)) === 'he');
	await teacher.selectOption('#lesson-language', '');
	const unset = await waitFor(main, (d) => d?.defaultLanguage === undefined && d?.forceLanguage === false, timeout);
	check('"each student\'s own language" unsets it', unset?.defaultLanguage === undefined && unset?.forceLanguage === false);
	await teacher.selectOption('#lesson-language', 'he');
	await waitFor(main, (d) => d?.defaultLanguage === 'he', timeout);
	await student.waitForFunction(() => document.documentElement.lang === 'he', null, { timeout });

	// ---- projector (own window) --------------------------------------------------
	const screen = await teacher.context().newPage();
	await screen.setViewportSize({ width: 1920, height: 1080 });
	await screen.goto(`${base}/t/${mid}/screen`, { waitUntil: 'domcontentloaded' });
	await screen.waitForSelector('.projector-band', { timeout });

	// ---- pause --------------------------------------------------------------------
	await teacher.goto(`${base}/t/${mid}`, { waitUntil: 'domcontentloaded' });
	await teacher.waitForSelector('[data-testid=console-pause]', { timeout });
	check('live console: pause and end are in the bar, no banner', (await teacher.locator('.console__status button').count()) === 2 && (await teacher.locator('.lesson-banner').count()) === 0);
	check('exactly one primary control in the rail (the forward control)', (await teacher.locator('.step-rail .btn--primary').count()) === 1);
	check('writes are allowed while live', (await studentWrite()) === 'ok');

	await teacher.click('[data-testid=console-pause]');
	await teacher.waitForSelector('.lesson-banner--paused', { timeout });
	check('pausing writes status paused with pausedAt', (await statusIs('paused')) && typeof (await plan())?.pausedAt === 'number');
	check('the paused banner says "השיעור בהפסקה"', (await teacher.locator('.lesson-banner__text').innerText()).trim() === 'השיעור בהפסקה');
	check('"המשך השיעור" is the one primary control and has focus', (await teacher.locator('[data-testid=console-resume]').innerText()) === 'המשך השיעור' && (await teacher.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'console-resume');
	check('the status group is empty while paused', (await teacher.locator('.console__status').count()) === 0);
	check('the step rail is held and every step is disabled', (await teacher.locator('.step-rail--held').count()) === 1 && (await teacher.locator('.step-rail__step:not(:disabled)').count()) === 0);
	check('the forward control is disabled while paused', await teacher.locator('[data-testid=console-forward]').isDisabled());
	check('the rail status line reads "השיעור בהפסקה"', (await teacher.locator('.step-rail__status span').first().innerText()) === 'השיעור בהפסקה');
	check('a table callable refuses while paused (failed-precondition)', (await teacherAllTablesTo()) === 'functions/failed-precondition');
	await student.waitForSelector('.lesson-state--paused', { timeout });
	check('the student sees "השיעור בהפסקה" + "חכו למורה"', (await student.locator('.lesson-state__title').innerText()) === 'השיעור בהפסקה' && (await student.locator('.lesson-state__body').innerText()) === 'חכו למורה');
	check('the paused student screen has no controls', (await student.locator('.lesson-state button, .frame__action button').count()) === 0);
	check('a student write is refused by the rules while paused', (await studentWrite()) === 'permission-denied');
	await screen.waitForSelector('.projector-step--paused', { timeout });
	check('the projector shows the title and the code while paused', (await screen.locator('.projector-instruction').innerText()) === 'השיעור בהפסקה' && /^\d{6}$/.test((await screen.locator('.projector-code').innerText()).trim()));
	check('the paused projector code is 160 px', Math.round(await screen.locator('.projector-code').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) === 160);

	// ---- resume -------------------------------------------------------------------
	await teacher.click('[data-testid=console-resume]');
	check('resume returns the lesson to live and clears pausedAt', (await statusIs('live')) && (await plan())?.pausedAt === undefined);
	await teacher.waitForSelector('[data-testid=console-pause]', { timeout });
	await student.waitForFunction(() => document.querySelector('.lesson-state') === null, null, { timeout });
	check('the student is back on the lesson step', true);
	check('a student write works again after resume', (await studentWrite()) === 'ok');
	await screen.waitForSelector('.projector-step--state', { state: 'detached', timeout });
	check('the projector returns to the step', true);

	// ---- end choice: cancel, then end ------------------------------------------------
	await teacher.click('[data-testid=console-end]');
	await teacher.waitForSelector('dialog.end-choice[open]', { timeout });
	check('"סיום השיעור" opens a native dialog titled "לסיים את השיעור?"', (await teacher.locator('.end-choice__title').innerText()) === 'לסיים את השיעור?');
	check('"סיום" is the default and has focus', (await teacher.evaluate(() => document.activeElement?.getAttribute('data-choice'))) === 'end');
	check('the keep-open option and its help line are offered', (await teacher.locator('[data-choice=keepOpen]').innerText()) === 'להשאיר פתוח לתלמידים' && (await teacher.locator('.end-choice__help').innerText()) === 'התלמידים יוכלו להמשיך לכתוב ולדרג אחרי השיעור');
	await teacher.keyboard.press('Escape');
	await teacher.waitForSelector('dialog.end-choice[open]', { state: 'detached', timeout });
	check('Escape cancels: the lesson is unchanged', ((await plan())?.status ?? 'live') === 'live');
	check('focus returns to the control that opened it', (await teacher.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'console-end');

	await teacher.click('[data-testid=console-end]');
	await teacher.waitForSelector('dialog.end-choice[open]', { timeout });
	await teacher.click('[data-choice=end]');
	await teacher.waitForURL((u) => u.pathname.startsWith('/t/plans/'), { timeout });
	check('ending (the default) goes back to the lesson\'s plan screen, where its row is', true);
	check('the status is ended with endedAt', (await statusIs('ended')) && typeof (await plan())?.endedAt === 'number');
	await teacher.waitForSelector('.teacher-home__row .status-chip--ended', { timeout });
	check('the row says "הסתיים" and offers "פתיחה מחדש"', (await teacher.locator('.status-chip--ended').first().innerText()).includes('הסתיים') && (await teacher.locator('[data-action=reopen]').first().innerText()) === 'פתיחה מחדש');
	await student.waitForSelector('.lesson-state--ended', { timeout });
	check('the student sees "השיעור הסתיים" + "תודה שהשתתפתם"', (await student.locator('.lesson-state__title').innerText()) === 'השיעור הסתיים' && (await student.locator('.lesson-state__body').innerText()) === 'תודה שהשתתפתם');
	check('a student write is refused by the rules once ended', (await studentWrite()) === 'permission-denied');
	check('a table callable refuses once ended', (await teacherAllTablesTo()) === 'functions/failed-precondition');
	await screen.waitForSelector('.projector-step--ended', { timeout });
	check('the ended projector shows no code and no QR', (await screen.locator('.projector-code, .projector-band__join, .projector-qr').count()) === 0);

	// ---- reopen -------------------------------------------------------------------
	await teacher.click('[data-action=reopen]');
	await teacher.waitForURL((u) => u.pathname === `/t/${mid}`, { timeout });
	check('reopening goes to the console at the step it ended on', (await statusIs('live')) && (await plan())?.stepIndex === 0);
	await student.waitForFunction(() => document.querySelector('.lesson-state') === null, null, { timeout: STATE_TIMEOUT });
	check('the student returns to the step on reopen', true);

	// ---- keep open ----------------------------------------------------------------
	await teacher.waitForSelector('[data-testid=console-end]', { timeout });
	await teacher.click('[data-testid=console-end]');
	await teacher.waitForSelector('dialog.end-choice[open]', { timeout });
	await teacher.click('[data-choice=keepOpen]');
	await teacher.waitForURL((u) => u.pathname.startsWith('/t/plans/'), { timeout });
	check('keeping open writes status open', await statusIs('open'));
	await teacher.waitForSelector('.teacher-home__row .status-chip--open', { timeout });
	check('the row says "פתוח לתלמידים"', (await teacher.locator('.status-chip--open').first().innerText()).includes('פתוח לתלמידים'));
	check('an open lesson shows students the step, not a state screen', (await student.locator('.lesson-state').count()) === 0);
	check('students can still write while the lesson is open', (await studentWrite()) === 'ok');

	await teacher.goto(`${base}/t/${mid}`, { waitUntil: 'domcontentloaded' });
	await teacher.waitForSelector('.lesson-banner--open', { timeout });
	check('the console shows "השיעור פתוח לתלמידים" with "סיום השיעור"', (await teacher.locator('.lesson-banner__text').innerText()).trim() === 'השיעור פתוח לתלמידים' && (await teacher.locator('[data-testid=console-end-open]').innerText()) === 'סיום השיעור');
	check('the rail is fully enabled on an open lesson', (await teacher.locator('.step-rail--held').count()) === 0);
	await teacher.click('[data-testid=console-end-open]');
	await teacher.waitForSelector('dialog.end-choice[open]', { timeout });
	check('an already open lesson offers only "סיום"', (await teacher.locator('[data-choice=keepOpen]').count()) === 0 && (await teacher.locator('[data-choice=end]').count()) === 1);
	await teacher.keyboard.press('Escape');
	await teacher.waitForSelector('dialog.end-choice[open]', { state: 'detached', timeout });

	await teacher.click('[data-testid=console-forward]');
	check('moving a step on an open lesson makes it live again', (await statusIs('live')) && (await plan())?.stepIndex === 1);
	await teacher.waitForSelector('.lesson-banner--open', { state: 'detached', timeout });
	check('the open banner is gone once the lesson is live', true);

	await screen.close();
}
