import { FC, ReactNode, useState, useEffect } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logOut } from '@/controllers/db/authenticationUtils';
import TermsOfUse from '@/view/components/termsOfUse/TermsOfUse';
import {
	getLatestTermsAcceptance,
	saveTermsAcceptance,
	type SaveTermsResult,
} from '@/controllers/db/termsOfUse/termsOfUseService';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import { TermsOfUseAcceptance } from '@/types/agreement/Agreement';
import { User } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

interface AgreementProviderProps {
	children: ReactNode;
	user: User | null;
}

export const AgreementProvider: FC<AgreementProviderProps> = ({ children, user }) => {
	const { t } = useTranslation();
	const [showSignAgreement, setShowSignAgreement] = useState(false);
	const [agreement, setAgreement] = useState<string>('');
	const [loading, setLoading] = useState(true);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

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
				logError(error, {
					operation: 'context.AgreementProvider.checkTermsAcceptance',
					metadata: { message: 'Error checking terms acceptance:' },
				});
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

				setSaveError(null);
				setIsSaving(true);
				const result: SaveTermsResult = await saveTermsAcceptance(agreement);
				setIsSaving(false);

				if (result === 'success') {
					setShowSignAgreement(false);
				} else if (result === 'blocked') {
					// The most common cause: a browser extension / ad blocker blocks
					// reCAPTCHA, which fails App Check, which rejects the write with
					// permission-denied. Tell the user instead of leaving the modal
					// silently stuck.
					setSaveError(
						t(
							"We couldn't save your response. An ad blocker or privacy extension may be blocking this site — please disable it for this page and try again.",
						),
					);
				} else {
					setSaveError(t('Something went wrong saving your response. Please try again.'));
				}
			} else {
				setShowSignAgreement(false);
				await logOut();
			}
		} catch (error) {
			logError(error, {
				operation: 'context.AgreementProvider.handleAgreement',
				metadata: { message: 'Agreement handling error:' },
			});
		}
	};

	if (loading) {
		return <LoadingPage />;
	}

	return (
		<>
			{children}
			{showSignAgreement && (
				<TermsOfUse
					handleAgreement={handleAgreement}
					agreement={agreement}
					error={saveError}
					isSaving={isSaving}
				/>
			)}
		</>
	);
};
