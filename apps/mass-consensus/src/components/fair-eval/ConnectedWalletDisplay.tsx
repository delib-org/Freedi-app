'use client';

import React, { useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import WalletDisplay from './WalletDisplay';
import { useFairEval } from './useFairEval';

/**
 * ConnectedWalletDisplay - Mass Consensus
 *
 * A connected version of WalletDisplay that:
 * - Gets the current user from AuthProvider
 * - Uses Redux store for wallet data
 * - Shows loading state while fetching
 */

export interface ConnectedWalletDisplayProps {
	/** The top parent statement ID (group scope) */
	topParentId: string;

	/** Size variant */
	size?: 'small' | 'medium' | 'large';

	/** Show compact (no label) or full */
	compact?: boolean;

	/** Click handler (navigate to history) */
	onClick?: () => void;

	/** Additional CSS classes */
	className?: string;
}

const ConnectedWalletDisplay: React.FC<ConnectedWalletDisplayProps> = ({
	topParentId,
	size = 'medium',
	compact = false,
	onClick,
	className,
}) => {
	const { t } = useTranslation();
	const { user, isLoading: authLoading } = useAuth();
	const {
		balance,
		isLoading: walletLoading,
		setUserId,
	} = useFairEval(topParentId);

	// Set user ID when available
	useEffect(() => {
		if (user?.uid) {
			setUserId(user.uid);
		}
	}, [user?.uid, setUserId]);

	// Don't render if no user
	if (!user || authLoading) {
		return null;
	}

	// Show loading state
	if (walletLoading) {
		return (
			<WalletDisplay
				balance={0}
				size={size}
				compact={compact}
				loading
				className={className}
			/>
		);
	}

	return (
		<WalletDisplay
			balance={balance}
			size={size}
			compact={compact}
			onClick={onClick}
			className={className}
		/>
	);
};

export default ConnectedWalletDisplay;
