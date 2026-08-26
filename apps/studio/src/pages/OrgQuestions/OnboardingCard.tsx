import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms';
import { ONBOARDING_STEPS } from '../_shared/useOnboarding';
import styles from './OnboardingCard.module.scss';

/**
 * First-run checklist shown while an organization has no questions yet.
 * Step 1 opens the "New question" modal; the later steps are completed from
 * the question dashboard (`useOnboarding().markStep`).
 */
export interface OnboardingCardProps {
	orgName: string;
	userName: string;
	/** Highest completed step (0..3). */
	step: number;
	onStart: () => void;
	onDismiss: () => void;
	className?: string;
}

const STEP_LABELS = [
	'Write your main question',
	'Add an activity',
	'Open it and share the link',
] as const;

export default function OnboardingCard({
	orgName,
	userName,
	step,
	onStart,
	onDismiss,
	className,
}: OnboardingCardProps) {
	const { t, tWithParams } = useTranslation();

	return (
		<section
			className={clsx('card', 'card--elevated', 'card--spacious', styles.card, className)}
			aria-labelledby="onboarding-title"
		>
			<div className={clsx('card__header', styles.header)}>
				<h2 id="onboarding-title" className="card__title">
					{tWithParams("Welcome to {{org}}'s Studio, {{name}}", { org: orgName, name: userName })}
				</h2>
				<button
					type="button"
					className="modal__close-button"
					aria-label={t('Dismiss')}
					onClick={onDismiss}
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						aria-hidden="true"
					>
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			</div>
			<p className="card__subtitle">{t('Three steps to your first live question:')}</p>

			<ol className={styles.steps}>
				{STEP_LABELS.map((label, index) => {
					const number = index + 1;
					const done = step >= number;
					const current = !done && step === index;

					return (
						<li
							key={label}
							className={clsx(styles.step, done && styles.stepDone, current && styles.stepCurrent)}
							aria-current={current ? 'step' : undefined}
						>
							<span className={styles.stepNumber} aria-hidden="true">
								{done ? '✓' : number}
							</span>
							<span className={styles.stepLabel}>
								{t(label)}
								{done && <span className="visually-hidden"> ({t('Done')})</span>}
							</span>
							{number === 1 && !done && (
								<Button
									text={`${t('Start')} →`}
									variant="primary"
									size="small"
									onClick={onStart}
									className={styles.stepAction}
								/>
							)}
						</li>
					);
				})}
			</ol>
			<p className={clsx('card__footer', styles.progress)}>
				{tWithParams('{{done}} of {{total}} done', {
					done: Math.min(step, ONBOARDING_STEPS),
					total: ONBOARDING_STEPS,
				})}
			</p>
		</section>
	);
}
