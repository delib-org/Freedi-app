import { useState } from 'react';
import { useNavigate } from 'react-router';
import RadioBox from '../../components/radioBox/RadioBox';
import { pricingPlans } from './pricingModel';
import pricingImg from '@/assets/images/pricing.png';

import './PricingPlan.scss';
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
		<div className='page'>
			<div className='pricing-plan'>
				<h1 className='title'>Pricing plans</h1>
				<img src={pricingImg} alt='pricing-illustration' width='40%' />
				<p className='text'>
					Select the appropriate plan to maximize your performance and
					get better results
				</p>
				<div className='radio-boxes-container'>
					{pricingPlans.map((item) => (
						<RadioBox
							key={item.price}
							currentValue={plan}
							setCurrentValue={setPlan}
							radioValue={item.price}
						>
							<div className='pricing-description'>
								<div className='icon'>{item.icon}</div>
								<div className='textArea'>
									<p className='range-text'>
										{item.from && item.to ? (
											<>
												<span>{item.range}</span>{' '}
												<b>{item.from}</b>
												{' to '}
												<b>{item.to}</b>
											</>
										) : item.to ? (
											<>
												<span>{item.range}</span>{' '}
												<b>{item.to}</b>
											</>
										) : (
											<>
												<span>{item.range}</span>{' '}
												<b>{item.from}</b>
											</>
										)}{' '}
										participants
									</p>
									<p className='price'>
										{item.price === 'free'
											? 'Free'
											: `$${item.price}`}
									</p>
								</div>
							</div>
						</RadioBox>
					))}
				</div>
				<button
					className='choose-plan-button'
					onClick={handleChoosePlan}
				>
					Choose your plan
				</button>
			</div>
		</div>
	);
}
