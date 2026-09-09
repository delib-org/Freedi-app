import { FC, ReactNode, useEffect, useMemo, useState } from 'react';
import { User } from '@freedi/shared-types';
import { getLatestTermsAcceptance } from '@/controllers/db/termsOfUse/termsOfUseService';
import { logError } from '@/utils/errorHandling';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import FirstRunFlow from './FirstRunFlow';
import { FirstRunContext } from './FirstRunContext';

interface FirstRunGateProps {
	user: User | null;
	children: ReactNode;
}

/**
 * New-shell replacement for AgreementProvider: renders the page underneath
 * and, for a signed-in user with no terms record, the first-run flow over it.
 */
export const FirstRunGate: FC<FirstRunGateProps> = ({ user, children }) => {
	const [checked, setChecked] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	useEffect(() => {
		let cancelled = false;
		if (!user) {
			setPending(false);
			setChecked('anonymous');

			return;
		}
		getLatestTermsAcceptance(user.uid)
			.then((acceptance) => {
				if (cancelled) return;
				setPending(!acceptance);
			})
			.catch((error: unknown) => {
				logError(error, { operation: 'firstRun.FirstRunGate.check', userId: user.uid });
			})
			.finally(() => {
				if (!cancelled) setChecked(user.uid);
			});

		return () => {
			cancelled = true;
		};
	}, [user]);

	const value = useMemo(() => ({ pending }), [pending]);
	const ready = checked === (user?.uid ?? 'anonymous');

	if (!ready) return <LoadingPage />;

	return (
		<FirstRunContext.Provider value={value}>
			{children}
			{pending && user && <FirstRunFlow user={user} onDone={() => setPending(false)} />}
		</FirstRunContext.Provider>
	);
};

export default FirstRunGate;
