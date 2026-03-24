import { FC, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Statement, CompoundPhase, StatementType } from '@freedi/shared-types';
import { useCompoundPhase } from '@/controllers/hooks/compoundQuestion/useCompoundPhase';
import { lockCompoundTitle } from '@/controllers/db/compoundQuestion/lockStatement';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface PhaseAdminControlsProps {
	statement: Statement;
}

const PhaseAdminControls: FC<PhaseAdminControlsProps> = ({ statement }) => {
	const { t } = useTranslation();
	const { currentPhase, canAdvance, canRevert, isAdmin, advancePhase, revertPhase } =
		useCompoundPhase(statement);
	const creator = useSelector(creatorSelector);

	// Get top consensus option from title discussion
	const titleDiscussionId = statement.questionSettings?.compoundSettings?.titleDiscussionId ?? '';
	const titleDiscussionOptions = useSelector(statementSubsSelector(titleDiscussionId));
	const topTitleOption = useMemo(() => {
		const options = titleDiscussionOptions.filter(
			(s: Statement) => s.statementType === StatementType.option,
		);
		if (options.length === 0) return null;

		return options.reduce((best: Statement, current: Statement) =>
			(current.consensus ?? 0) > (best.consensus ?? 0) ? current : best,
		);
	}, [titleDiscussionOptions]);

	if (!isAdmin) return null;

	const isTitleLocked = !!statement.questionSettings?.compoundSettings?.lockedTitle;

	const handleLockTitle = async () => {
		if (!creator?.uid) return;
		const titleText = topTitleOption?.statement;

		const confirmed = window.confirm(
			titleText
				? `${t('Lock title as')}: "${titleText}"?`
				: t('Are you sure you want to lock the current title?'),
		);
		if (!confirmed) return;

		await lockCompoundTitle({ statement, userId: creator.uid, titleText });
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
