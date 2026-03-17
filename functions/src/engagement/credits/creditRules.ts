/**
 * Credit Rules - Phase 1
 *
 * Loads credit rules from Firestore (creditRules collection).
 * Rules are admin-configurable with no code deploys needed.
 * Falls back to default rules if Firestore is empty.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, CreditAction } from '@freedi/shared-types';
import type { CreditRule } from '@freedi/shared-types';
import { DEFAULT_CREDIT_RULES } from './defaultCreditRules';

const db = getFirestore();

/** In-memory cache of credit rules (refreshed every 5 minutes) */
let rulesCache: Map<CreditAction, CreditRule> | null = null;
let lastCacheRefresh = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load all credit rules from Firestore, falling back to defaults.
 * Results are cached in memory for 5 minutes to avoid repeated reads.
 */
export async function loadCreditRules(): Promise<Map<CreditAction, CreditRule>> {
	const now = Date.now();
	if (rulesCache && now - lastCacheRefresh < CACHE_TTL_MS) {
		return rulesCache;
	}

	try {
		const snapshot = await db.collection(Collections.creditRules).get();

		if (snapshot.empty) {
			logger.info('No credit rules in Firestore, using defaults');
			rulesCache = buildRulesMap(DEFAULT_CREDIT_RULES);
			lastCacheRefresh = now;

			return rulesCache;
		}

		const rules: CreditRule[] = snapshot.docs.map((doc) => doc.data() as CreditRule);
		rulesCache = buildRulesMap(rules);
		lastCacheRefresh = now;

		return rulesCache;
	} catch (error) {
		logger.error('Failed to load credit rules, using defaults', error);
		rulesCache = buildRulesMap(DEFAULT_CREDIT_RULES);
		lastCacheRefresh = now;

		return rulesCache;
	}
}

/**
 * Get a single credit rule by action.
 * Returns null if the action is disabled or not found.
 */
export async function getCreditRule(action: CreditAction): Promise<CreditRule | null> {
	const rules = await loadCreditRules();
	const rule = rules.get(action);

	if (!rule || !rule.enabled) {
		return null;
	}

	return rule;
}

/**
 * Seed default credit rules into Firestore.
 * Only writes rules that don't already exist (safe to run multiple times).
 */
export async function seedDefaultCreditRules(): Promise<number> {
	const batch = db.batch();
	let seeded = 0;

	for (const rule of DEFAULT_CREDIT_RULES) {
		const docRef = db.collection(Collections.creditRules).doc(rule.ruleId);
		const existing = await docRef.get();

		if (!existing.exists) {
			batch.set(docRef, rule);
			seeded++;
		}
	}

	if (seeded > 0) {
		await batch.commit();
		// Invalidate cache so next load picks up new rules
		rulesCache = null;
		logger.info(`Seeded ${seeded} default credit rules`);
	}

	return seeded;
}

function buildRulesMap(rules: CreditRule[]): Map<CreditAction, CreditRule> {
	const map = new Map<CreditAction, CreditRule>();
	for (const rule of rules) {
		map.set(rule.action, rule);
	}

	return map;
}
