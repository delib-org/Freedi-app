/**
 * Integration Test Helpers for Version Control
 * Utilities for setting up test data and scenarios
 */

import { Statement, Role, StatementType } from '@freedi/shared-types';
import { PendingReplacement } from '@freedi/shared-types';

/**
 * Creates a mock document with version control enabled
 */
export function createMockDocument(overrides?: Partial<Statement>): Statement {
	const now = Date.now();

	return {
		statementId: `doc_test_${now}`,
		statement: 'Test Document',
		creatorId: 'user_admin',
		creator: {
			displayName: 'Admin User',
			email: 'admin@test.com',
			photoURL: '',
			uid: 'user_admin',
			isAnonymous: false,
		},
		createdAt: now,
		lastUpdate: now,
		consensus: 0,
		statementType: StatementType.document,
		doc: {
			isDoc: true,
			versionControlSettings: {
				enabled: true,
				reviewThreshold: 0.5,
				allowAdminEdit: true,
				enableVersionHistory: true,
				maxRecentVersions: 4,
				maxTotalVersions: 50,
				lastSettingsUpdate: now,
				updatedBy: 'user_admin',
			},
		},
		...overrides,
	} as Statement;
}

/**
 * Creates a mock paragraph (official statement)
 */
export function createMockParagraph(
	documentId: string,
	overrides?: Partial<Statement>
): Statement {
	const now = Date.now();

	return {
		statementId: `para_test_${now}`,
		statement: 'This is the current paragraph text.',
		creatorId: 'user_admin',
		creator: {
			displayName: 'Admin User',
			email: 'admin@test.com',
			photoURL: '',
			uid: 'user_admin',
			isAnonymous: false,
		},
		createdAt: now,
		lastUpdate: now,
		consensus: 0,
		statementType: StatementType.statement,
		parentId: documentId,
		topParentId: documentId,
		versionControl: {
			currentVersion: 1,
			finalizedBy: 'user_admin',
			finalizedAt: now,
			finalizedReason: 'manual_approval',
		},
		...overrides,
	} as Statement;
}

/**
 * Creates a mock suggestion
 */
export function createMockSuggestion(
	paragraphId: string,
	documentId: string,
	consensus: number,
	overrides?: Partial<Statement>
): Statement {
	const now = Date.now();

	return {
		statementId: `sugg_test_${now}_${Math.random()}`,
		statement: 'This is a suggested replacement text.',
		creatorId: 'user_regular',
		creator: {
			displayName: 'Regular User',
			email: 'user@test.com',
			photoURL: '',
			uid: 'user_regular',
			isAnonymous: false,
		},
		createdAt: now,
		lastUpdate: now,
		consensus,
		totalEvaluators: 100,
		statementType: StatementType.option,
		parentId: paragraphId,
		topParentId: documentId,
		...overrides,
	} as Statement;
}

/**
 * Creates a mock queue item
 */
export function createMockQueueItem(
	paragraphId: string,
	documentId: string,
	suggestionId: string,
	consensus: number,
	overrides?: Partial<PendingReplacement>
): PendingReplacement {
	const now = Date.now();

	return {
		queueId: `queue_test_${now}`,
		documentId,
		paragraphId,
		suggestionId,
		currentText: 'Current paragraph text',
		proposedText: 'Proposed replacement text',
		consensus,
		consensusAtCreation: consensus,
		evaluationCount: 100,
		createdAt: now,
		creatorId: 'user_regular',
		creatorDisplayName: 'Regular User',
		status: 'pending',
		...overrides,
	} as PendingReplacement;
}

/**
 * Creates a mock version history entry
 */
export function createMockVersionEntry(
	paragraphId: string,
	versionNumber: number,
	overrides?: Partial<Statement>
): Statement {
	const now = Date.now();

	return {
		statementId: `history_${versionNumber}_${paragraphId}`,
		statement: `Version ${versionNumber} text`,
		creatorId: 'user_admin',
		creator: {
			displayName: 'Admin User',
			email: 'admin@test.com',
			photoURL: '',
			uid: 'user_admin',
			isAnonymous: false,
		},
		createdAt: now,
		lastUpdate: now,
		consensus: 0.7,
		statementType: StatementType.statement,
		parentId: paragraphId,
		hide: true,
		versionControl: {
			currentVersion: versionNumber,
			finalizedBy: 'user_admin',
			finalizedAt: now,
			finalizedReason: 'manual_approval',
		},
		...overrides,
	} as Statement;
}

/**
 * Simulates user voting to reach a consensus threshold
 */
export function simulateVoting(
	initialConsensus: number,
	targetConsensus: number,
	steps: number = 5
): number[] {
	const consensusSteps: number[] = [];
	const delta = (targetConsensus - initialConsensus) / steps;

	for (let i = 0; i <= steps; i++) {
		consensusSteps.push(initialConsensus + (delta * i));
	}

	return consensusSteps;
}

/**
 * Mock admin user with proper roles
 */
export function createMockAdminUser() {
	return {
		uid: 'user_admin',
		displayName: 'Admin User',
		email: 'admin@test.com',
		photoURL: '',
		role: Role.admin,
	};
}

/**
 * Mock regular user
 */
export function createMockRegularUser() {
	return {
		uid: 'user_regular',
		displayName: 'Regular User',
		email: 'user@test.com',
		photoURL: '',
		role: Role.member,
	};
}

/**
 * Simulates network delay
 */
export async function simulateNetworkDelay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates multiple suggestions for high-concurrency testing
 */
export function createMultipleSuggestions(
	paragraphId: string,
	documentId: string,
	count: number,
	consensus: number
): Statement[] {
	const suggestions: Statement[] = [];

	for (let i = 0; i < count; i++) {
		suggestions.push(
			createMockSuggestion(paragraphId, documentId, consensus, {
				statementId: `sugg_test_${Date.now()}_${i}`,
				statement: `Suggestion ${i + 1}: This is replacement text ${i + 1}`,
			})
		);
	}

	return suggestions;
}

/**
 * Creates version history with multiple versions
 */
export function createVersionHistory(
	paragraphId: string,
	versionCount: number
): Statement[] {
	const versions: Statement[] = [];

	for (let i = 1; i <= versionCount; i++) {
		versions.push(createMockVersionEntry(paragraphId, i));
	}

	return versions;
}

/**
 * Asserts queue item matches expected state
 */
export function assertQueueItem(
	queueItem: PendingReplacement,
	expected: Partial<PendingReplacement>
): void {
	Object.entries(expected).forEach(([key, value]) => {
		const actualValue = queueItem[key as keyof PendingReplacement];
		if (actualValue !== value) {
			throw new Error(
				`Queue item ${key} mismatch: expected ${value}, got ${actualValue}`
			);
		}
	});
}

// Local type for version control (not exported from shared-types)
interface StatementVersionControl {
	currentVersion: number;
	finalizedBy?: string;
	finalizedAt?: number;
	finalizedReason?: string;
	appliedSuggestionId?: string;
}

/**
 * Asserts version control state
 */
export function assertVersionControl(
	statement: Statement,
	expected: Partial<StatementVersionControl>
): void {
	const statementWithVC = statement as unknown as { versionControl?: StatementVersionControl };
	if (!statementWithVC.versionControl) {
		throw new Error('Statement has no version control data');
	}

	Object.entries(expected).forEach(([key, value]) => {
		const actualValue = statementWithVC.versionControl![key as keyof StatementVersionControl];
		if (actualValue !== value) {
			throw new Error(
				`Version control ${key} mismatch: expected ${value}, got ${actualValue}`
			);
		}
	});
}
