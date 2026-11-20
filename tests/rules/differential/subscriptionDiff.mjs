// Differential check of the statementsSubscribe rules: the SAME case table
// (subscriptionCases.mjs) against two rule files, allow / deny compared case by case.
//
// Not part of `npm run test:rules` (it needs a second rules file). Run it against
// any Firestore emulator; it uses its own project ids and clears only them:
//
//   git show dev:firestore.rules > /tmp/base.rules
//   firebase emulators:exec --only firestore \
//     "node tests/rules/differential/subscriptionDiff.mjs /tmp/base.rules firestore.rules"
//
// FIRESTORE_EMULATOR_PORT picks the port (default 8081, as in firebase.json).
// Exit code 1 when a case that writes no privacy field (side / camp /
// decisionSupport / sidePickedAt) is allowed by one file and refused by the other.
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, deleteField, doc, setDoc, updateDoc } from 'firebase/firestore';
import { ADMIN, DELETE, S2, STATEMENTS, SHAPES, buildCases, statementDoc } from './subscriptionCases.mjs';

const [baseFile, headFile, outFile] = process.argv.slice(2);
if (!baseFile || !headFile) {
	console.error('usage: node subscriptionDiff.mjs <base.rules> <head.rules> [report.json]');
	process.exit(64);
}
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8081);
const BUDGET = 'maximum of 1000 expressions';

async function envFor(label, rulesFile) {
	const env = await initializeTestEnvironment({
		projectId: `sub-diff-${label}-${process.pid}`,
		firestore: { rules: readFileSync(rulesFile, 'utf8'), host: '127.0.0.1', port: PORT },
	});
	await env.clearFirestore();
	await env.withSecurityRulesDisabled(async (ctx) => {
		const db = ctx.firestore();
		for (const sid of Object.keys(STATEMENTS)) {
			await setDoc(doc(db, 'statements', sid), statementDoc(sid));
			await setDoc(doc(db, 'statementsSubscribe', `${ADMIN}--${sid}`), SHAPES.main(ADMIN, sid, 'admin'));
			await setDoc(doc(db, 'statementsSubscribe', `${S2}--${sid}`), SHAPES.main(S2, sid, 'member'));
		}
	});

	return env;
}

// One client per (env, actor): a new context per case keeps every app alive until cleanup.
const clients = new Map();
function dbOf(env, actor) {
	const key = `${env.projectId}|${actor ?? ''}`;
	if (!clients.has(key)) {
		clients.set(key, actor ? env.authenticatedContext(actor).firestore() : env.unauthenticatedContext().firestore());
	}

	return clients.get(key);
}

function patchOf(patch) {
	return Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === DELETE ? deleteField() : v]));
}

async function runCase(env, c) {
	await env.withSecurityRulesDisabled(async (ctx) => {
		const ref = doc(ctx.firestore(), 'statementsSubscribe', c.target.id);
		if (c.target.data) await setDoc(ref, c.target.data);
		else await deleteDoc(ref);
	});
	const db = dbOf(env, c.actor);
	try {
		if (c.op.kind === 'update') await updateDoc(doc(db, 'statementsSubscribe', c.target.id), patchOf(c.op.patch));
		else if (c.op.kind === 'create') await setDoc(doc(db, 'statementsSubscribe', c.op.id), c.op.data);
		else await deleteDoc(doc(db, 'statementsSubscribe', c.target.id));

		return 'allow';
	} catch (error) {
		const message = String(error?.message ?? error);

		return message.includes(BUDGET) ? 'deny(budget)' : 'deny';
	}
}

const cases = buildCases();
const base = await envFor('base', baseFile);
const head = await envFor('head', headFile);
const rows = [];
for (const c of cases) {
	const a = await runCase(base, c);
	const b = await runCase(head, c);
	rows.push({ name: c.name, privacy: c.privacy, base: a, head: b });
}
await base.cleanup();
await head.cleanup();

const allowOf = (r) => r === 'allow';
const differs = rows.filter((r) => allowOf(r.base) !== allowOf(r.head));
const nonPrivacy = differs.filter((r) => !r.privacy);
const budgetHead = rows.filter((r) => r.head === 'deny(budget)');
const budgetBase = rows.filter((r) => r.base === 'deny(budget)');
console.info(`cases: ${rows.length} (privacy: ${rows.filter((r) => r.privacy).length})`);
console.info(`allowed: base ${rows.filter((r) => allowOf(r.base)).length}, head ${rows.filter((r) => allowOf(r.head)).length}`);
console.info(`differences: ${differs.length} (non-privacy: ${nonPrivacy.length})`);
console.info(`refused by the expression budget: base ${budgetBase.length}, head ${budgetHead.length}`);
for (const r of differs) {
	console.info(`  ${r.privacy ? 'privacy' : 'NON-PRIVACY'}  base=${r.base} head=${r.head}  ${r.name}`);
}
if (outFile) writeFileSync(outFile, JSON.stringify(rows, null, 1));
process.exit(nonPrivacy.length > 0 ? 1 : 0);
