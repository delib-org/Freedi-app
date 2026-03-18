import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { topSubscriptionsSelector } from '@/redux/statements/statementsSlice';
import Back from '@/view/pages/statement/components/header/Back';
import BranchBell from '@/view/components/atomic/atoms/BranchBell/BranchBell';
import { useBranchBell } from '@/controllers/hooks/useBranchBell';
import type { StatementSubscription } from '@freedi/shared-types';

interface SubscriptionRowProps {
	subscription: StatementSubscription;
}

const SubscriptionRow = ({ subscription }: SubscriptionRowProps) => {
	const { state: bellState, onFrequencyChange } = useBranchBell(subscription.statement.statementId);

	return (
		<div className="subscription-manager__item">
			<div className="subscription-manager__info">
				<span className="subscription-manager__title">{subscription.statement.statement}</span>
			</div>
			<BranchBell state={bellState} size="medium" onFrequencyChange={onFrequencyChange} />
		</div>
	);
};

const SubscriptionManager = () => {
	const { t, dir } = useTranslation();
	const subscriptions = useAppSelector(topSubscriptionsSelector);

	return (
		<div className="page">
			<div className="page__header app-header app-header--sticky">
				<div className="app-header-wrapper">
					{dir === 'rtl' ? (
						<>
							<div className="app-header-spacer" />
							<h1 className="app-header-title">{t('Subscriptions')}</h1>
							<Back />
						</>
					) : (
						<>
							<Back />
							<h1 className="app-header-title">{t('Subscriptions')}</h1>
							<div className="app-header-spacer" />
						</>
					)}
				</div>
			</div>

			<div className="subscription-manager">
				{subscriptions.length > 0 ? (
					<div className="subscription-manager__list">
						{subscriptions.map((sub) => (
							<SubscriptionRow key={sub.statementId} subscription={sub} />
						))}
					</div>
				) : (
					<div className="subscription-manager__empty">{t('You have no subscriptions yet')}</div>
				)}
			</div>
		</div>
	);
};

export default SubscriptionManager;
