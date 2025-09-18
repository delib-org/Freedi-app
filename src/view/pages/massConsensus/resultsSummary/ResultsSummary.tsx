import React, { FC, useEffect, useMemo } from 'react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useHeader } from '../headerMassConsensus/HeaderContext';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import useResultsSummary from './ResultsSummaryVM';
import ResultsSubComponents from './components/ResultsSubComponents';
import Loader from '@/view/components/loaders/Loader';
import { Statement } from 'delib-npm';
import styles from './ResultsSummary.module.scss';
import { calculateAgreement, getAgreementColor } from '@/utils/consensusColors';

// Component to render a single suggestion card with results
const ResultCard: FC<{
	statement: Statement;
	isUserStatement: boolean;
}> = ({ statement, isUserStatement }) => {
	const { t, dir } = useUserConfig();

	// Calculate agreement score using the same logic as Triangle
	const { sumPro = 0, sumCon = 0, numberOfEvaluators = 1 } = statement.evaluation || {};
	const agreement = calculateAgreement(sumPro, sumCon, numberOfEvaluators);

	// Get the appropriate color variable based on agreement
	const colorVariable = getAgreementColor(agreement);

	// Combine classes
	const cardClasses = [
		styles.resultCard,
		isUserStatement ? styles['resultCard--user'] : ''
	].filter(Boolean).join(' ');

	// Style object with dynamic border color
	const cardStyle: React.CSSProperties = {
		direction: dir,
		[dir === 'rtl' ? 'borderRightColor' : 'borderLeftColor']: `var(${colorVariable})`,
		[dir === 'rtl' ? 'borderRightWidth' : 'borderLeftWidth']: '5px',
		[dir === 'rtl' ? 'borderRightStyle' : 'borderLeftStyle']: 'solid',
	};

	return (
		<div
			className={cardClasses}
			style={cardStyle}
		>
			{isUserStatement && (
				<div className={styles.resultCard__userBadge}>
					{t('Your suggestion')}
				</div>
			)}
			<div className={styles.resultCard__content}>
				<div className={styles.resultCard__text}>
					<h3 className={styles.resultCard__title}>{statement.statement}</h3>
					{statement.description && (
						<p className={styles.resultCard__description}>{statement.description}</p>
					)}
				</div>
			</div>
			<div className={styles.resultCard__metrics}>
				<ResultsSubComponents
					statement={statement}
				/>
			</div>
		</div>
	);
};

const ResultsSummary: FC = () => {
	const { t, dir } = useUserConfig();
	const { setHeader } = useHeader();
	const {
		statement,
		sortedStatements,
		userStatements,
		loadingStatements,
		totalParticipants,
		navigateToThankYou,
	} = useResultsSummary();

	useEffect(() => {
		setHeader({
			title: t('Summary'),
			backToApp: false,
			isIntro: false,
		});
	}, []);

	// Create a Set of user statement IDs for quick lookup
	const userStatementIds = useMemo(
		() => new Set(userStatements.map(s => s.statementId)),
		[userStatements]
	);

	return (
		<div className={styles.resultsSummary} style={{ direction: dir }}>
			<div className={styles.resultsSummary__header}>
				<TitleMassConsensus title={t('Summary')} />
				{totalParticipants > 0 && (
					<div className={styles.resultsSummary__participants}>
						<span className={styles.participantCount}>{totalParticipants}</span>
						<span className={styles.participantLabel}>{t('Participants')}</span>
					</div>
				)}
			</div>

			{statement && (
				<div className={styles.resultsSummary__question}>
					<h2>{t('Question')}: {statement.statement}</h2>
				</div>
			)}

			<div className={styles.resultsSummary__content}>
				{loadingStatements ? (
					<div className={styles.loaderContainer}>
						<Loader />
						<p>{t('Loading results...')}</p>
					</div>
				) : sortedStatements.length === 0 ? (
					<div className={styles.emptyState}>
						<p>{t('No suggestions to display')}</p>
					</div>
				) : (
					<div className={styles.resultsList}>
						{sortedStatements.map((subStatement) => (
							<ResultCard
								key={subStatement.statementId}
								statement={subStatement}
								isUserStatement={userStatementIds.has(subStatement.statementId)}
							/>
						))}
					</div>
				)}
			</div>

			<FooterMassConsensus
				isNextActive={true}
				canSkip={false}
				onNext={navigateToThankYou}
				blockNavigation={false}
			/>
		</div>
	);
};

export default ResultsSummary;