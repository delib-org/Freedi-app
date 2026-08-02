import { FC, useState } from 'react';
import styles from './SubGroupCard.module.scss';
import { Link, NavLink, useNavigate } from 'react-router';
import useSubGroupCard from './SubGroupCardVM';
import { EvaluationUI, Statement, StatementType } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useRouteTargets } from '@/controllers/statementRouter/useRouteTargets';
import Menu from '@/view/components/menu/Menu';
import MenuOption from '@/view/components/menu/MenuOption';
import RoutePicker from '@/view/components/statementRouter/RoutePicker/RoutePicker';
import StatementChatMore from '@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore';
import { logError } from '@/utils/errorHandling';
import { ArrowUpRight } from 'lucide-react';

interface Props {
	statement: Statement;
}

const SubGroupCard: FC<Props> = ({ statement }) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { Icon, backgroundColor, text } = useSubGroupCard(statement);
	const routeTargets = useRouteTargets(statement);
	const [isCardMenuOpen, setIsCardMenuOpen] = useState(false);
	const [showRoutePicker, setShowRoutePicker] = useState(false);

	try {
		const { results = [], topVotedOption, evaluationSettings, hide } = statement;
		const evaluationUI = evaluationSettings?.evaluationUI;
		const isDecidedByVoting = evaluationUI === EvaluationUI.voting;
		const shouldSeeVoting = isDecidedByVoting && topVotedOption;
		const answerLabel =
			results && (results.length > 1 || !isDecidedByVoting) ? t('Answers') : t('Answer');

		return (
			<div
				className={styles.subGroupCard}
				style={{
					border: `1px solid ${backgroundColor}`,
					borderLeft: `5px solid ${backgroundColor}`,
					opacity: hide ? 0.5 : 1,
				}}
			>
				<Link to={`/statement/${statement.statementId}`} className={styles.type}>
					<div className={styles.text}>{text}</div>{' '}
					<div className={styles.iconWrapper} style={{ color: backgroundColor }}>
						{Icon}
						<div onClick={(e) => e.stopPropagation()}>
							<StatementChatMore statement={statement} onlyCircle={true} />
						</div>
						{routeTargets.length > 0 && (
							<div
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
								}}
							>
								<Menu
									setIsOpen={setIsCardMenuOpen}
									isMenuOpen={isCardMenuOpen}
									iconColor={backgroundColor}
									isCardMenu={true}
									isNavMenu={false}
								>
									<MenuOption
										label={t('Continue in…')}
										icon={<ArrowUpRight size={20} />}
										onOptionClick={() => {
											setShowRoutePicker(true);
											setIsCardMenuOpen(false);
										}}
									/>
								</Menu>
							</div>
						)}
					</div>
				</Link>
				{routeTargets.length > 0 && (
					<RoutePicker
						statement={statement}
						isOpen={showRoutePicker}
						onClose={() => setShowRoutePicker(false)}
					/>
				)}
				{shouldSeeVoting ? (
					<NavLink to={`/statement/${topVotedOption.statementId}/main`}>
						{topVotedOption.statement}
					</NavLink>
				) : (
					statement.statementType === StatementType.question && (
						<div className={styles.results}>
							{results.length !== 0 && (
								<NavLink to={`/statement/${results[0].parentId}/main`}>
									<p>{answerLabel}:</p>
								</NavLink>
							)}
							<ul>
								{results.map((result) => (
									<li key={result.statementId}>
										<NavLink to={`/statement/${result.statementId}/main`}>
											{result.statement}
										</NavLink>
									</li>
								))}
							</ul>
						</div>
					)
				)}
				{statement.statementType === StatementType.question && (
					<button
						className={styles.diveIn}
						onClick={() => navigate(`/statement/${statement.statementId}`)}
					>
						<ArrowUpRight size={16} />
						{t('Drill down')}
					</button>
				)}
			</div>
		);
	} catch (err) {
		logError(err, { operation: 'subGroupCard.SubGroupCard.unknown' });
	}
};

export default SubGroupCard;
