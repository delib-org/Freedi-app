import { useCallback, useContext } from 'react';
import { Statement, CompoundPhase, Role } from '@freedi/shared-types';
import { setCompoundPhase } from '@/controllers/db/compoundQuestion/setCompoundPhase';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';

const PHASE_ORDER: CompoundPhase[] = [
	CompoundPhase.defineQuestion,
	CompoundPhase.subQuestions,
	CompoundPhase.findSolutions,
	CompoundPhase.resolution,
];

interface UseCompoundPhaseReturn {
	currentPhase: CompoundPhase;
	phaseIndex: number;
	canAdvance: boolean;
	canRevert: boolean;
	isAdmin: boolean;
	advancePhase: (reason?: string) => Promise<void>;
	revertPhase: (reason?: string) => Promise<void>;
	setPhase: (phase: CompoundPhase, reason?: string) => Promise<void>;
}

export function useCompoundPhase(statement: Statement | undefined): UseCompoundPhaseReturn {
	const { role } = useContext(StatementContext);
	const creator = useSelector(creatorSelector);
	const isAdmin = role === Role.admin || role === Role.creator;

	const currentPhase =
		statement?.questionSettings?.compoundSettings?.currentPhase ?? CompoundPhase.defineQuestion;

	const phaseIndex = PHASE_ORDER.indexOf(currentPhase);
	const canAdvance = phaseIndex < PHASE_ORDER.length - 1;
	const canRevert = phaseIndex > 0;

	const setPhase = useCallback(
		async (phase: CompoundPhase, reason?: string) => {
			if (!statement || !creator?.uid) return;
			await setCompoundPhase({
				statement,
				newPhase: phase,
				userId: creator.uid,
				reason,
			});
		},
		[statement, creator?.uid],
	);

	const advancePhase = useCallback(
		async (reason?: string) => {
			if (!canAdvance) return;
			const nextPhase = PHASE_ORDER[phaseIndex + 1];
			await setPhase(nextPhase, reason);
		},
		[canAdvance, phaseIndex, setPhase],
	);

	const revertPhase = useCallback(
		async (reason?: string) => {
			if (!canRevert) return;
			const prevPhase = PHASE_ORDER[phaseIndex - 1];
			await setPhase(prevPhase, reason);
		},
		[canRevert, phaseIndex, setPhase],
	);

	return {
		currentPhase,
		phaseIndex,
		canAdvance,
		canRevert,
		isAdmin,
		advancePhase,
		revertPhase,
		setPhase,
	};
}
