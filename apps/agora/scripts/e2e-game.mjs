import { chromium } from '@playwright/test';

const AUTH = 'http://localhost:9099/identitytoolkit.googleapis.com/v1';
const FN = 'http://localhost:5001/freedi-test/me-west1';
const FS = 'http://localhost:8081/v1/projects/freedi-test/databases/(default)/documents';

const idpRes = await fetch(`${AUTH}/accounts:signInWithIdp?key=fake`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub: 'e2e-teacher4', email: 'e2e-t4@example.com', name: 'E2E Teacher' }))}&providerId=google.com`,
		requestUri: 'http://localhost',
		returnSecureToken: true,
	}),
});
const teacher = await idpRes.json();

const call = async (name, data, token) => {
	const res = await fetch(`${FN}/${name}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ data }),
	});
	const json = await res.json();
	if (json.error) throw new Error(`${name}: ${JSON.stringify(json.error)}`);
	return json.result;
};

const ownerFetch = (path, opts = {}) =>
	fetch(`${FS}/${path}`, {
		...opts,
		headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json', ...opts.headers },
	});

const { sessionId, code } = await call(
	'agoraCreateSession',
	{ topicPackageId: 'demo-french-revolution', deviceMode: 'individual' },
	teacher.idToken
);
console.log('SESSION', sessionId, code);

const browser = await chromium.launch();
const ctxA = await browser.newContext();
const ctxB = await browser.newContext();
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();
const errs = [];
pageA.on('pageerror', (e) => errs.push('A: ' + e.message));
pageB.on('pageerror', (e) => errs.push('B: ' + e.message));

// Both students join
for (const page of [pageA, pageB]) {
	await page.goto(`http://localhost:3009/#!/join/${code}`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.lobby__name', { timeout: 15000 });
}
console.log('BOTH JOINED');

// Camps: A=left, B=right (owner-bypass patch — late-position shortcut for the test)
const partsRes = await ownerFetch(`agoraParticipants`);
const parts = (await partsRes.json()).documents.filter(
	(d) => d.fields.sessionId.stringValue === sessionId
);
const [pA, pB] = parts;
for (const [participant, camp, pos] of [[pA, 'left', 20], [pB, 'right', 80]]) {
	await ownerFetch(
		`${participant.name.split('/documents/')[1]}?updateMask.fieldPaths=camp&updateMask.fieldPaths=campPosition`,
		{
			method: 'PATCH',
			body: JSON.stringify({
				fields: { camp: { stringValue: camp }, campPosition: { integerValue: String(pos) } },
			}),
		}
	);
}
console.log('CAMPS SET: A=left, B=right');

// Straight to deliberation + propose round
await call('agoraAdvanceStage', { sessionId, stage: 'deliberation' }, teacher.idToken);
await call('agoraSetRound', { sessionId, roundPhase: 'propose' }, teacher.idToken);

// A proposes (with AI improve)
await pageA.waitForSelector('textarea.values__textarea', { timeout: 10000 });
await pageA
	.locator('textarea.values__textarea')
	.fill('נבטל את הפטור ממס של האצולה והכנסייה, ובתמורה נשמור על המלך כסמל מאחד עם סמכויות מוגבלות על ידי חוקה.');
await pageA.locator('.delib__actions .btn--primary').click();
await pageA.waitForSelector('text=' + '🔆' , { timeout: 100 }).catch(() => {});
await pageA.waitForTimeout(1500);
console.log('A PROPOSED');

// Rate round: B rates A's proposal FOR (cross-camp!)
await call('agoraSetRound', { sessionId, roundPhase: 'rate' }, teacher.idToken);
try {
	await pageB.waitForSelector('.delib__rate-card', { timeout: 10000 });
} catch (e) {
	await pageB.screenshot({ path: 'phase4-b-state.png' });
	console.log('B BODY:', (await pageB.evaluate(() => document.body.innerText)).slice(0, 200));
	console.log('B STATE:', await pageB.evaluate(() => {
		const d = window.__agoraDebug();
		return JSON.stringify({
			stage: d.session.session?.stage,
			roundPhase: d.session.session?.roundPhase,
			roundNumber: d.session.session?.roundNumber,
			error: d.session.error,
		});
	}));
	throw e;
}
await pageB.locator('.btn--rate-agree').click();
await pageB.waitForSelector('.scene__waiting-glow', { timeout: 10000 });
console.log('B RATED A: agree (cross-camp)');

// Give the bridging trigger a moment, then check the score doc
await new Promise((r) => setTimeout(r, 4000));
const scoresRes = await ownerFetch('agoraScores');
const scoreDocs = ((await scoresRes.json()).documents ?? []).filter(
	(d) => d.fields.sessionId.stringValue === sessionId
);
for (const d of scoreDocs) {
	console.log('SCORE:', {
		authorCamp: d.fields.authorCamp.stringValue,
		bridging: d.fields.bridgingScore.integerValue ?? d.fields.bridgingScore.doubleValue,
	});
}

// Improve round: B suggests on A's proposal; A accepts
await call('agoraSetRound', { sessionId, roundPhase: 'improve' }, teacher.idToken);
await pageB.waitForSelector('textarea.text-input', { timeout: 10000 });
await pageB.locator('textarea.text-input').fill('אולי כדאי להוסיף גם אספה נבחרת שתאשר את התקציב, כדי שהעם ירגיש שותף.');
await pageB.getByRole('button', { name: /improvement|שיפור|Send|שליחת/i }).click();
await pageB.waitForTimeout(1200);
console.log('B SENT SUGGESTION');

// A opens "my proposal" tab, sees per-camp support + suggestion, accepts it
await pageA.waitForSelector('.teacher__mode-row', { timeout: 10000 });
await pageA.getByRole('button', { name: /My proposal|ההצעה שלי/i }).click();
await pageA.waitForSelector('.camp-bar', { timeout: 8000 });
console.log('A SEES BRIDGING:', await pageA.locator('.values__score').first().textContent());
await pageA.getByRole('button', { name: /^(Accept|קבלת ההצעה)$/i }).click();
await pageA.waitForSelector('text=/Accepted|התקבלה/', { timeout: 10000 });
console.log('A ACCEPTED SUGGESTION');

// B receives the in-app toast
await pageB.waitForSelector('.toast', { timeout: 10000 });
console.log('B TOAST:', await pageB.locator('.toast__text').textContent());

// Verify helper points + notification
await new Promise((r) => setTimeout(r, 1500));
const partsRes2 = await ownerFetch('agoraParticipants');
const parts2 = (await partsRes2.json()).documents.filter(
	(d) => d.fields.sessionId.stringValue === sessionId
);
console.log(
	'POINTS:',
	parts2.map((d) => ({
		camp: d.fields.camp?.stringValue,
		helping: d.fields.points.mapValue.fields.helping.integerValue,
		total: d.fields.points.mapValue.fields.total.integerValue,
	}))
);
const notifRes = await ownerFetch('inAppNotifications');
const notifs = ((await notifRes.json()).documents ?? []).filter(
	(d) => d.fields.sourceApp?.stringValue === 'agora'
);
console.log('AGORA NOTIFICATIONS:', notifs.map((d) => d.fields.triggerType?.stringValue));

// Screenshot the teacher lantern square
const pageT = await ctxA.newPage();
await pageT.goto(`http://localhost:3009/#!/play/${sessionId}`, { waitUntil: 'domcontentloaded' });
await pageT.waitForSelector('.era-map', { timeout: 10000 }).catch(() => {});
await pageT.waitForTimeout(1500);

// ---- Phase 5: results ----
await call('agoraAdvanceStage', { sessionId, stage: 'results' }, teacher.idToken);
await pageA.waitForSelector('.results__total', { timeout: 90000 });
console.log('CLASS SCORE:', await pageA.locator('.results__total').textContent());
console.log('METRICS:', await pageA.locator('.metric__delta').allTextContents());
const narrative = await pageA.locator('.metric__narrative').first().textContent().catch(() => '');
console.log('NARRATIVE:', (narrative ?? '').slice(0, 110));
const ending = await pageA.locator('.scene__title').textContent().catch(() => '(no ending scene)');
console.log('ENDING SCENE:', ending);
await pageA.screenshot({ path: 'agora-results.png', fullPage: true });

console.log('PAGE ERRORS:', errs.length ? errs : 'none');
await browser.close();
console.log('E2E PHASES 4+5 COMPLETE');
