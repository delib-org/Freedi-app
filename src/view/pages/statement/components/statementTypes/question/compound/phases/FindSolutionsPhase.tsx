import { FC, useContext, useState } from 'react';
import { CompoundPhase } from '@freedi/shared-types';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useCompoundPhase } from '@/controllers/hooks/compoundQuestion/useCompoundPhase';
import { useCompoundSolutions } from '@/controllers/hooks/compoundQuestion/useCompoundSolutions';
import { createSolutionQuestion } from '@/controllers/db/compoundQuestion/createSolutionQuestion';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import StagePage from '../../../stage/StagePage';
import styles from '../CompoundQuestion.module.scss';

const FindSolutionsPhase: FC = () => {
	const { t } = useTranslation();
	const { statement } = useContext(StatementContext);
	const { currentPhase, isAdmin } = useCompoundPhase(statement);
	const { hasSolutionQuestion } = useCompoundSolutions(statement);
	const [isCreating, setIsCreating] = useState(false);

	const isActive = currentPhase === CompoundPhase.findSolutions;
	const lockedTitle = statement?.questionSettings?.compoundSettings?.lockedTitle?.lockedText;

	const handleCreateSolutionQuestion = async () => {
		if (!statement || isCreating) return;
		setIsCreating(true);
		const title = lockedTitle ? t('Solutions for') + ': ' + lockedTitle : t('Proposed Solutions');
		await createSolutionQuestion({ parentStatement: statement, title });
		setIsCreating(false);
	};

	return (
		<div className={styles.phase}>
			<h3 className={styles.phaseTitle}>{t('Find Solutions')}</h3>
			<p className={styles.phaseDescription}>
				{t('Propose and evaluate solutions to the defined question')}
			</p>

			{!hasSolutionQuestion && isAdmin && isActive && (
				<div className={styles.addButton}>
					<button
						className="btn btn--primary"
						onClick={handleCreateSolutionQuestion}
						disabled={isCreating}
					>
						{isCreating ? t('Creating...') : t('Create Solution Question')}
					</button>
				</div>
			)}

			{hasSolutionQuestion && isActive && <StagePage showStageTitle={false} showBottomNav={true} />}

			{!hasSolutionQuestion && !isActive && (
				<p className={styles.emptyMessage}>{t('Solution question not yet created')}</p>
			)}
		</div>
	);
};

export default FindSolutionsPhase;
