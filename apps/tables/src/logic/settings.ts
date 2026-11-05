import {
	TABLE_ASSIGNMENT_BALANCE_TOLERANCE_DEFAULT,
	TABLE_ASSIGNMENT_TABLE_SIZE_DEFAULT,
	TABLE_ASSIGNMENT_TABLE_SIZE_MAX,
	TABLE_ASSIGNMENT_TABLE_SIZE_MIN,
	TABLE_ASSIGNMENT_TITLE_MAX_LENGTH,
} from '@freedi/shared-types';
import type { TableAssignmentSettings, TablesSaveSettingsRequest } from '@freedi/shared-types';

/** Settings form values; numbers stay strings while typed. */
export interface SettingsDraft {
	tableSize: string;
	balanceTolerance: string;
	positionEnabled: boolean;
	positionLabel: string;
	poleA: string;
	poleB: string;
}

export type SettingsField = 'tableSize' | 'balanceTolerance' | 'positionLabel' | 'poleA' | 'poleB';

export function draftFromSettings(settings: TableAssignmentSettings): SettingsDraft {
	return {
		tableSize: String(settings.tableSize ?? TABLE_ASSIGNMENT_TABLE_SIZE_DEFAULT),
		balanceTolerance: String(
			settings.balanceTolerance ?? TABLE_ASSIGNMENT_BALANCE_TOLERANCE_DEFAULT,
		),
		positionEnabled: !!settings.positionQuestion,
		positionLabel: settings.positionQuestion?.label ?? '',
		poleA: settings.positionQuestion?.poleA ?? '',
		poleB: settings.positionQuestion?.poleB ?? '',
	};
}

function validLabel(text: string): boolean {
	const trimmed = text.trim();

	return trimmed.length > 0 && trimmed.length <= TABLE_ASSIGNMENT_TITLE_MAX_LENGTH;
}

/** Fields that fail validation, so the screen can show the error next to each. */
export function settingsErrors(draft: SettingsDraft): SettingsField[] {
	const errors: SettingsField[] = [];
	const size = Number(draft.tableSize);
	const tolerance = Number(draft.balanceTolerance);

	if (
		draft.tableSize.trim() === '' ||
		!Number.isInteger(size) ||
		size < TABLE_ASSIGNMENT_TABLE_SIZE_MIN ||
		size > TABLE_ASSIGNMENT_TABLE_SIZE_MAX
	) {
		errors.push('tableSize');
	}
	if (draft.balanceTolerance.trim() === '' || !Number.isFinite(tolerance) || tolerance < 0) {
		errors.push('balanceTolerance');
	}
	if (draft.positionEnabled) {
		if (!validLabel(draft.positionLabel)) errors.push('positionLabel');
		if (!validLabel(draft.poleA)) errors.push('poleA');
		if (!validLabel(draft.poleB)) errors.push('poleB');
	}

	return errors;
}

/** The wire request; a disabled position question is sent as `null` (removes it). */
export function draftToRequest(sessionId: string, draft: SettingsDraft): TablesSaveSettingsRequest {
	return {
		sessionId,
		tableSize: Number(draft.tableSize),
		balanceTolerance: Number(draft.balanceTolerance),
		positionQuestion: draft.positionEnabled
			? {
					label: draft.positionLabel.trim(),
					poleA: draft.poleA.trim(),
					poleB: draft.poleB.trim(),
				}
			: null,
	};
}
