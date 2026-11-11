import { useCallback, useEffect } from 'react';
import { Statement } from '@freedi/shared-types';
import { findUpTarget } from '@/controllers/db/statements/levelAccess';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { getLevelsAbove } from '@/helpers/entryVerdict';
import { creatorSelector } from '@/redux/creator/creatorSlice';

/**
 * Where "up" leads for this person. Starts looking on mount; the returned
 * function resolves to the nearest open level's id, or undefined for Home, and
 * a tap made before the look finishes waits on the same reads.
 */
export function useUpTarget(statement: Statement | undefined): () => Promise<string | undefined> {
	const creator = useAppSelector(creatorSelector);
	const walkKey = statement
		? [creator?.uid, statement.statementId, ...getLevelsAbove(statement)].join('/')
		: '';

	const resolveUpTarget = useCallback(
		() => (statement ? findUpTarget(statement, creator) : Promise.resolve(undefined)),
		[walkKey],
	);

	useEffect(() => {
		void resolveUpTarget();
	}, [resolveUpTarget]);

	return resolveUpTarget;
}
