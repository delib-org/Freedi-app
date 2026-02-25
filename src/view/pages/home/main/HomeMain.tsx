import { useEffect, useState, useMemo } from 'react';
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
import { selectNewStatementShowModal } from '@/redux/statements/newStatementSlice';
import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';

const HomeMain = () => {
	// Hooks
	const showNewStatementModal = useAppSelector(selectNewStatementShowModal);
	const [loading, setLoading] = useState(true);
	const [subPage, setSubPage] = useState<'decisions' | 'groups'>('groups');
	const [subPageTitle, setSubPageTitle] = useState<'Discussions' | 'Groups'>('Discussions');
	const user = useSelector(creatorSelector);
	const { t } = useTranslation();
	const userId = user?.uid || '';

	const allTopSubscriptions = useAppSelector(topSubscriptionsSelector);
	const allStatementsSubscriptions = useAppSelector(statementsSubscriptionsSelector);

	const topSubscriptions = useMemo(
		() =>
			allTopSubscriptions.filter(
				(sub) => sub.userId === userId && sub.statement.statementType === StatementType.group,
			),
		[allTopSubscriptions, userId],
	);

	const latestDecisions = useMemo(
		() =>
			allStatementsSubscriptions.filter(
				(sub) => sub.statement.statementType === StatementType.question,
			),
		[allStatementsSubscriptions],
	);

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

	useEffect(() => {
		if (userId && user.advanceUser) {
			setSubPage('groups');
		} else {
			setSubPage('decisions');
		}
	}, [userId]);

	useEffect(() => {
		setSubPageTitle(subPage === 'decisions' ? 'Discussions' : 'Groups');
	}, [subPage]);

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

					const itemsToRender = subPage === 'groups' ? topSubscriptions : latestDecisions;

					return itemsToRender.map((sub) =>
						subPage === 'groups' ? (
							<MainCard key={sub.statementId} subscription={sub} />
						) : (
							<MainQuestionCard key={sub.statementId} simpleStatement={sub.statement} />
						),
					);
				})()}
			</div>
			<Footer setSubPage={setSubPage} subPage={subPage} />
		</main>
	);
};

export default HomeMain;
