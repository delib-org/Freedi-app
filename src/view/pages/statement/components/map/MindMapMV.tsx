import {
	statementDescendantsSelector,
	statementSelector,
} from '@/redux/statements/statementsSlice';
import { useMemo, useState, useRef } from 'react';
import { shallowEqual, useSelector } from 'react-redux';
import { useParams } from 'react-router';
import { resultsByParentId } from './mapCont';
import { Statement, Results } from '@freedi/shared-types';
import { APIEndPoint, isChatMessage } from '@/controllers/general/helpers';
import { logError } from '@/utils/errorHandling';

export function useMindMap(statementIdPassed: string | null = null) {
	const { statementId: paramsStatement } = useParams();
	const statementId = statementIdPassed ?? paramsStatement;
	const statement = useSelector(statementSelector(statementId));

	// One selector instance per subject, and shallowEqual so an update anywhere
	// else in the store (or a no-op re-dispatch) keeps the same array: Redux
	// keeps the object of every statement that did not change.
	const descendantsSelector = useMemo(
		() => statementDescendantsSelector(statementId),
		[statementId],
	);
	const allDescendants: Statement[] = useSelector(descendantsSelector, shallowEqual);
	const descendants = useMemo(
		() => allDescendants.filter((statement) => !isChatMessage(statement.statementType)),
		[allDescendants],
	);

	const [loading, setLoading] = useState(false);

	// REMOVED: Duplicate listener - descendants are now loaded by useStatementListeners hook
	// when screen is 'mind-map', which calls listenToAllDescendants()
	// This ensures all sub-statements are loaded correctly on direct navigation

	const flat = useMemo(() => isFlat(descendants, statementId), [descendants, statementId]);

	// The subject doc changes on every child write (lastChildUpdate), so it is
	// only taken up when a field the maps show changes: its title, color, or
	// the admin map settings (statementSettings.map).
	const subjectKey = statement
		? JSON.stringify([
				statement.statementId,
				statement.statement,
				statement.color,
				statement.statementSettings,
			])
		: '';
	const subjectRef = useRef<{ key: string; statement: Statement | undefined }>({
		key: '',
		statement: undefined,
	});
	if (subjectRef.current.key !== subjectKey) {
		subjectRef.current = { key: subjectKey, statement };
	}
	const subject = subjectRef.current.statement;

	const results = useMemo<Results | null>(() => {
		if (!subject) return null;
		try {
			return resultsByParentId(subject, descendants);
		} catch (error) {
			logError(error, {
				operation: 'useMindMap.calculateResults',
				statementId: subject.statementId,
				metadata: { descendantsCount: descendants.length },
			});

			return null;
		}
	}, [subject, descendants]);

	function handleCluster(statementId: string) {
		setLoading(true);
		const endPoint = APIEndPoint('getCluster', {});
		fetch(endPoint, {
			method: 'POST',
			body: JSON.stringify({
				statementId,
			}),
			headers: {
				'Content-Type': 'application/json',
			},
		})
			.catch((error) => {
				logError(error, {
					operation: 'useMindMap.handleCluster',
					statementId,
				});
			})
			.finally(() => {
				setLoading(false);
			});
	}

	function handleRecoverSnapshot(statementId: string) {
		setLoading(true);
		const endPoint = APIEndPoint('recoverLastSnapshot', {});
		fetch(endPoint, {
			method: 'POST',
			body: JSON.stringify({ snapshotId: statementId }),
			headers: {
				'Content-Type': 'application/json',
			},
		})
			.catch((error) => {
				logError(error, {
					operation: 'useMindMap.handleRecoverSnapshot',
					metadata: { snapshotId: statementId },
				});
			})
			.finally(() => {
				setLoading(false);
			});
	}

	return {
		descendants,
		results,
		loading,
		handleRecoverSnapshot,
		handleCluster,
		flat,
	};
}

function isFlat(descendants: Statement[], statementId: string) {
	return !descendants.some(
		(descendant) => descendant.isCluster && descendant.parentId === statementId,
	);
}
