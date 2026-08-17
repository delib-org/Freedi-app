import { chromium } from '@playwright/test';
import {
  preflight,
  AUTH_HOST,
  FUNCTIONS_BASE,
  FIRESTORE_REST,
  VITE_HOST,
} from './lib/preflight.mjs';

// Fail in seconds with a readable reason instead of minutes with a stack trace
await preflight();

// Hosts come from preflight, never from a copy kept here: a script that
// hardcodes the ports talks to a different emulator than the browser it is
// driving, and the failure reads as "code not found" rather than as the
// misconfiguration it is.
const AUTH = `${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;
const FN = FUNCTIONS_BASE;

// --- Teacher: sign in via fake Google IdP and create a session ---
const idpRes = await fetch(`${AUTH}/accounts:signInWithIdp?key=fake`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub: 'e2e-teacher', email: 'e2e-teacher@example.com', name: 'E2E Teacher' }))}&providerId=google.com`,
    requestUri: 'http://localhost', returnSecureToken: true,
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

const { sessionId, code } = await call('agoraCreateSession', { topicPackageId: 'demo-french-revolution', deviceMode: 'individual' }, teacher.idToken);
console.log('SESSION', sessionId, code);
const advance = (stage) => call('agoraAdvanceStage', { sessionId, stage }, teacher.idToken);

// --- Student browser ---
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(`${VITE_HOST}/#!/join/${code}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.lobby__name', { timeout: 15000 });
console.log('LOBBY OK — anon name:', await page.locator('.lobby__name strong').textContent());

// Teacher: open the time tunnel
await advance('framing');
await page.waitForSelector('.scene__title', { timeout: 8000 });
// Step through the 3 framing scenes
for (let i = 0; i < 3; i++) {
  console.log('SCENE:', await page.locator('.scene__title').textContent());
  await page.locator('.scene__actions .btn--primary').click();
  await page.waitForTimeout(400);
}
console.log('FRAMING DONE:', (await page.locator('h3').textContent()).slice(0, 40));

// Perspectives: two dialogue scenes, reveal all lines then continue
await advance('perspectives');
await page.waitForSelector('.scene__dialogue', { timeout: 8000 });
for (let s = 0; s < 2; s++) {
  console.log('PERSPECTIVE:', await page.locator('.scene__title').textContent());
  while (await page.locator('.scene__actions .btn--secondary').count()) {
    await page.locator('.scene__actions .btn--secondary').click();
    await page.waitForTimeout(200);
  }
  await page.locator('.scene__actions .btn--primary').click();
  await page.waitForTimeout(400);
}

// The valueIdentification stage was removed from the flow (a heavy writing
// task right before proposal writing — too much cognitive load). The enum
// value survives for old sessions, but advanceStage refuses to route through
// it, so needs → positioning is the live path.

// Positioning
await advance('positioning');
await page.waitForSelector('.camp-scale__slider', { timeout: 8000 });
await page.locator('.camp-scale__slider').fill('25'); // left camp
await page.locator('button.btn--primary').click();
await page.waitForSelector('text=/.*/ >> .lobby__status', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(1500);

// Verify participant doc got camp.
// Query server-side, never list-then-filter: the collection holds every
// session the emulator has ever seen and the list endpoint pages, so a
// client-side filter quietly returns [] once the emulator has been used a
// while — a green run that checked nothing.
const partRes = await fetch(`${FIRESTORE_REST}:runQuery`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
  body: JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: 'agoraParticipants' }],
      where: { fieldFilter: { field: { fieldPath: 'sessionId' }, op: 'EQUAL', value: { stringValue: sessionId } } },
    },
  }),
});
const mine = (await partRes.json()).map((row) => row.document).filter(Boolean);
if (mine.length === 0) throw new Error(`No participant docs found for session ${sessionId}`);
console.log('PARTICIPANT:', mine.map((d) => ({
  camp: d.fields.camp?.stringValue,
  pos: d.fields.campPosition?.integerValue ?? d.fields.campPosition?.doubleValue,
  points: d.fields.points?.mapValue?.fields?.total?.integerValue,
})));
console.log('PAGE ERRORS:', errs.length ? errs : 'none');
await browser.close();
console.log('E2E PHASE 3 COMPLETE');
