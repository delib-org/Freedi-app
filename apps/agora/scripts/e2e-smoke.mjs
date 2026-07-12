import { chromium } from '@playwright/test';

const AUTH = 'http://localhost:9099/identitytoolkit.googleapis.com/v1';
const FN = 'http://localhost:5001/freedi-test/me-west1';

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

await page.goto(`http://localhost:3009/#!/join/${code}`, { waitUntil: 'domcontentloaded' });
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

// Value identification: answer for both characters (real AI grading)
await advance('valueIdentification');
await page.waitForSelector('.values__textarea', { timeout: 8000 });
const answers = [
  'לדמות הזו חשובים סדר ויציבות, היא מפחדת מכאוס ואלימות. חשובה לה גם המסורת של הכנסייה והכתר, והיא מאמינה בהיררכיה — שרק בעלי ניסיון ומעמד צריכים להנהיג.',
  'לדמות הזו חשוב השוויון בין כל בני האדם וביטול זכויות היתר. חשובה לו החירות של הפרט מול שלטון עריץ, והוא מאמין שריבונות העם היא מקור הלגיטימציה לשלטון.',
];
for (let a = 0; a < answers.length; a++) {
  await page.waitForSelector('.values__textarea', { timeout: 10000 });
  await page.locator('.values__textarea').fill(answers[a]);
  await page.getByRole('button').filter({ hasNotText: /^$/ }).locator('visible=true').first().click();
  // wait for grade to land (AI roundtrip)
  try {
    await page.waitForSelector('.values__score', { timeout: 60000 });
    console.log('GRADE:', await page.locator('.values__score').first().textContent());
    console.log('FEEDBACK:', (await page.locator('.values__feedback').first().textContent()).slice(0, 120));
  } catch (e) {
    await page.screenshot({ path: 'values-timeout.png' });
    console.log('VALUES TIMEOUT — screenshot saved');
    throw e;
  }
  // continue to next character / done
  await page.locator('button.btn--secondary').click();
  await page.waitForTimeout(600);
}

// Positioning
await advance('positioning');
await page.waitForSelector('.camp-scale__slider', { timeout: 8000 });
await page.locator('.camp-scale__slider').fill('25'); // left camp
await page.locator('button.btn--primary').click();
await page.waitForSelector('text=/.*/ >> .lobby__status', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(1500);

// Verify participant doc got camp
const partRes = await fetch(`http://localhost:8081/v1/projects/freedi-test/databases/(default)/documents/agoraParticipants`, { headers: { Authorization: 'Bearer owner' } });
const parts = await partRes.json();
const mine = (parts.documents ?? []).filter((d) => d.fields.sessionId.stringValue === sessionId);
console.log('PARTICIPANT:', mine.map((d) => ({
  camp: d.fields.camp?.stringValue,
  pos: d.fields.campPosition?.integerValue ?? d.fields.campPosition?.doubleValue,
  points: d.fields.points?.mapValue?.fields?.total?.integerValue,
})));
console.log('PAGE ERRORS:', errs.length ? errs : 'none');
await browser.close();
console.log('E2E PHASE 3 COMPLETE');
