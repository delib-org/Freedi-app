import React, { useContext, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router';
import { Role, Screen } from '@freedi/shared-types';

import { StatementContext } from '../../StatementCont';
import styles from './Switch.module.scss';
import SwitchScreen from './SwitchScreen';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import OnlineUsers from '../nav/online/OnlineUsers';

import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useHeaderHideOnScroll } from '@/controllers/hooks/useHeaderHideOnScroll';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import { MessageSquare, Lightbulb, HelpCircle } from 'lucide-react';
import StatementBody from '@/view/components/atomic/molecules/StatementBody/StatementBody';
import TopAnswersPanel from '../topAnswers/TopAnswersPanel';

interface SwitchProps {
	activeView: string;
}

const Switch: React.FC<SwitchProps> = ({ activeView }) => {
	const { t } = useTranslation();
	const { statement } = useContext(StatementContext);
	const { role } = useAuthorization(statement?.statementId);

	const mainRef = useRef<HTMLElement>(null);
	useHeaderHideOnScroll(mainRef);

	// The mind map is a canvas screen: it must use the full window width instead
	// of the centered reading column `.page__main` enforces on wide screens.
	const { screen } = useParams();
	const isFullBleedScreen = screen === Screen.mindMap;

	const subsSelect = useMemo(
		() => statementSubsSelector(statement?.statementId),
		[statement?.statementId],
	);
	const allSubs = useSelector(subsSelect);

	const isAdmin = role === Role.admin || role === Role.creator;

	// The mind map needs every pixel of height for the canvas: the description
	// editor, the presence row and the onboarding card pushed the graph below
	// the fold. On that screen the title alone stays.
	const showReadingHeader = !isFullBleedScreen;

	return (
		<main ref={mainRef} className={`page__main${isFullBleedScreen ? ' page__main--flush' : ''}`}>
			{showReadingHeader && <OnlineUsers statementId={statement?.statementId} />}
			{showReadingHeader && statement && <StatementBody host={statement} canEdit={isAdmin} />}
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
			<SwitchScreen statement={statement} role={role} activeView={activeView} />
			{/* Admin control over which answers are marked as leading, and in what
			    order the list reads. Mounted here rather than inside StagePage
			    because StagePage is also rendered nested (QuestionPage,
			    MultiStageQuestion), which would put several handles on one screen. */}
			{isAdmin && statement && activeView === 'options' && !isFullBleedScreen && (
				<TopAnswersPanel statement={statement} />
			)}
		</main>
	);
};

export default Switch;
