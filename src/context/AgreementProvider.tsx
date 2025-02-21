import { FC, ReactNode, useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import { getSignature } from '@/controllers/db/users/getUserDB';
import { updateUserAgreement } from '@/controllers/db/users/setUsersDB';
import { updateAgreementToStore } from '@/redux/users/userSlice';
import { logOut } from '@/controllers/db/authenticationUtils';
import type { Agreement } from '@/types/agreement/Agreement';
import type { User } from '@/types/user/User';
import TermsOfUse from '@/view/components/termsOfUse/TermsOfUse';

interface AgreementProviderProps {
	children: ReactNode;
	user: User | null;
}

export const AgreementProvider: FC<AgreementProviderProps> = ({
	children,
	user,
}) => {
	const dispatch = useDispatch();
	const { t } = useLanguage();
	const [showSignAgreement, setShowSignAgreement] = useState(false);
	const [agreement, setAgreement] = useState<string>('');

	useEffect(() => {
		if (!user) return;

		if (user.agreement?.date) {
			setShowSignAgreement(false);

			return;
		}

		const agreement = getSignature('basic', t);
		if (!agreement) {
			console.error('Agreement not found');

			return;
		}

		setAgreement(agreement.text);
		setShowSignAgreement(true);
	}, [user, t]);

	const handleAgreement = async (agree: boolean, text: string) => {
		try {
			if (!text) throw new Error('text is empty');

			if (agree) {
				setShowSignAgreement(false);
				const agreement: Agreement | undefined = getSignature(
					'basic',
					t
				);
				if (!agreement) throw new Error('agreement not found');

				agreement.text = text;
				dispatch(updateAgreementToStore(agreement));

				const isAgreed = await updateUserAgreement(agreement);
				setShowSignAgreement(!isAgreed);
			} else {
				setShowSignAgreement(false);
				await logOut();
			}
		} catch (error) {
			console.error('Agreement handling error:', error);
		}
	};

	return (
		<>
			{children}
			{showSignAgreement && (
				<TermsOfUse
					handleAgreement={handleAgreement}
					agreement={agreement}
				/>
			)}
		</>
	);
};
