import { FC } from 'react';
import { Statement } from '@freedi/shared-types';
import { useCompoundPhase } from '@/controllers/hooks/compoundQuestion/useCompoundPhase';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface PhaseAdminControlsProps {
	statement: Statement;
}

const PhaseAdminControls: FC<PhaseAdminControlsProps> = ({ statement }) => {
	const { t } = useTranslation();
	const { canAdvance, canRevert, isAdmin, advancePhase, revertPhase } =
		useCompoundPhase(statement);

	if (!isAdmin) return null;

	return (
		<div className="phase-admin-controls">
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
