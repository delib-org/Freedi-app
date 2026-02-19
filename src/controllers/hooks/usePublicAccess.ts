/**
 * Hook to handle access for statements
 * Manages auto-authentication for unauthenticated users (anonymous auth)
 * Users can login explicitly via profile icon if they want a permanent account
 */

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Access } from '@freedi/shared-types';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { handlePublicAutoAuth } from '@/controllers/auth/publicAuthHandler';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { logError } from '@/utils/errorHandling';

interface UsePublicAccessResult {
	isCheckingAccess: boolean;
	effectiveAccess: Access | null;
}

export function usePublicAccess(statementId?: string): UsePublicAccessResult {
	const [isCheckingAccess, setIsCheckingAccess] = useState(true);
	const [effectiveAccess, setEffectiveAccess] = useState<Access | null>(null);
	const creator = useSelector(creatorSelector);

	useEffect(() => {
		let isMounted = true;

		const checkPublicAccess = async () => {
			// If no statementId, nothing to check
			if (!statementId) {
				if (isMounted) setIsCheckingAccess(false);

				return;
			}

			// If user is already authenticated, no need to auto-auth
			if (creator?.uid) {
				if (isMounted) setIsCheckingAccess(false);

				return;
			}

			try {
				// Auto-authenticate FIRST before fetching any data
				// This ensures the user has a valid auth token for Firestore
				console.info('User not authenticated, initiating auto-authentication');
				await handlePublicAutoAuth();
				if (!isMounted) return;

				// Now fetch the statement with valid auth
				const statement = await getStatementFromDB(statementId);
				if (!isMounted) return;

				if (!statement) {
					setIsCheckingAccess(false);

					return;
				}

				// Get the top parent statement if needed
				let topParentStatement = null;
				if (statement.topParentId && statement.topParentId !== statementId) {
					topParentStatement = await getStatementFromDB(statement.topParentId);
					if (!isMounted) return;
				}

				// Determine effective access - statement override or topParent
				const access = statement?.membership?.access || topParentStatement?.membership?.access;
				setEffectiveAccess(access || null);
			} catch (error) {
				logError(error, { operation: 'hooks.usePublicAccess.unknown', metadata: { message: 'Error checking public access:' } });
			} finally {
				if (isMounted) setIsCheckingAccess(false);
			}
		};

		checkPublicAccess();

		return () => {
			isMounted = false;
		};
	}, [statementId, creator?.uid]);

	return {
		isCheckingAccess,
		effectiveAccess,
	};
}
