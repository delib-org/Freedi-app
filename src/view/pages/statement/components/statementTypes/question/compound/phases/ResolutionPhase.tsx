import { FC, useContext, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useCompoundPhase } from '@/controllers/hooks/compoundQuestion/useCompoundPhase';
import { useCompoundSolutions } from '@/controllers/hooks/compoundQuestion/useCompoundSolutions';
import { sendSolutionToSign } from '@/controllers/db/compoundQuestion/sendToSign';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from '../CompoundQuestion.module.scss';

const ResolutionPhase: FC = () => {
	const { t } = useTranslation();
	const { statement } = useContext(StatementContext);
	const { isAdmin } = useCompoundPhase(statement);
	const { solutions } = useCompoundSolutions(statement);
	const [sendingId, setSendingId] = useState<string | null>(null);
	const signDocumentIds = statement?.questionSettings?.compoundSettings?.signDocumentIds ?? [];

	const isSentToSign = (solutionId: string): boolean => {
		return signDocumentIds.some((doc) => doc.solutionId === solutionId);
	};

	const handleSendToSign = async (solution: Statement) => {
		if (!statement || sendingId) return;
		setSendingId(solution.statementId);
		await sendSolutionToSign({ solution, compoundStatement: statement });
		setSendingId(null);
	};

	return (
		<div className={styles.phase}>
			{solutions.length > 0 ? (
				<div className={styles.solutionsList}>
					{solutions.map((solution) => {
						const sentToSign = isSentToSign(solution.statementId);

						return (
							<div key={solution.statementId} className={styles.solutionCard}>
								<div className={styles.solutionContent}>
									<h4 className={styles.solutionTitle}>{solution.statement}</h4>
									<span className={styles.solutionConsensus}>
										{t('Consensus')}: {Math.round((solution.consensus ?? 0) * 100)}%
									</span>
								</div>
								<div className={styles.solutionActions}>
									{sentToSign ? (
										<span className={styles.sentBadge}>{t('Sent to Sign')}</span>
									) : (
										isAdmin && (
											<button
												className="btn btn--primary"
												onClick={() => handleSendToSign(solution)}
												disabled={sendingId === solution.statementId}
											>
												{sendingId === solution.statementId ? t('Sending...') : t('Send to Sign')}
											</button>
										)
									)}
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<p className={styles.emptyMessage}>{t('No solutions available yet')}</p>
			)}
		</div>
	);
};

export default ResolutionPhase;
