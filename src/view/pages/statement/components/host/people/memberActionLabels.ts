import type { ButtonVariant } from '@/view/components/atomic/atoms/Button';
import { MemberAction } from './membersLogic';

/** i18n key and button look of each row action (UX 3.4, design §3.10). */
export const MEMBER_ACTION_LABEL: Record<MemberAction, string> = {
	makeHost: 'people.makeHost',
	removeHost: 'people.removeHost',
	block: 'people.block',
	unblock: 'people.unblock',
	letIn: 'people.letIn',
	decline: 'people.decline',
};

export const MEMBER_ACTION_VARIANT: Record<MemberAction, ButtonVariant> = {
	makeHost: 'secondary',
	removeHost: 'secondary',
	block: 'reject',
	unblock: 'secondary',
	letIn: 'approve',
	decline: 'secondary',
};
