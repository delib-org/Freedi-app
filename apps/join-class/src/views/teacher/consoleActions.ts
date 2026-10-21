import type { ClassTableAction, Statement, TableStep } from '@freedi/shared-types';
import {
	classAddNoDevice,
	classAllTablesTo,
	classAssignTables,
	classCloseBallot,
	classFreezeBallot,
	classMoveStudent,
	classTableStep,
} from '@/lib/classroom/api';
import type { DropTarget } from '@/lib/classroom/dragReducer';
import { setLessonStep } from '@/lib/lesson';
import { setOptionFlag, setQuestionSetting } from '@/lib/store';
import { t } from '@/lib/i18n';
import { act, consoleState } from './consoleState';

/**
 * Every teacher action of the console, each through `act` so a failure (the
 * classroom callables may not be deployed yet) becomes an inline error with a
 * retry and never a crash.
 */

/** roundPhase is a class-only key, not in the typed StatementSettings yet. */
const PLENUM_PATCH = {
	statementSettings: { roundPhase: 'improve' },
} as unknown as Partial<Statement>;

export function goToStep(mainId: string, index: number): Promise<boolean> {
	return act(`step:${index}`, t('console.act_step'), () => setLessonStep(mainId, index));
}

export function assignTables(mainId: string, replace: boolean): Promise<boolean> {
	return act('assign', t(replace ? 'console.resplit' : 'console.split'), () =>
		classAssignTables({ mainId, replace }),
	);
}

export function allTablesTo(mainId: string, step: TableStep): Promise<boolean> {
	return act(`all:${step}`, t('console.all_tables_rate'), () => classAllTablesTo({ mainId, step }));
}

export function startPlenum(challengeId: string): Promise<boolean> {
	return act('plenum', t('console.plenum'), () => setQuestionSetting(challengeId, PLENUM_PATCH));
}

export function freezeBallot(mainId: string): Promise<boolean> {
	return act('freeze', t('console.freeze'), () => classFreezeBallot({ mainId }));
}

export function closeBallot(mainId: string): Promise<boolean> {
	return act('close', t('console.close_vote'), () => classCloseBallot({ mainId }));
}

export function moveStudent(mainId: string, uid: string, toTable: DropTarget): Promise<boolean> {
	return act(`move:${uid}`, t('console.move'), async () => {
		await classMoveStudent({ mainId, uid, toTable });
		consoleState.announce = t('console.moved', { table: toTable ?? t('console.unplaced_name') });
	});
}

export function addNoDevice(mainId: string, n: number, name: string): Promise<boolean> {
	return act(`nodevice:${n}`, t('console.add_no_device'), () =>
		classAddNoDevice({ mainId, n, name: name.trim() }),
	);
}

export function tableAction(tableId: string, action: ClassTableAction): Promise<boolean> {
	return act(`table:${tableId}:${action.action}`, t('console.table_action'), () =>
		classTableStep({ tableId, ...action }),
	);
}

export function setHidden(optionId: string, hidden: boolean): Promise<boolean> {
	return act(`hide:${optionId}`, t(hidden ? 'console.hide' : 'console.restore'), () =>
		setOptionFlag(optionId, 'hide', hidden),
	);
}
