import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { createBrowserRouter } from 'react-router';
import type { AgoraGuestClaim } from '@freedi/shared-types';
import { auth } from '@/controllers/db/config';
import {
	agoraGuestClaim,
	guestFailureOf,
	holdsRealAccount,
	leaveToVillage,
	readAgoraHandoff,
	rememberOpenedByStation,
	signInAsAgoraGuest,
	stripHandoffFragment,
	villageTargetOf,
	wasOpenedByStation,
	type GuestSignInFailure,
	type VillageTarget,
} from '@/controllers/auth/agoraGuest';
import { AgoraGuestContext } from '@/context/AgoraGuestContext';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logError } from '@/utils/errorHandling';
import { Button } from '@/view/components/atomic/atoms/Button';
import { AgoraGuestBar } from '@/view/components/atomic/molecules/AgoraGuestBar';

type AppRouter = ReturnType<typeof createBrowserRouter>;

type Phase =
	| { kind: 'ready' }
	| { kind: 'opening' }
	| { kind: 'confirm'; code: string; name: string }
	| { kind: 'failed'; failure: GuestSignInFailure };

/** Screens a guest never needs: the app's homes. The linked question is their home. */
const HOME_PATHS = new Set(['/', '/home', '/start', '/login', '/my']);

export interface AgoraGuestGateProps {
	router: AppRouter;
	children: React.ReactNode;
}

/**
 * The door for a student arriving from an Agora station
 * (docs/ia/agora-linked-app-stations.md §9.4). While a handoff is in the
 * fragment, the app itself does not mount — so nothing signs a stray
 * anonymous user in — and the gate shows its own opening / account /
 * expired screens, each with the way back. Once signed in, it pins the
 * app's homes to the linked question and keeps the guest bar on top.
 */
const AgoraGuestGate: React.FC<AgoraGuestGateProps> = ({ router, children }) => {
	const { t } = useTranslation();
	const [handoff] = useState(() => readAgoraHandoff());
	const [phase, setPhase] = useState<Phase>(() =>
		handoff ? { kind: 'opening' } : { kind: 'ready' },
	);
	const [claim, setClaim] = useState<AgoraGuestClaim | null>(null);
	const [leaving, setLeaving] = useState(false);

	const hint: VillageTarget | null =
		handoff?.sessionId && handoff.itemId
			? { sessionId: handoff.sessionId, itemId: handoff.itemId }
			: null;
	const target = claim ? villageTargetOf(claim) : hint;

	const redeem = useCallback(
		async (code: string): Promise<void> => {
			setPhase({ kind: 'opening' });
			try {
				const signedIn = await signInAsAgoraGuest(code);
				setClaim(signedIn);
				setPhase({ kind: 'ready' });
				router.navigate(`/statement/${signedIn.q}`, { replace: true });
			} catch (error) {
				logError(error, { operation: 'agoraGuest.gate.redeem' });
				setPhase({ kind: 'failed', failure: guestFailureOf(error) });
			}
		},
		[router],
	);

	// The handoff: strip the code first, then decide whether to ask before switching
	useEffect(() => {
		if (!handoff) return;
		stripHandoffFragment();
		rememberOpenedByStation(handoff.opened);
		let cancelled = false;
		void (async () => {
			await auth.authStateReady();
			const current = auth.currentUser;
			const alreadyGuest = (await agoraGuestClaim(current)) !== null;
			if (cancelled) return;
			if (holdsRealAccount(current) && !alreadyGuest) {
				setPhase({
					kind: 'confirm',
					code: handoff.code,
					name: current?.displayName ?? current?.email ?? '',
				});

				return;
			}
			await redeem(handoff.code);
		})();

		return () => {
			cancelled = true;
		};
	}, [handoff, redeem]);

	// Guest mode follows the signed-in user's claim, across reloads
	useEffect(
		() =>
			onAuthStateChanged(auth, (user) => {
				void agoraGuestClaim(user).then(setClaim);
			}),
		[],
	);

	// One home: the linked question
	useEffect(() => {
		if (!claim) return;
		const pin = (pathname: string): void => {
			if (HOME_PATHS.has(pathname)) router.navigate(`/statement/${claim.q}`, { replace: true });
		};
		pin(router.state.location.pathname);

		return router.subscribe((state) => pin(state.location.pathname));
	}, [claim, router]);

	const back = target
		? (): void => {
				setLeaving(true);
				void leaveToVillage(target, wasOpenedByStation());
			}
		: undefined;
	const bar = <AgoraGuestBar onBack={back} leaving={leaving} />;

	if (phase.kind !== 'ready') {
		const message =
			phase.kind === 'opening'
				? t('Opening your task...')
				: phase.kind === 'confirm'
					? t(
							'This device is signed in to WizCol as {{name}}. To do the class task, switch to the class guest.',
						).replace('{{name}}', phase.name)
					: phase.failure === 'ended'
						? t('The lesson has ended')
						: phase.failure === 'expired'
							? t('This link has expired. Go back to the village and open the task again')
							: t('Could not open the task. Go back to the village and try again');

		return (
			<div className="agora-guest-gate">
				{bar}
				<main className="agora-guest-gate__body" aria-busy={phase.kind === 'opening'}>
					<p
						className="agora-guest-gate__message"
						role={phase.kind === 'failed' ? 'alert' : 'status'}
					>
						{message}
					</p>
					{phase.kind === 'confirm' && (
						<div className="agora-guest-gate__actions">
							<Button
								text={t('Switch to the class task')}
								variant="primary"
								fullWidth
								onClick={() => void redeem(phase.code)}
							/>
							{back && (
								<Button
									text={t('Back to the village')}
									variant="secondary"
									fullWidth
									onClick={back}
								/>
							)}
						</div>
					)}
				</main>
			</div>
		);
	}

	return (
		<AgoraGuestContext.Provider value={claim}>
			{claim && bar}
			{children}
		</AgoraGuestContext.Provider>
	);
};

export default AgoraGuestGate;
