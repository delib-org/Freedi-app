import { FC } from 'react';
import { Statement, CompoundPhase } from '@freedi/shared-types';
import { useCompoundPhase } from '@/controllers/hooks/compoundQuestion/useCompoundPhase';
import { lockCompoundTitle } from '@/controllers/db/compoundQuestion/lockStatement';
import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface PhaseAdminControlsProps {
	statement: Statement;
}

const PhaseAdminControls: FC<PhaseAdminControlsProps> = ({ statement }) => {
	const { t } = useTranslation();
	const { currentPhase, canAdvance, canRevert, isAdmin, advancePhase, revertPhase } =
		useCompoundPhase(statement);
	const creator = useSelector(creatorSelector);

	if (!isAdmin) return null;

	const isTitleLocked = !!statement.questionSettings?.compoundSettings?.lockedTitle;

	const handleLockTitle = async () => {
		if (!creator?.uid) return;
		await lockCompoundTitle({ statement, userId: creator.uid });
	};

	return (
		<div className="phase-admin-controls">
			{currentPhase === CompoundPhase.defineQuestion && !isTitleLocked && (
				<button
					className="phase-admin-controls__btn phase-admin-controls__btn--lock"
					onClick={handleLockTitle}
				>
					{t('Lock Title')}
				</button>
			)}

			{canRevert && (
				<button
					className="phase-admin-controls__btn phase-admin-controls__btn--revert"
					onClick={() => revertPhase()}
				>
					{t('Previous Phase')}
				</button>
			)}

			{canAdvance && (
				<button
					className="phase-admin-controls__btn phase-admin-controls__btn--advance"
					onClick={() => advancePhase()}
				>
					{t('Next Phase')}
				</button>
			)}
		</div>
	);
};

export default PhaseAdminControls;
