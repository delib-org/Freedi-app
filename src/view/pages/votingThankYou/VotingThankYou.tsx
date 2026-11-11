import { FC, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import {
	setStatement,
	statementOptionsSelector,
	statementSelector,
} from '@/redux/statements/statementsSlice';
import { logError } from '@/utils/errorHandling';
import { getNextStepKey } from './votingThankYouLogic';
import styles from './VotingThankYou.module.scss';

const VotingThankYou: FC = () => {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const dispatch = useDispatch();
	const { statementId } = useParams();
	const statement = useSelector(statementSelector(statementId));
	const optionsSelect = useMemo(() => statementOptionsSelector(statementId), [statementId]);
	const loadedAnswers = useSelector(optionsSelect).length;
	const isStatementLoaded = statement !== undefined;

	useEffect(() => {
		if (!statementId || isStatementLoaded) return;

		const load = async (): Promise<void> => {
			try {
				const loaded = await getStatementFromDB(statementId);
				if (loaded) dispatch(setStatement(loaded));
			} catch (error) {
				logError(error, { operation: 'VotingThankYou.load', statementId });
			}
		};

		void load();
	}, [statementId, isStatementLoaded, dispatch]);

	const nextStepKey = getNextStepKey({
		statement,
		answerCount: Math.max(loadedAnswers, statement?.numberOfOptions ?? 0),
		now: Date.now(),
	});

	return (
		<div className={styles.container}>
			<div className={styles.card}>
				<div className={styles.iconContainer}>
					<svg
						className={styles.successIcon}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
				</div>

				<h1 className={styles.heading}>{t('Thank you for your vote')}</h1>

				<p className={styles.nextStep} data-testid="thank-you-next-step">
					{t(nextStepKey)}
				</p>

				<p className={styles.description}>
					{t(
						'The Deliberative Democracy Institute developing apps for deliberative democracy in communities and cities.',
					)}
				</p>

				<div className={styles.websiteInfo}>
					<p className={styles.websiteText}>{t('For more information, visit our website')}:</p>
					<a
						href="https://delib.org"
						target="_blank"
						rel="noopener noreferrer"
						className={styles.websiteLink}
					>
						delib.org
					</a>
				</div>

				<div className={styles.actions}>
					{statementId && (
						<button
							type="button"
							onClick={() => navigate(`/statement/${statementId}`)}
							className={styles.homeButton}
						>
							{t('Back to the question')}
						</button>
					)}
					<button
						type="button"
						onClick={() => navigate('/home')}
						className={styles.secondaryButton}
					>
						{t('Go to Home')}
					</button>
				</div>
			</div>
		</div>
	);
};

export default VotingThankYou;
