import m from 'mithril';
import type { ClassCopySeatingResponse } from '@freedi/shared-types';
import {
	classCloseRegistration,
	classConnectRegistration,
	classCopySeating,
	classDisconnectRegistration,
} from '@/lib/classroom/api';
import { refusalKeyOf, registrationReasonOf } from '@/lib/classroom/registrationLogic';
import { t } from '@/lib/i18n';
import { act, consoleState } from './consoleState';

/**
 * The teacher's actions on the lesson's registration (IA tables-class-bridge
 * 5.3), each through `act` so a refusal becomes a plain-words line with a retry
 * and never a crash.
 */

/** What the last "הבאת השולחנות" brought, shown under the Tables step's button. */
export const copyResult: { mainId: string; value: ClassCopySeatingResponse | null } = {
	mainId: '',
	value: null,
};

/** The refusal's own sentence when the screens name it, else the generic failure line. */
function explainRefusal(error: unknown): string | undefined {
	const key = refusalKeyOf(registrationReasonOf(error));

	return key ? t(key) : undefined;
}

export async function connectRegistration(
	mainId: string,
	tableAssignmentId: string,
): Promise<boolean> {
	return act(
		`registration:connect:${tableAssignmentId}`,
		t('console.register_ahead.connect'),
		() => classConnectRegistration({ mainId, tableAssignmentId }),
		explainRefusal,
	);
}

export async function disconnectRegistration(mainId: string): Promise<boolean> {
	return act(
		'registration:disconnect',
		t('console.register_ahead.remove'),
		() => classDisconnectRegistration({ mainId }),
		explainRefusal,
	);
}

export async function closeRegistration(mainId: string): Promise<boolean> {
	return act(
		'registration:close',
		t('console.register_ahead.close'),
		() => classCloseRegistration({ mainId }),
		explainRefusal,
	);
}

/** "הבאת השולחנות מההרשמה" (`replace`: "עדכון מההרשמה", asked first by the caller). */
export async function copySeating(mainId: string, replace: boolean): Promise<boolean> {
	if (consoleState.held) return false;

	return act(
		`registration:copy`,
		t(replace ? 'console.copy_seating.again' : 'console.copy_seating'),
		async () => {
			copyResult.value = await classCopySeating({ mainId, replace });
			copyResult.mainId = mainId;
			m.redraw();
		},
		explainRefusal,
	);
}
