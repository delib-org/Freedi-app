import OptionImprovement from '@/view/components/atomic/organisms/ThinkingSpace/OptionImprovement';
import React, { useContext, useMemo, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router';
import { QuestionType, Role, StatementType } from '@freedi/shared-types';

import { StatementContext } from '../../StatementCont';
import styles from './Switch.module.scss';
import SwitchScreen from './SwitchScreen';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { isStatementTypeAllowedAsChildren } from '@/controllers/general/helpers';
import OnlineUsers from '../nav/online/OnlineUsers';

import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useHeaderHideOnScroll } from '@/controllers/hooks/useHeaderHideOnScroll';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import { MessageSquare, Lightbulb, HelpCircle } from 'lucide-react';
import StatementBody from '@/view/components/atomic/molecules/StatementBody/StatementBody';
import TopAnswersPanel from '../topAnswers/TopAnswersPanel';
import ConversationWelcome from '@/view/components/atomic/organisms/ThinkingSpace/ConversationWelcome';
import { mapViews } from '@/view/components/atomic/organisms/ThinkingSpace/MapExplorer';
import AnswersCounter from '../questionScreen/AnswersCounter';
import AddAnswerFab from '../questionScreen/AddAnswerFab';
import { AnswerFabContext, useQuestionScreenData } from '../questionScreen/useQuestionScreenData';
import { isResultsOrMapsView, QuestionView, tabOfView } from '../questionScreen/questionTabs';
import { QUESTION_TABPANEL_ID } from '../header/StatementHeader';

interface SwitchProps {
	activeView: string;
}

const MAIN_SCREENS = ['main', 'chat', 'options', 'questions'];

const Switch: React.FC<SwitchProps> = ({ activeView }) => {
	const { t } = useTranslation();
	const { statement } = useContext(StatementContext);
	const { role } = useAuthorization(statement?.statementId);
	const data = useQuestionScreenData(statement);

	const mainRef = useRef<HTMLElement>(null);
	useHeaderHideOnScroll(mainRef);

	// Map screens are canvases with their own full-screen chrome: they use the
	// full window width instead of the reading column.
	const { screen } = useParams();
	const isMapScreen = mapViews.some((view) => view.id === screen);
	const onMainScreen = !screen || MAIN_SCREENS.includes(screen);

	useEffect(() => {
		if (activeView !== 'chat') mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
	}, [activeView, statement?.statementId, screen]);

	const subsSelect = useMemo(
		() => statementSubsSelector(statement?.statementId),
		[statement?.statementId],
	);
	const allSubs = useSelector(subsSelect);

	const isAdmin = role === Role.admin || role === Role.creator;
	const isQuestion = statement?.statementType === StatementType.question;
	const isCompound =
		isQuestion && statement?.questionSettings?.questionType === QuestionType.compound;

	// The Top Answers panel governs this statement's answers list, so it belongs
	// wherever that list can exist — the same test that decides whether the
	// Answers tab is offered at all.
	const canHaveAnswers = statement
		? isStatementTypeAllowedAsChildren(statement, StatementType.option)
		: false;

	const isTabContentView = isResultsOrMapsView(activeView);
	const showReadingHeader = !isMapScreen && !isTabContentView;
	const onAnswersTab = onMainScreen && isQuestion && !isCompound && activeView === 'options';
	const showFab = onAnswersTab && data.canAddAnswer && !!statement;
	// A question's framing text lives on its Background tab now.
	const showBody = showReadingHeader && !!statement && !isQuestion;

	return (
		<main
			ref={mainRef}
			className={`page__main ${isMapScreen ? 'page__main--flush' : styles.questionMain}`}
		>
			<div
				className={styles.panel}
				{...(onMainScreen && !isMapScreen
					? {
							role: 'tabpanel',
							id: QUESTION_TABPANEL_ID,
							'aria-labelledby': `question-tab-${tabOfView(activeView as QuestionView)}`,
						}
					: {})}
			>
				{showReadingHeader && activeView === 'chat' && <ConversationWelcome t={t} compact />}
				{showReadingHeader && <OnlineUsers statementId={statement?.statementId} />}
				{showBody && statement && <StatementBody host={statement} canEdit={isAdmin} />}
				{showReadingHeader && allSubs.length === 0 && activeView === 'chat' && (
					<div className={styles.onboarding}>
						<div className={styles.onboarding__step}>
							<span className={styles.onboarding__icon}>
								<MessageSquare size={20} />
							</span>
							<div className={styles.onboarding__content}>
								<h3 className={styles.onboarding__stepTitle}>
									{t('questionOnboarding.startConversation')}
								</h3>
								<p className={styles.onboarding__stepText}>
									{t('questionOnboarding.startConversationDesc')}
								</p>
							</div>
						</div>
						<div className={styles.onboarding__step}>
							<span className={styles.onboarding__icon}>
								<Lightbulb size={20} />
							</span>
							<div className={styles.onboarding__content}>
								<h3 className={styles.onboarding__stepTitle}>
									{t('questionOnboarding.addSolutions')}
								</h3>
								<p className={styles.onboarding__stepText}>
									{t('questionOnboarding.addSolutionsDesc')}
								</p>
							</div>
						</div>
						<div className={styles.onboarding__step}>
							<span className={styles.onboarding__icon}>
								<HelpCircle size={20} />
							</span>
							<div className={styles.onboarding__content}>
								<h3 className={styles.onboarding__stepTitle}>
									{t('questionOnboarding.askQuestions')}
								</h3>
								<p className={styles.onboarding__stepText}>
									{t('questionOnboarding.askQuestionsDesc')}
								</p>
							</div>
						</div>
						<p className={styles.onboarding__cta}>{t('questionOnboarding.getStarted')}</p>
					</div>
				)}
				{showReadingHeader &&
					activeView === 'chat' &&
					statement?.statementType === StatementType.option &&
					!statement.isCluster && (
						<OptionImprovement key={statement.statementId} statement={statement} />
					)}
				{onAnswersTab && <AnswersCounter data={data} />}
				<AnswerFabContext.Provider value={showFab}>
					<SwitchScreen statement={statement} role={role} activeView={activeView} data={data} />
				</AnswerFabContext.Provider>
				{/* Admin control over which answers are marked as leading, and in what
				    order the list reads. Mounted here rather than inside StagePage
				    because StagePage is also rendered nested (QuestionPage,
				    MultiStageQuestion), which would put several handles on one screen.
				    It stays reachable from every reading tab of the question. */}
				{isAdmin && statement && canHaveAnswers && !isMapScreen && !isTabContentView && (
					<TopAnswersPanel statement={statement} />
				)}
			</div>
			{showFab && statement && <AddAnswerFab statement={statement} />}
		</main>
	);
};

export default Switch;
