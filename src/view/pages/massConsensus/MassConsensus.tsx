import { getStatementSubscriptionFromDB } from '@/controllers/db/subscriptions/getSubscriptions'
import { getStatementSubscriptionId } from '@/controllers/general/helpers'
import { useAuthentication } from '@/controllers/hooks/useAuthentication'
import { setStatementSubscription, statementSubscriptionSelector } from '@/redux/statements/statementsSlice'
import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Outlet, useParams } from 'react-router'

const MassConsensus = () => {
	const dispatch = useDispatch();
	const { statementId } = useParams()
	const { user } = useAuthentication()
	const subscription = useSelector(statementSubscriptionSelector(statementId))

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

	return (
		<Outlet />
	)
}

export default MassConsensus