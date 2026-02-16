import { FC, ReactNode, useState, useEffect } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logOut } from '@/controllers/db/authenticationUtils';
import TermsOfUse from '@/view/components/termsOfUse/TermsOfUse';
import {
	getLatestTermsAcceptance,
	saveTermsAcceptance,
} from '@/controllers/db/termsOfUse/termsOfUseService';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import { TermsOfUseAcceptance } from '@/types/agreement/Agreement';
import { User } from '@freedi/shared-types';

interface AgreementProviderProps {
	children: ReactNode;
	user: User | null;
}

export const AgreementProvider: FC<AgreementProviderProps> = ({ children, user }) => {
	const { t } = useTranslation();
	const [showSignAgreement, setShowSignAgreement] = useState(false);
	const [agreement, setAgreement] = useState<string>('');
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const checkTermsAcceptance = async () => {
			if (!user) {
				setLoading(false);

				return;
			}

			try {
				// Check if user has accepted latest terms
				const latestAcceptance = await getLatestTermsAcceptance(user.uid);

				if (latestAcceptance) {
					setShowSignAgreement(false);
				} else {
					setAgreement(t('Agreement Description'));
					setShowSignAgreement(true);
				}
			} catch (error) {
				console.error('Error checking terms acceptance:', error);
			} finally {
				setLoading(false);
			}
		};

		checkTermsAcceptance();
	}, [user, t]);

	const handleAgreement = async (agree: boolean, text: string) => {
		try {
			if (!text) throw new Error('text is empty');
			if (!user) throw new Error('no user found');

			if (agree) {
				const agreement: TermsOfUseAcceptance = {
					text,
					date: Date.now(),
					version: 'basic',
					userId: user.uid,
					accepted: true,
				};

				const isSuccess = await saveTermsAcceptance(agreement);
				if (isSuccess) {
					setShowSignAgreement(false);
				}
			} else {
				setShowSignAgreement(false);
				await logOut();
			}
		} catch (error) {
			console.error('Agreement handling error:', error);
		}
	};

	if (loading) {
		return <LoadingPage />;
	}

	return (
		<>
			{children}
			{showSignAgreement && <TermsOfUse handleAgreement={handleAgreement} agreement={agreement} />}
		</>
	);
};
