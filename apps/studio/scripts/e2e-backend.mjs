// Backend smoke test for the consultant console against the ALT-PORT emulator
// suite (firebase.altports2.json): auth 9799 · firestore 8281 · functions 5201.
//
//   firebase emulators:start --config firebase.altports2.json --only firestore,auth,functions --project freedi-test
//   node apps/studio/scripts/e2e-backend.mjs
//
// Exercises: sysadmin gate → createOrganization → hashed invite → accept (email
// match) → top question + MC/Join/Discussion activities (markers, order,
// openedInJoin) → admin fan-out → ensureTopParentSubscription (Home surfacing)
// → questionProgress counters + recompute → nudge (+ rate limit) → invite/remove
// admin (materialize / demote). Writes fixtures with the emulator owner token.
const PROJECT = 'freedi-test';
const AUTH = 'http://127.0.0.1:9799';
const FS = 'http://127.0.0.1:8281';
const FN = `http://127.0.0.1:5201/${PROJECT}/me-west1`;
const REGION_DOCS = `${FS}/v1/projects/${PROJECT}/databases/(default)/documents`;

const results = [];
function check(name, ok, detail = '') {
	results.push({ name, ok, detail });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function signUp(email) {
	const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password: 'passw0rd!', returnSecureToken: true }),
	});
	const j = await r.json();
	if (!j.idToken) throw new Error('signUp failed: ' + JSON.stringify(j));

	return { uid: j.localId, idToken: j.idToken, email };
}

// Owner-bypass writes/reads straight to the Firestore emulator (rules ignored).
function toFsValue(v) {
	if (v === null) return { nullValue: null };
	if (typeof v === 'boolean') return { booleanValue: v };
	if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
	if (typeof v === 'string') return { stringValue: v };
	if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };

	return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFsValue(x)])) } };
}
function fromFsValue(v) {
	if ('stringValue' in v) return v.stringValue;
	if ('integerValue' in v) return Number(v.integerValue);
	if ('doubleValue' in v) return v.doubleValue;
	if ('booleanValue' in v) return v.booleanValue;
	if ('nullValue' in v) return null;
	if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFsValue);
	if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFsValue(x)]));

	return undefined;
}
async function fsSet(path, data) {
	const r = await fetch(`${REGION_DOCS}/${path}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
		body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toFsValue(v)])) }),
	});
	if (!r.ok) throw new Error(`fsSet ${path}: ${r.status} ${await r.text()}`);
}
async function fsGet(path) {
	const r = await fetch(`${REGION_DOCS}/${path}`, { headers: { authorization: 'Bearer owner' } });
	if (r.status === 404) return null;
	const j = await r.json();

	return Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, fromFsValue(v)]));
}
async function fsList(collection, filterFn) {
	const r = await fetch(`${REGION_DOCS}:runQuery`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
		body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }] } }),
	});
	const rows = await r.json();
	const docs = rows.filter((x) => x.document).map((x) => ({
		id: x.document.name.split('/').pop(),
		...Object.fromEntries(Object.entries(x.document.fields || {}).map(([k, v]) => [k, fromFsValue(v)])),
	}));

	return filterFn ? docs.filter(filterFn) : docs;
}

async function call(name, idToken, data) {
	const r = await fetch(`${FN}/${name}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
		body: JSON.stringify({ data }),
	});
	const j = await r.json();
	if (j.error) throw Object.assign(new Error(`${name}: ${j.error.status} ${j.error.message}`), { code: j.error.status });

	return j.result;
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
async function waitFor(fn, { tries = 90, delay = 500 } = {}) {
	for (let i = 0; i < tries; i++) {
		const v = await fn();
		if (v) return v;
		await sleep(delay);
	}

	return null;
}

const stamp = Date.now();
const sysadmin = await signUp(`sysadmin+${stamp}@example.com`);
const consultant = await signUp(`consultant+${stamp}@example.com`);
const resident = await signUp(`resident+${stamp}@example.com`);
await fsSet(`usersV2/${sysadmin.uid}`, { uid: sysadmin.uid, displayName: 'Sys Admin', email: sysadmin.email, systemAdmin: true });
await fsSet(`usersV2/${consultant.uid}`, { uid: consultant.uid, displayName: 'Dana Consultant', email: consultant.email });
await fsSet(`usersV2/${resident.uid}`, { uid: resident.uid, displayName: 'Resident', email: resident.email });

// 1. Non-sysadmin cannot open an organization
try {
	await call('fn_createOrganization', consultant.idToken, { name: 'Nope', ownerEmail: consultant.email });
	check('non-sysadmin createOrganization rejected', false);
} catch (e) {
	check('non-sysadmin createOrganization rejected', e.code === 'PERMISSION_DENIED', e.message);
}

// 2. Sysadmin opens org with an invited owner
const org = await call('fn_createOrganization', sysadmin.idToken, {
	name: 'Haifa Municipality', ownerEmail: consultant.email, defaultLanguage: 'he',
});
check('createOrganization returns id + invite link', !!org.organizationId && !!org.inviteLink, JSON.stringify(org));
const token = new URL(org.inviteLink).searchParams.get('token');
const inviteDoc = (await fsList('organizationInvitations', (d) => d.organizationId === org.organizationId))[0];
check('invitation stores tokenHash only', !!inviteDoc?.tokenHash && !('token' in inviteDoc), Object.keys(inviteDoc || {}).join(','));

// 3. Wrong email cannot accept
try {
	await call('fn_acceptOrgInvite', resident.idToken, { token });
	check('accept with wrong email rejected', false);
} catch (e) {
	check('accept with wrong email rejected', /PERMISSION_DENIED|FAILED_PRECONDITION/.test(e.code), e.message);
}
const accepted = await call('fn_acceptOrgInvite', consultant.idToken, { token });
check('owner accepted invite', accepted.role === 'owner' && accepted.organizationId === org.organizationId, JSON.stringify(accepted));
const member = await fsGet(`organizationMembers/${org.organizationId}--${consultant.uid}`);
check('organizationMembers doc created', member?.role === 'owner');

// 4. Owner creates top question + activities
const top = await call('fn_createOrgStatement', consultant.idToken, {
	organizationId: org.organizationId, title: 'How should our city handle the housing crisis?', kind: 'topQuestion',
});
const topDoc = await fsGet(`statements/${top.statementId}`);
check('top question written with organizationId + parentId top', topDoc?.organizationId === org.organizationId && topDoc?.parentId === 'top' && topDoc?.statementType === 'question');
const ownerSub = await fsGet(`statementsSubscribe/${consultant.uid}--${top.statementId}`);
check('owner has admin subscription on top question', ['admin', 'statement-creator'].includes(ownerSub?.role), ownerSub?.role);
const seededProgress = await fsGet(`questionProgress/${top.statementId}`);
check('questionProgress seeded for top question', seededProgress?.entered === 0 && seededProgress?.organizationId === org.organizationId);

const mc = await call('fn_createOrgStatement', consultant.idToken, {
	organizationId: org.organizationId, parentId: top.statementId, title: 'Rent control ideas', kind: 'massConsensus',
});
const join = await call('fn_createOrgStatement', consultant.idToken, {
	organizationId: org.organizationId, parentId: top.statementId, title: 'Town-hall: who joins what?', kind: 'join', initialStatus: 'frozen',
});
const disc = await call('fn_createOrgStatement', consultant.idToken, {
	organizationId: org.organizationId, parentId: top.statementId, title: 'Should we tax empty apartments?', kind: 'question',
});
const mcDoc = await fsGet(`statements/${mc.statementId}`);
const joinDoc = await fsGet(`statements/${join.statementId}`);
const discDoc = await fsGet(`statements/${disc.statementId}`);
check('MC child marked questionType mass-consensus + sourceApp', mcDoc?.questionSettings?.questionType === 'mass-consensus' && mcDoc?.sourceApp === 'mass-consensus');
check('join child marked sourceApp join + frozen', joinDoc?.sourceApp === 'join' && joinDoc?.statementSettings?.questionStatus === 'frozen');
check('children ordered 0,1,2', mcDoc?.order === 0 && joinDoc?.order === 1 && discDoc?.order === 2, `${mcDoc?.order},${joinDoc?.order},${discDoc?.order}`);
check('children carry topParentId, no organizationId', mcDoc?.topParentId === top.statementId && !mcDoc?.organizationId);
const joinTopSub = await fsGet(`statementsSubscribe/${consultant.uid}--${top.statementId}`);
check('join activity marks openedInJoin on the owner top sub', typeof joinTopSub?.openedInJoin === 'number');
const childAdminSub = await waitFor(async () => {
	const s = await fsGet(`statementsSubscribe/${consultant.uid}--${mc.statementId}`);

	return s && ['admin', 'statement-creator'].includes(s.role) ? s : null;
});
check('onStatementCreated fanned admin sub to MC child', !!childAdminSub);

// 5. Resident subscribes to the MC child only → top question must surface (ensureTopParentSubscription)
const now = Date.now();
await fsSet(`statementsSubscribe/${resident.uid}--${mc.statementId}`, {
	role: 'member', userId: resident.uid, statementId: mc.statementId,
	statementsSubscribeId: `${resident.uid}--${mc.statementId}`,
	statement: { statementId: mc.statementId, statement: 'Rent control ideas', parentId: top.statementId, topParentId: top.statementId, statementType: 'question', creatorId: consultant.uid, creator: { uid: consultant.uid, displayName: 'Dana Consultant', email: consultant.email }, consensus: 0, createdAt: now, lastUpdate: now },
	user: { uid: resident.uid, displayName: 'Resident', email: resident.email },
	parentId: top.statementId, statementType: 'question', topParentId: top.statementId,
	lastUpdate: now, createdAt: now, getInAppNotification: true,
});
const topSub = await waitFor(() => fsGet(`statementsSubscribe/${resident.uid}--${top.statementId}`));
check('ensureTopParentSubscription created member sub on top question', topSub?.role === 'member' && topSub?.parentId === 'top' && topSub?.topParentId === top.statementId, JSON.stringify(topSub && { role: topSub.role, parentId: topSub.parentId }));

// 6. Progress: resident views MC question, suggests an option, evaluates it
await fsSet(`statementViews/${resident.uid}--${mc.statementId}`, { statementId: mc.statementId, userId: resident.uid, viewed: 1, lastViewed: now });
const optionId = `opt-${stamp}`;
await fsSet(`statements/${optionId}`, {
	statementId: optionId, statement: 'Cap rent increases at 3%', statementType: 'option',
	parentId: mc.statementId, topParentId: top.statementId, parents: [top.statementId, mc.statementId],
	creatorId: resident.uid, creator: { uid: resident.uid, displayName: 'Resident', email: resident.email },
	createdAt: now, lastUpdate: now, consensus: 0,
});
await fsSet(`evaluations/${resident.uid}--${optionId}`, {
	evaluationId: `${resident.uid}--${optionId}`, statementId: optionId, parentId: mc.statementId,
	evaluatorId: resident.uid, evaluator: { uid: resident.uid, displayName: 'Resident', email: resident.email },
	evaluation: 1, updatedAt: now,
});
const progress = await waitFor(async () => {
	const p = await fsGet(`questionProgress/${mc.statementId}`);

	return p && p.entered >= 1 && p.suggested >= 1 && p.evaluated >= 1 ? p : null;
}, { tries: 40 });
check('questionProgress counters entered/suggested/evaluated = 1', !!progress, JSON.stringify(progress));
const marker = await fsGet(`questionParticipation/${mc.statementId}--${resident.uid}`);
check('participation marker has all three flags', marker?.entered === true && marker?.suggested === true && marker?.evaluated === true);

// 7. Recompute matches counters
const recomputed = await call('fn_recomputeQuestionProgress', consultant.idToken, { statementId: mc.statementId });
check('recompute agrees with live counters', recomputed.entered === 1 && recomputed.suggested === 1 && recomputed.evaluated === 1, JSON.stringify(recomputed));

// 8. Nudge: resident (non-admin) rejected; owner sends; second send rate-limited
try {
	await call('fn_nudgeQuestionSubscribers', resident.idToken, { statementId: mc.statementId, message: 'hi', audience: 'all', channels: ['inApp'] });
	check('non-admin nudge rejected', false);
} catch (e) {
	check('non-admin nudge rejected', e.code === 'PERMISSION_DENIED', e.message);
}
const nudge = await call('fn_nudgeQuestionSubscribers', consultant.idToken, {
	statementId: mc.statementId, message: '41 new ideas came in — take two minutes to rate them.', audience: 'all', channels: ['inApp'],
});
check('nudge sent to the resident (caller excluded)', nudge.sent === 1 && nudge.inApp === 1, JSON.stringify(nudge));
const notifs = await fsList('inAppNotifications', (d) => d.userId === resident.uid && d.triggerType === 'facilitatorNudge');
check('in-app notification written with facilitatorNudge trigger', notifs.length === 1 && notifs[0].statementId === mc.statementId);
try {
	await call('fn_nudgeQuestionSubscribers', consultant.idToken, { statementId: mc.statementId, message: 'again', audience: 'all', channels: ['inApp'] });
	check('second nudge within 1h rate-limited', false);
} catch (e) {
	check('second nudge within 1h rate-limited', e.code === 'RESOURCE_EXHAUSTED', e.message);
}

// 9. Invite an admin, then remove them → subs demoted
const inv = await call('fn_inviteOrgMember', consultant.idToken, { organizationId: org.organizationId, email: resident.email, role: 'admin' });
const acc = await call('fn_acceptOrgInvite', resident.idToken, { token: new URL(inv.inviteLink).searchParams.get('token') });
check('admin invite accepted', acc.role === 'admin');
const residentTopSubAfter = await fsGet(`statementsSubscribe/${resident.uid}--${top.statementId}`);
check('materialized admin sub on existing top question', residentTopSubAfter?.role === 'admin', residentTopSubAfter?.role);
try {
	await call('fn_removeOrgMember', resident.idToken, { organizationId: org.organizationId, userId: consultant.uid });
	check('admin cannot remove the last owner', false);
} catch (e) {
	check('admin cannot remove the last owner', /PERMISSION_DENIED|FAILED_PRECONDITION/.test(e.code), e.message);
}
await call('fn_removeOrgMember', consultant.idToken, { organizationId: org.organizationId, userId: resident.uid });
const residentTopSubRemoved = await fsGet(`statementsSubscribe/${resident.uid}--${top.statementId}`);
check('removed member demoted to member on top question', residentTopSubRemoved?.role === 'member', residentTopSubRemoved?.role);
const orgDoc = await fsGet(`organizations/${org.organizationId}`);
check('org counters: 1 member, 1 top question', orgDoc?.memberCount === 1 && orgDoc?.questionCount === 1, JSON.stringify({ m: orgDoc?.memberCount, q: orgDoc?.questionCount }));

// 10. An organization addresses many questions over time — a second top question
const top2 = await call('fn_createOrgStatement', consultant.idToken, {
	organizationId: org.organizationId, title: 'Where should the new sports hall be built?', kind: 'topQuestion',
});
const orgQuestions = await fsList('statements', (d) => d.organizationId === org.organizationId && d.parentId === 'top');
check('org lists two independent top questions', orgQuestions.length === 2 && orgQuestions.some((d) => d.id === top2.statementId), `count=${orgQuestions.length}`);
const orgDoc2 = await fsGet(`organizations/${org.organizationId}`);
check('org questionCount = 2', orgDoc2?.questionCount === 2, String(orgDoc2?.questionCount));
const top2Sub = await fsGet(`statementsSubscribe/${consultant.uid}--${top2.statementId}`);
check('owner is admin on the second top question too', top2Sub?.role === 'admin', top2Sub?.role);
const top2Progress = await fsGet(`questionProgress/${top2.statementId}`);
check('second top question has its own progress doc', top2Progress?.organizationId === org.organizationId && top2Progress?.entered === 0);

// 11. "Start a question with AI" — fixture mode (emulator has no OPENAI_API_KEY)
const planStart = await call('fn_studioPlanStart', consultant.idToken, {
	organizationId: org.organizationId, language: 'he', timezone: 'Asia/Jerusalem',
});
check('plan start returns a Hebrew opener', !!planStart.sessionId && /ספרו/.test(planStart.message?.content ?? ''), planStart.message?.content);
const turn1 = await call('fn_studioPlanMessage', consultant.idToken, {
	sessionId: planStart.sessionId, message: 'אנחנו צריכים להחליט איך לחלק תקציב של מיליון שקל בין חמישה פרויקטים שכונתיים, תוך חודש',
});
// Fixture mode (no OPENAI_API_KEY) answers with a plan at once; the real model may ask a clarifying question first.
check('first turn answers in Hebrew and is not ready yet', /[\u0590-\u05FF]/.test(turn1.message?.content ?? '') && turn1.readyToBuild === false, JSON.stringify({ n: turn1.plan?.activities?.length, ready: turn1.readyToBuild }));
const turn2 = await call('fn_studioPlanMessage', consultant.idToken, { sessionId: planStart.sessionId, message: 'מעולה, בואו נבנה את זה' });
check('second turn marks the plan ready to build', turn2.readyToBuild === true, String(turn2.readyToBuild));
const sessionDoc = await fsGet(`studioPlanSessions/${planStart.sessionId}`);
check('session stores messages, plan, diagnosis and language he', sessionDoc?.messages?.length === 5 && !!sessionDoc?.currentPlan && sessionDoc?.language === 'he', JSON.stringify({ m: sessionDoc?.messages?.length, lang: sessionDoc?.language }));
const built = await call('fn_studioPlanBuild', consultant.idToken, { sessionId: planStart.sessionId });
const finalPlan = (await fsGet(`studioPlanSessions/${planStart.sessionId}`))?.currentPlan;
const plannedSurveys = (finalPlan?.activities ?? []).filter((a) => a.type === 'crowdSurvey').length;
check('build returns top question + every planned activity + a survey per crowd survey', !!built.topQuestionId && Object.keys(built.activityIds).length >= (finalPlan?.activities?.length ?? 1) && built.surveyIds.length === plannedSurveys, JSON.stringify({ activities: Object.keys(built.activityIds).length, planned: finalPlan?.activities?.length, surveys: built.surveyIds.length, actions: built.scheduledActionIds.length }));
const builtTop = await fsGet(`statements/${built.topQuestionId}`);
check('built top question belongs to the org', builtTop?.organizationId === org.organizationId && builtTop?.parentId === 'top');
const builtChildren = await fsList('statements', (d) => d.parentId === built.topQuestionId);
const kindMarker = { crowdSurvey: 'mass-consensus', liveSession: 'join', discussion: 'main' };
const plannedSorted = [...(finalPlan?.activities ?? [])].sort((a, b) => a.order - b.order);
const childrenSorted = [...builtChildren].sort((a, b) => a.order - b.order);
check('built activities are children in plan order with kind markers + open/frozen', plannedSorted.every((a, i) => childrenSorted[i]?.sourceApp === kindMarker[a.type] && childrenSorted[i]?.statementSettings?.questionStatus === (a.openNow ? 'live' : 'frozen')), childrenSorted.map((d) => `${d.order}:${d.sourceApp}:${d.statementSettings?.questionStatus}`).join(' '));
if (built.surveyIds.length > 0) {
	const builtSurvey = await fsGet(`surveys/${built.surveyIds[0]}`);
	const surveyQuestion = builtSurvey && (await fsGet(`statements/${builtSurvey.questionIds[0]}`));
	const expectedStatus = surveyQuestion?.statementSettings?.questionStatus === 'frozen' ? 'draft' : 'active';
	check('survey status follows its question, parented to the top question, stamped on its question', builtSurvey?.status === expectedStatus && builtSurvey?.parentStatementId === built.topQuestionId && surveyQuestion?.questionSettings?.massConsensusSurveyId === built.surveyIds[0], JSON.stringify({ status: builtSurvey?.status, expectedStatus }));
}
const pendingActions = await fsList('scheduledActions', (d) => d.topParentId === built.topQuestionId && d.status === 'pending');
check('scheduled actions are pending', pendingActions.length === built.scheduledActionIds.length, `${pendingActions.length}`);
const builtSession = await fsGet(`studioPlanSessions/${planStart.sessionId}`);
check('session marked built with builtStatementId', builtSession?.status === 'built' && builtSession?.builtStatementId === built.topQuestionId);
const rebuilt = await call('fn_studioPlanBuild', consultant.idToken, { sessionId: planStart.sessionId });
check('build is idempotent', rebuilt.topQuestionId === built.topQuestionId);
await call('fn_studioPlanRate', consultant.idToken, { sessionId: planStart.sessionId, value: 'up', note: 'helpful' });
const ratedSession = await fsGet(`studioPlanSessions/${planStart.sessionId}`);
check('rating stored on the session', ratedSession?.rating?.value === 'up');

// Existing-question mode reads the current activities
const planExisting = await call('fn_studioPlanStart', consultant.idToken, {
	organizationId: org.organizationId, topQuestionId: top.statementId, language: 'en', timezone: 'Asia/Jerusalem',
});
const existingIds = (planExisting.existingActivities ?? []).map((a) => a.statementId);
const plannedExisting = (planExisting.plan?.activities ?? []).filter((a) => a.existingStatementId && a.change !== 'add').map((a) => a.existingStatementId);
check('existing mode lists the 3 activities and never drops one from the plan', existingIds.length === 3 && existingIds.every((id) => plannedExisting.includes(id)), JSON.stringify({ n: existingIds.length, kept: plannedExisting.length, changes: planExisting.plan?.activities?.map((a) => a.change) }));

// Manual scheduled action + cancel
const manual = await call('fn_studioScheduledActionUpsert', consultant.idToken, { statementId: mc.statementId, action: 'close', runAt: Date.now() + 3600_000 });
const cancelled = await call('fn_studioScheduledActionCancel', consultant.idToken, { scheduledActionId: manual.scheduledActionId });
check('manual scheduled action created then cancelled', cancelled.status === 'cancelled');
try {
	await call('fn_studioScheduledActionUpsert', resident.idToken, { statementId: mc.statementId, action: 'close', runAt: Date.now() + 3600_000 });
	check('non-admin cannot schedule', false);
} catch (e) {
	check('non-admin cannot schedule', e.code === 'PERMISSION_DENIED', e.message);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(JSON.stringify({ orgId: org.organizationId, topId: top.statementId, mcId: mc.statementId, joinId: join.statementId, consultant: consultant.email, sysadmin: sysadmin.email }));
process.exit(failed.length ? 1 : 0);
