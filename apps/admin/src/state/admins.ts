import m from 'mithril';
import { fetchAdminSubscriptions, AdminSubscription } from '../lib/queries';

interface AdminEntry {
	userId: string;
	displayName: string;
	statements: Array<{ statementId: string; title: string; role: string }>;
}

interface AdminsState {
	entries: AdminEntry[];
	totalUniqueAdmins: number;
	totalAssignments: number;
	loading: boolean;
	error: string | null;
}

const state: AdminsState = {
	entries: [],
	totalUniqueAdmins: 0,
	totalAssignments: 0,
	loading: false,
	error: null,
};

export async function loadAdminData(): Promise<void> {
	state.loading = true;
	state.error = null;
	m.redraw();

	try {
		const subs = await fetchAdminSubscriptions();

		// Group by userId
		const grouped = new Map<string, AdminEntry>();

		for (const sub of subs) {
			if (!grouped.has(sub.userId)) {
				grouped.set(sub.userId, {
					userId: sub.userId,
					displayName: sub.userDisplayName || sub.userId.substring(0, 8),
					statements: [],
				});
			}

			const entry = grouped.get(sub.userId)!;
			entry.statements.push({
				statementId: sub.statementId,
				title: sub.statement?.statement || sub.statementId.substring(0, 12) + '...',
				role: sub.role,
			});
		}

		state.entries = Array.from(grouped.values()).sort(
			(a, b) => b.statements.length - a.statements.length
		);
		state.totalUniqueAdmins = grouped.size;
		state.totalAssignments = subs.length;
		state.loading = false;
	} catch (error) {
		console.error('[Admins] Failed to load:', error);
		state.error = 'Failed to load admin data';
		state.loading = false;
	}

	m.redraw();
}

export function getAdminState(): Readonly<AdminsState> {
	return state;
}
