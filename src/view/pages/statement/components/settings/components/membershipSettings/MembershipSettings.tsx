import { FC, useState, useEffect } from 'react';
import { Access, Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { setStatementMembership } from '@/controllers/db/statements/setStatementMembership';
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';
import { clearStatementFields, statementSelector } from '@/redux/statements/statementsSlice';
import { logError } from '@/utils/errorHandling';
import { accessCopyKeys, SELECTABLE_ACCESS_LEVELS } from '@/helpers/peopleLabels';
import { isAccessInherited, resolveEffectiveAccess } from '@/helpers/effectiveAccess';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import InlineNote from '@/view/components/atomic/atoms/InlineNote';
import InheritanceSwitch from '@/view/components/atomic/molecules/InheritanceSwitch';
import AccessPicker from '@/view/components/atomic/molecules/AccessPicker';
import styles from './MembershipSettings.module.scss';

const OPERATION = 'membershipSettings.MembershipSettings.saveAccess';

interface Props {
	statement: Statement;
	setStatementToEdit: (statement: Statement) => void;
}

interface AccessChoice {
	isInherited: boolean;
	access: Access;
}

/**
 * Who can join (#join). A sub-space shows "Same as the group | Change for this
 * question" above the access picker; a top-level space shows the picker alone.
 * Writes `membership.access` (cleared to inherit) exactly as before.
 */
const MembershipSettings: FC<Props> = ({ statement, setStatementToEdit }) => {
	const { t } = useTranslation();
	const dispatch = useAppDispatch();
	const topParent = useAppSelector(statementSelector(statement?.topParentId));
	const isTopLevel = statement?.parentId === 'top';
	const inheritedAccess = topParent?.membership?.access ?? Access.openToAll;

	const savedChoice = (): AccessChoice => ({
		isInherited: isAccessInherited(statement),
		access: resolveEffectiveAccess(statement, topParent),
	});

	const [choice, setChoice] = useState<AccessChoice>(savedChoice);
	const [savingValue, setSavingValue] = useState<Access | null>(null);
	const [saveFailed, setSaveFailed] = useState(false);

	useEffect(() => {
		setChoice(savedChoice());
	}, [statement?.parentId, statement?.membership?.access, topParent?.membership?.access]);

	if (!statement) return null;

	const isNewStatement = statement.statementId === '';

	/** Writes the level (null = inherit); on failure the picker shows what is really saved. */
	async function saveAccess(next: AccessChoice): Promise<void> {
		const previous = choice;
		setChoice(next);
		setSaveFailed(false);

		if (isNewStatement) {
			setStatementToEdit(withAccess(statement, next.isInherited ? null : next.access));

			return;
		}

		setSavingValue(next.access);
		try {
			await setStatementMembership({
				statement,
				membershipAccess: next.isInherited ? null : next.access,
			});
			// The listener's merge keeps a deleted field alive; drop it here.
			if (next.isInherited) {
				dispatch(
					clearStatementFields({ statementId: statement.statementId, fields: ['membership'] }),
				);
			}
		} catch (error) {
			logError(error, {
				operation: OPERATION,
				statementId: statement.statementId,
				metadata: { access: next.access, isInherited: next.isInherited },
			});
			setChoice(previous);
			setSaveFailed(true);
		} finally {
			setSavingValue(null);
		}
	}

	const handleInheritChange = (isInherited: boolean): void => {
		void saveAccess({ isInherited, access: isInherited ? inheritedAccess : choice.access });
	};

	const handleAccessChange = (access: Access): void => {
		void saveAccess({ isInherited: false, access });
	};

	const accessLabel = (access: Access): string => t(accessCopyKeys(access).label);
	const picker = (
		<AccessPicker
			legend={t('people.whoCanJoin')}
			options={SELECTABLE_ACCESS_LEVELS.map((access) => ({
				value: access,
				label: accessLabel(access),
				hint: t(accessCopyKeys(access).hint),
			}))}
			value={choice.access === Access.open ? Access.openToAll : choice.access}
			onChange={handleAccessChange}
			isInherited={!isTopLevel && choice.isInherited}
			savingValue={savingValue}
		/>
	);

	return (
		<div className={styles.membershipSettings}>
			{isTopLevel ? (
				picker
			) : (
				<InheritanceSwitch
					isInherited={choice.isInherited}
					onChange={handleInheritChange}
					inheritLabel={t('people.sameAsGroup')}
					overrideLabel={t('people.changeHere')}
					groupLabel={t('people.whoCanJoin')}
					isSaving={savingValue !== null}
					caption={fillPlaceholders(t('people.groupIs'), { value: accessLabel(inheritedAccess) })}
				>
					{picker}
				</InheritanceSwitch>
			)}
			{saveFailed && <InlineNote variant="error">{t('people.error.save')}</InlineNote>}
		</div>
	);
};

/** A new (unsaved) statement carries its level on the draft; null drops it. */
function withAccess(statement: Statement, access: Access | null): Statement {
	if (access === null) {
		const draft = { ...statement };
		delete draft.membership;

		return draft;
	}

	return { ...statement, membership: { ...statement.membership, access } };
}

export default MembershipSettings;
