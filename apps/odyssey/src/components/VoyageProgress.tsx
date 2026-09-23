import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useGame } from '../state/GameContext';
import { voyageSteps, type VoyageStep } from '../lib/voyageSteps';

/** What each state means, said out loud for anyone who cannot see the strip. */
const STATUS_TEXT: Record<VoyageStep['status'], string> = {
	done: 'הושלם',
	current: 'כאן אנחנו',
	open: 'פתוח',
	locked: 'עוד לא נפתח',
};

/**
 * The voyage strip — every screen of the journey, in order, under the brand.
 *
 * A player deep in the islands could not tell what was left, and one who put
 * the compass down half-answered had nothing telling them so. The strip says
 * both at a glance: a ✓ for each leg behind you, a count inside the leg you
 * are in ("3/5 איים"), and the legs ahead dimmed until the way to them is
 * clear. Finished legs are links, so it doubles as the way back.
 */
export default function VoyageProgress() {
	const location = useLocation();
	const { content, journey, attitudes } = useGame();
	const steps = voyageSteps({ content, journey, attitudes, pathname: location.pathname });
	const currentStep = useRef<HTMLLIElement>(null);

	// Admin is not a leg of the voyage; a player who has not begun has no voyage.
	const visible = steps.length > 0 && !location.pathname.startsWith('/admin');

	// The top bar grows by a row when the strip is there, and the pages clear a
	// fixed bar by padding alone — so the bar's own height has to reach them.
	useEffect(() => {
		if (!visible) return;
		document.documentElement.dataset.voyageStrip = 'on';

		return () => {
			delete document.documentElement.dataset.voyageStrip;
		};
	}, [visible]);

	// On a phone the strip scrolls sideways: the leg you are standing on is the
	// one that must be on screen, whatever the width — including after a turn
	// of the phone, which changes how much of the strip fits.
	useEffect(() => {
		const centre = (): void => {
			currentStep.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
		};
		centre();
		window.addEventListener('resize', centre);

		return () => window.removeEventListener('resize', centre);
	}, [location.pathname, steps.length]);

	if (!visible) return null;

	return (
		<ol className="voyage-steps" aria-label="שלבי המסע">
			{steps.map((step, index) => {
				const mark = step.isDestination ? '⚓' : step.status === 'done' ? '✓' : String(index + 1);
				const className = `voyage-step voyage-step--${step.status}`;
				const body = (
					<>
						<span className="voyage-step__mark" aria-hidden="true">
							{mark}
						</span>
						<span>{step.label}</span>
						{step.detail && step.status !== 'locked' ? (
							<span className="voyage-step__detail">{step.detail}</span>
						) : null}
						<span className="sr-only"> — {STATUS_TEXT[step.status]}</span>
					</>
				);

				return (
					<li
						key={step.path}
						className="voyage-steps__item"
						ref={step.status === 'current' ? currentStep : undefined}
					>
						{step.status === 'locked' ? (
							<span className={className} aria-disabled="true">
								{body}
							</span>
						) : (
							<Link
								className={className}
								to={step.path}
								aria-current={step.status === 'current' ? 'step' : undefined}
							>
								{body}
							</Link>
						)}
					</li>
				);
			})}
		</ol>
	);
}
