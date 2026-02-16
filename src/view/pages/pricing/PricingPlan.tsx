import { useState } from 'react';
import { useNavigate } from 'react-router';
import RadioBox from '../../components/radioBox/RadioBox';
import { pricingPlans } from './pricingModel';
import pricingImg from '@/assets/images/pricing.png';

import styles from './PricingPlan.module.scss';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';

export default function PricingPlan() {
	const navigate = useNavigate();

	const [plan, setPlan] = useState('free');

	const { user } = useAuthentication();

	const handleChoosePlan = () => {
		if (plan === 'free') {
			navigate('/home/addStatement', {
				state: { from: window.location.pathname },
			});

			return;
		}

		if (user.isAnonymous) {
			navigate('/login-first', {
				state: { from: window.location.pathname },
			});
		}

		// Else navigate to payment page....
	};

	return (
		<div className="page">
			<div className={styles.pricingPlan}>
				<h1 className={styles.title}>Pricing plans</h1>
				<img src={pricingImg} alt="pricing-illustration" width="40%" />
				<p className={styles.text}>
					Select the appropriate plan to maximize your performance and get better results
				</p>
				<div className={styles.radioBoxesContainer}>
					{pricingPlans.map((item) => (
						<RadioBox
							key={item.price}
							currentValue={plan}
							setCurrentValue={setPlan}
							radioValue={item.price}
						>
							<div className={styles.pricingDescription}>
								<div className={styles.icon}>{item.icon}</div>
								<div className="textArea">
									<p className={styles.rangeText}>
										{item.from && item.to ? (
											<>
												<span>{item.range}</span> <b>{item.from}</b>
												{' to '}
												<b>{item.to}</b>
											</>
										) : item.to ? (
											<>
												<span>{item.range}</span> <b>{item.to}</b>
											</>
										) : (
											<>
												<span>{item.range}</span> <b>{item.from}</b>
											</>
										)}{' '}
										participants
									</p>
									<p className={styles.price}>
										{item.price === 'free' ? 'Free' : `$${item.price}`}
									</p>
								</div>
							</div>
						</RadioBox>
					))}
				</div>
				<button className={styles.choosePlanButton} onClick={handleChoosePlan}>
					Choose your plan
				</button>
			</div>
		</div>
	);
}
