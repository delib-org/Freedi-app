import { approveMembership } from '@/controllers/db/membership/setMembership';
import { WaitingMember } from '@freedi/shared-types';

export function approveSingle(wait: WaitingMember, onComplete: () => void) {
	approveMembership(wait, true);
	onComplete();
}

export function rejectSingle(wait: WaitingMember, onComplete: () => void) {
	if (window.confirm('Are you sure you want to reject this member?')) {
		approveMembership(wait, false);
		onComplete();
	}
}

export function approveMultiple(members: WaitingMember[]) {
	members.forEach((member) => approveMembership(member, true));
}

export function rejectMultiple(members: WaitingMember[]) {
	if (window.confirm('Are you sure you want to reject all selected members?')) {
		members.forEach((member) => approveMembership(member, false));
	}
}
