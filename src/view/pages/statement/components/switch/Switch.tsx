import React, { useContext, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';

import { StatementContext } from '../../StatementCont';
import styles from './Switch.module.scss';
import SwitchScreen from './SwitchScreen';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import OnlineUsers from '../nav/online/OnlineUsers';

import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useHeaderHideOnScroll } from '@/controllers/hooks/useHeaderHideOnScroll';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import { MessageSquare, Lightbulb, HelpCircle } from 'lucide-react';

interface SwitchProps {
	activeView: string;
}

const Switch: React.FC<SwitchProps> = ({ activeView }) => {
	const { t } = useTranslation();
	const { statement } = useContext(StatementContext);
	const { role } = useAuthorization(statement?.statementId);

	const mainRef = useRef<HTMLElement>(null);
	useHeaderHideOnScroll(mainRef);

	const subsSelect = useMemo(
		() => statementSubsSelector(statement?.statementId),
		[statement?.statementId],
	);
	const allSubs = useSelector(subsSelect);

	return (
		<main ref={mainRef} className="page__main">
			<OnlineUsers statementId={statement?.statementId} />
			{allSubs.length === 0 && activeView === 'chat' && (
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
		</main>
	);
};

export default Switch;
