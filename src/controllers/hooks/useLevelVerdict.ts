import { useEffect, useState } from 'react';
import { readLevelVerdict } from '@/controllers/db/statements/levelAccess';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { EntryVerdict, getSubscriptionScopeId, isProvenOpen } from '@/helpers/entryVerdict';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';

/**
 * The person's verdict on one level, or undefined until it is known. Redux
 * answers only when isProvenOpen says it holds enough facts; otherwise this
 * reads, because the person's subscription may simply not be loaded yet.
 */
export function useLevelVerdict(levelId: string | undefined): EntryVerdict | undefined {
	const creator = useAppSelector(creatorSelector);
	const level = useAppSelector(statementSelector(levelId));
	const topParent = useAppSelector(statementSelector(level?.topParentId));
	const subscription = useAppSelector(statementSubscriptionSelector(getSubscriptionScopeId(level)));
	const isKnownOpen = isProvenOpen(level, topParent, subscription, creator);
	const readKey = `${creator?.uid}--${levelId}`;
	const [readResult, setReadResult] = useState<{ key: string; verdict: EntryVerdict }>();

	useEffect(() => {
		if (!levelId || isKnownOpen) return;

		let isCurrent = true;
		readLevelVerdict(levelId, creator).then((verdict) => {
			if (isCurrent) setReadResult({ key: readKey, verdict });
		});

		return () => {
			isCurrent = false;
		};
	}, [levelId, isKnownOpen, readKey]);

	if (!levelId) return undefined;
	if (isKnownOpen) return 'open';

	return readResult?.key === readKey ? readResult.verdict : undefined;
}
