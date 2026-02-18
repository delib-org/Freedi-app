import React, { FC, useState, useRef, useEffect } from 'react';
import styles from './StageCard.module.scss';
import { NavLink } from 'react-router';
import { Statement, SimpleStatement, EvaluationUI } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import StatementChatMore from '../../../../chat/components/statementChatMore/StatementChatMore';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import MinusIcon from '@/assets/icons/minusIcon.svg?react';

interface Props {
	statement: Statement;
	isDescription?: boolean;
	isSuggestions?: boolean;
}

const StageCard: FC<Props> = ({ statement, isDescription, isSuggestions }) => {
	const { dir, t } = useTranslation();
	const [expanded, setExpanded] = useState(true);
	const contentRef = useRef<HTMLDivElement>(null);
	const [contentHeight, setContentHeight] = useState(0);

	const isVoting = statement.evaluationSettings?.evaluationUI === EvaluationUI.voting;

	const votingResults: SimpleStatement | undefined = statement.topVotedOption;
	const chosen: SimpleStatement[] = isVoting && votingResults ? [votingResults] : statement.results;

	const getTitle = () => {
		if (isDescription) return 'Description';
		if (isSuggestions) return 'Suggestions';

		return statement.statement;
	};

	const title = getTitle();

	const handleCardClick = (e: React.MouseEvent | React.TouchEvent) => {
		e.preventDefault();
		setExpanded(!expanded);
	};

	useEffect(() => {
		if (contentRef.current) {
			setContentHeight(expanded ? contentRef.current.scrollHeight : 0);
		}
	}, [expanded, chosen]);

	return (
		<div dir={dir} className={styles.card}>
			{' '}
			<button
				className={`${styles.title} ${styles.item}`}
				style={expanded ? { backgroundColor: 'transparent' } : {}}
				onClick={handleCardClick}
			>
				<div className={`${styles.notification}`}>
					<StatementChatMore statement={statement} onlyCircle={true} asButton={false} />
				</div>
				<p>
					{t(title)} {isSuggestions && `: ${statement.statement}`}
				</p>
				{expanded ? <MinusIcon /> : <PlusIcon />}
			</button>
			<div
				ref={contentRef}
				className={styles.previewContent}
				style={{
					maxHeight: `${contentHeight}px`,
					overflow: 'hidden',
					transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
					opacity: expanded ? 1 : 0,
				}}
			>
				{chosen.map((opt: SimpleStatement) => (
					<div key={opt.statementId} className={`${styles.item} ${styles.suggestions}`}>
						<p className={styles.suggestionTitle}>{opt.statement}</p>
						{opt.description && <p>{opt.description}</p>}
					</div>
				))}
				{expanded && (
					<NavLink
						to={`/stage/${statement.statementId}`}
						state={{ from: window.location.pathname }}
					>
						<Button buttonType={ButtonType.SECONDARY} text={t('Enter sub-question')} />
					</NavLink>
				)}
			</div>
		</div>
	);
};

export default StageCard;
