import { useEffect, useState, useMemo, useCallback } from 'react';
import styles from './HomeMain.module.scss';

// Redux store
import MainCard from './mainCard/MainCard';
import bike from '@/assets/images/bike.png';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import {
	statementsSubscriptionsSelector,
	topSubscriptionsSelector,
} from '@/redux/statements/statementsSlice';

// Custom components
import Footer from '@/view/components/footer/Footer';
import PeopleLoader from '@/view/components/loaders/PeopleLoader';
import { StatementType } from '@freedi/shared-types';
import MainQuestionCard from './mainQuestionCard/MainQuestionCard';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import NewStatement from '../../statement/components/newStatement/NewStatement';
import {
	selectNewStatementShowModal,
	setParentStatement,
	setNewStatementType,
	setShowNewStatementModal,
} from '@/redux/statements/newStatementSlice';
import { useSelector, useDispatch } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';

const HomeMain = () => {
	// Hooks
	const showNewStatementModal = useAppSelector(selectNewStatementShowModal);
	const [loading, setLoading] = useState(true);
	const [subPage, setSubPage] = useState<'decisions' | 'topics'>('topics');
	const [subPageTitle, setSubPageTitle] = useState<'Discussions' | 'Topics'>('Discussions');
	const user = useSelector(creatorSelector);
	const dispatch = useDispatch();
	const { t } = useTranslation();
	const userId = user?.uid || '';

	const allTopSubscriptions = useAppSelector(topSubscriptionsSelector);
	const allStatementsSubscriptions = useAppSelector(statementsSubscriptionsSelector);

	const topSubscriptions = useMemo(
		() =>
			allTopSubscriptions.filter(
				(sub) =>
					sub.userId === userId &&
					(sub.statement.statementType === StatementType.group ||
						sub.statement.statementType === StatementType.question),
			),
		[allTopSubscriptions, userId],
	);

	const latestDecisions = allStatementsSubscriptions;

	useEffect(() => {
		if (topSubscriptions.length > 0 || latestDecisions.length > 0) {
			setLoading(false);
		}
	}, [topSubscriptions, latestDecisions]);

	// Fallback: stop loading after a short timeout if no data arrives
	// (e.g. new user with no subscriptions)
	useEffect(() => {
		const timer = setTimeout(() => {
			setLoading(false);
		}, 1500);

		return () => clearTimeout(timer);
	}, []);

	const hasTopics = topSubscriptions.length > 0;

	useEffect(() => {
		if (userId && user.advanceUser && hasTopics) {
			setSubPage('topics');
		} else {
			setSubPage('decisions');
		}
	}, [userId, hasTopics]);

	useEffect(() => {
		setSubPageTitle(subPage === 'decisions' ? 'Discussions' : 'Topics');
	}, [subPage]);

	const handleAddStatement = useCallback(() => {
		dispatch(setParentStatement('top'));
		dispatch(setNewStatementType(StatementType.question));
		dispatch(setShowNewStatementModal(true));
	}, [dispatch]);

	return (
		<main className="home-page__main slide-in">
			<div className="heroImg"></div>
			<img className="bikeImg" alt="Three-Characters-on-a-bicycle" src={bike} />

			<div
				className="wrapper main-wrap"
				style={{
					justifyContent: topSubscriptions.length > 0 ? 'start' : 'center',
				}}
			>
				{showNewStatementModal && (
					<div className={styles.addStatementModal}>
						<NewStatement />
					</div>
				)}
				<h2 className={styles.sectionTitle}>{t(subPageTitle)}</h2>
				{(() => {
					if (loading) {
						return (
							<div className="peopleLoadingScreen">
								<PeopleLoader />
							</div>
						);
					}

					const itemsToRender = subPage === 'topics' ? topSubscriptions : latestDecisions;

					if (itemsToRender.length === 0) {
						return (
							<div className={styles.onboarding}>
								<h2 className={styles.onboarding__title}>{t('onboarding.welcome')}</h2>
								<p className={styles.onboarding__description}>{t('onboarding.description')}</p>
								<p className={styles.onboarding__description}>{t('onboarding.howItWorks')}</p>
								<div className={styles.onboarding__steps}>
									<div className={styles.onboarding__step}>
										<span className={styles.onboarding__stepNumber}>1</span>
										<span className={styles.onboarding__stepText}>{t('onboarding.step1')}</span>
									</div>
									<div className={styles.onboarding__step}>
										<span className={styles.onboarding__stepNumber}>2</span>
										<span className={styles.onboarding__stepText}>{t('onboarding.step2')}</span>
									</div>
									<div className={styles.onboarding__step}>
										<span className={styles.onboarding__stepNumber}>3</span>
										<span className={styles.onboarding__stepText}>{t('onboarding.step3')}</span>
									</div>
									<div className={styles.onboarding__step}>
										<span className={styles.onboarding__stepNumber}>4</span>
										<span className={styles.onboarding__stepText}>{t('onboarding.step4')}</span>
									</div>
								</div>
								<p className={styles.onboarding__cta}>{t('onboarding.getStarted')}</p>
							</div>
						);
					}

					return itemsToRender.map((sub) =>
						subPage === 'topics' ? (
							<MainCard key={sub.statementId} subscription={sub} />
						) : (
							<MainQuestionCard key={sub.statementId} simpleStatement={sub.statement} />
						),
					);
				})()}
			</div>
			<Footer
				setSubPage={setSubPage}
				subPage={subPage}
				hasTopics={hasTopics}
				onAddStatement={handleAddStatement}
			/>
		</main>
	);
};

export default HomeMain;
