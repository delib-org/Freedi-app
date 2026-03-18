import m from 'mithril';
import { listenToAdminSubscriptions } from '../lib/queries';
import type { Unsubscribe } from '../lib/queries';

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

let unsubs: Unsubscribe[] = [];
// Accumulate from multiple role queries
const roleData = new Map<string, Array<{ statementId: string; userId: string; role: string; title: string; displayName: string }>>();

export function subscribeAdmins(): void {
	state.loading = true;
	state.error = null;
	m.redraw();

	unsubs = listenToAdminSubscriptions((snap) => {
		// Determine which role this snapshot is for from the first doc
		const subs: Array<{ statementId: string; userId: string; role: string; title: string; displayName: string }> = [];
		let snapshotRole = '';

		for (const docSnap of snap.docs) {
			const data = docSnap.data();
			const role = (data.role as string) ?? '';
			if (!snapshotRole) snapshotRole = role;
			subs.push({
				statementId: (data.statementId as string) ?? '',
				userId: (data.userId as string) ?? '',
				role,
				title: (data.statement as Record<string, unknown>)?.statement as string || (data.statementId as string || '').substring(0, 12) + '...',
				displayName: (data.userId as string || '').substring(0, 8),
			});
		}

		if (snapshotRole) {
			roleData.set(snapshotRole, subs);
		}

		// Merge all role data
		const allSubs = Array.from(roleData.values()).flat();
		const grouped = new Map<string, AdminEntry>();

		for (const sub of allSubs) {
			if (!grouped.has(sub.userId)) {
				grouped.set(sub.userId, {
					userId: sub.userId,
					displayName: sub.displayName,
					statements: [],
				});
			}
			grouped.get(sub.userId)!.statements.push({
				statementId: sub.statementId,
				title: sub.title,
				role: sub.role,
			});
		}

		state.entries = Array.from(grouped.values()).sort(
			(a, b) => b.statements.length - a.statements.length,
		);
		state.totalUniqueAdmins = grouped.size;
		state.totalAssignments = allSubs.length;
		state.loading = false;
		state.error = null;
		m.redraw();
	});
}

export function unsubscribeAdmins(): void {
	for (const unsub of unsubs) unsub();
	unsubs = [];
	roleData.clear();
}

export function getAdminState(): Readonly<AdminsState> {
	return state;
}
