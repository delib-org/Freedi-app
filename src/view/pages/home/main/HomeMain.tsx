import { useEffect, useState } from 'react';
import '@/view/style/homePage.scss';
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
import { StatementType } from 'delib-npm';
import MainQuestionCard from './mainQuestionCard/MainQuestionCard';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import NewStatement from '../../statement/components/newStatement/NewStatement';
import { selectNewStatementShowModal } from '@/redux/statements/newStatementSlice';
import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';

const HomeMain = () => {
	// Hooks
	const showNewStatementModal = useAppSelector(selectNewStatementShowModal);
	const [loading, setLoading] = useState(true);
	const [subPage, setSubPage] = useState<'decisions' | 'groups'>('groups');
	const [subPageTitle, setSubPageTitle] = useState<'Decisions' | 'Groups'>(
		'Decisions'
	);
	const user = useSelector(creatorSelector);
	const { t } = useUserConfig();
	const userId = user?.uid || '';

	const topSubscriptions = useAppSelector(topSubscriptionsSelector)
		.sort((a, b) => b.lastUpdate - a.lastUpdate)
		.filter(
			(sub) =>
				sub.user?.uid === user?.uid &&
				sub.statement.statementType === StatementType.group
		);
	
	const latestDecisions = useAppSelector(statementsSubscriptionsSelector)
		.filter((sub) => sub.statement.statementType === StatementType.question)
		.sort((a, b) => b.lastUpdate - a.lastUpdate);

	useEffect(() => {
		setTimeout(() => {
			setLoading(false);
		}, 3000);

		if (topSubscriptions.length > 0) {
			setLoading(false);
		}
	}, [topSubscriptions]);

	useEffect(() => {
		if (userId && user.advanceUser) {
			setSubPage('groups');
		} else {
			setSubPage('decisions');
		}
	}, [userId]);

	useEffect(() => {
		setSubPageTitle(subPage === 'decisions' ? 'Decisions' : 'Groups');
	}, [subPage]);

	return (
		<main className='home-page__main slide-in'>
			<div className='heroImg'></div>
			<img
				className='bikeImg'
				alt='Three-Characters-on-a-bicycle'
				src={bike}
			/>

			<div
				className='wrapper main-wrap'
				style={{
					justifyContent:
						topSubscriptions.length > 0 ? 'start' : 'center',
				}}
			>
				{showNewStatementModal && (
					<div className={styles.addStatementModal}>
						<NewStatement />
					</div>
				)}
				<h2>{t(subPageTitle)}</h2>
				{(() => {
					if (loading) {
						return (
							<div className='peopleLoadingScreen'>
								<PeopleLoader />
							</div>
						);
					}

					const itemsToRender =
						subPage === 'groups'
							? topSubscriptions
							: latestDecisions;

					return itemsToRender.map((sub) =>
						subPage === 'groups' ? (
							<MainCard
								key={sub.statementId}
								subscription={sub}
							/>
						) : (
							<MainQuestionCard
								key={sub.statementId}
								simpleStatement={sub.statement}
							/>
						)
					);
				})()}
			</div>
			<Footer setSubPage={setSubPage} subPage={subPage} />
		</main>
	);
};

export default HomeMain;
