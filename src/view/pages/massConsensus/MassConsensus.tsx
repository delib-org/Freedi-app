import { getStatementSubscriptionFromDB } from '@/controllers/db/subscriptions/getSubscriptions'
import { getStatementSubscriptionId } from '@/controllers/general/helpers'
import { useAuthentication } from '@/controllers/hooks/useAuthentication'
import { usePublicAccess } from '@/controllers/hooks/usePublicAccess'
import { setStatementSubscription, statementSubscriptionSelector } from '@/redux/statements/statementsSlice'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Outlet, useNavigate, useParams, useLocation } from 'react-router'
import { HeaderProvider } from './headerMassConsensus/HeaderContext'
import { ExplanationProvider } from '@/contexts/massConsensus/ExplanationProvider'
import HeaderMassConsensus from './headerMassConsensus/HeaderMassConsensus'
import styles from './MassConsensus.module.scss'
import { useUserConfig } from '@/controllers/hooks/useUserConfig'
import { setMassConsensusMemberToDB } from '@/controllers/db/massConsensus/setMassConsensus'
import { setMassConsensusProcess } from '@/redux/massConsensus/massConsensusSlice'
import { getMassConsensusProcess } from '@/controllers/db/massConsensus/getMassConsensus'
import Accessibility from '@/view/components/accessibility/Accessibility'
import LoadingPage from '@/view/pages/loadingPage/LoadingPage'
import { ErrorBoundary } from 'react-error-boundary'

const MassConsensusErrorFallback = ({ error, resetErrorBoundary }: { error: Error, resetErrorBoundary: () => void }) => {
	return (
		<div style={{ padding: '20px', background: '#fee', border: '1px solid #f00', margin: '20px' }}>
			<h2>Error in Mass Consensus</h2>
			<p>An error occurred in the Mass Consensus component:</p>
			<pre style={{ background: '#fff', padding: '10px', overflow: 'auto' }}>
				{error.message}
				{'\n\n'}
				{error.stack}
			</pre>
			<button onClick={resetErrorBoundary} style={{ padding: '10px', marginTop: '10px' }}>
				Try Again
			</button>
		</div>
	);
};

const MassConsensus = () => {
	const navigate = useNavigate()
	const location = useLocation()
	const { dir } = useUserConfig();
	const dispatch = useDispatch();
	const { statementId } = useParams()
	const { user } = useAuthentication()
	const { isCheckingAccess } = usePublicAccess(statementId);
	const subscription = useSelector(statementSubscriptionSelector(statementId));

	useEffect(() => {
		// Only redirect to introduction if we're at the base path
		if (location.pathname === `/mass-consensus/${statementId}` ||
		    location.pathname === `/mass-consensus/${statementId}/`) {
			navigate(`/mass-consensus/${statementId}/introduction`)
		}
	}, [])

	useEffect(() => {
		if (!subscription && user) {
			const subscriptionId = getStatementSubscriptionId(statementId, user.uid)
			getStatementSubscriptionFromDB(subscriptionId).then(subscription => {
				if (subscription) {
					dispatch(setStatementSubscription(subscription))
				}
			})
		}
	}, [subscription, user])

	useEffect(() => {

		if (user) {
			setMassConsensusMemberToDB(user, statementId);

			getMassConsensusProcess(statementId).then((process) => {
				if (process) {
					dispatch(setMassConsensusProcess(process))
				}
			})
		}
	}, [user])

	// Show loading while checking public access
	if (isCheckingAccess) {
		return <LoadingPage />;
	}

	return (
		<ExplanationProvider>
			<HeaderProvider>
				<HeaderMassConsensus />
				<Accessibility />
				<div className={styles.massConsensus} style={{ direction: dir }}>
					<div className={styles.massConsensus__wrapper}>
						<ErrorBoundary
							FallbackComponent={MassConsensusErrorFallback}
							onError={(error) => {
								console.error('MassConsensus ErrorBoundary caught:', error);
							}}
						>
							<Outlet />
						</ErrorBoundary>
					</div>
				</div>
			</HeaderProvider>
		</ExplanationProvider>
	)
}

export default MassConsensus