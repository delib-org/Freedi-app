import { FC, useState, useEffect } from 'react';
import SectionTitle from '../sectionTitle/SectionTitle';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { Access, Statement } from '@freedi/shared-types';
import MultiSwitch from '@/view/components/switch/multiSwitch/MultiSwitch';
import Checkbox from '@/view/components/checkbox/Checkbox';
import { setStatementMembership } from '@/controllers/db/statements/setStatementMembership';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';
import styles from './MembershipSettings.module.scss';
import { logError } from '@/utils/errorHandling';
import { accessCopyKeys, SELECTABLE_ACCESS_LEVELS } from '@/helpers/peopleLabels';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import InlineNote from '@/view/components/atomic/atoms/InlineNote';

interface Props {
	statement: Statement;
	setStatementToEdit: (statement: Statement) => void;
}

const MembershipSettings: FC<Props> = ({ statement, setStatementToEdit }) => {
	const { t } = useTranslation();

	// Get the top parent statement to check its access level
	const topParentStatement = useAppSelector(statementSelector(statement?.topParentId));

	// Determine if this statement is inheriting access
	// For non-top-level statements: inherit by default if no membership.access is defined
	// For top-level statements: never inherit (always have their own access)
	// Handle deprecated 'open' value - treat it as not having membership for sub-statements
	const isTopLevel = statement?.parentId === 'top';
	const hasDeprecatedOpen = statement?.membership?.access === 'open' && !isTopLevel;
	const hasOwnMembership = Boolean(statement?.membership?.access) && !hasDeprecatedOpen;
	const isInheriting = isTopLevel ? false : !hasOwnMembership;

	const [inheritAccess, setInheritAccess] = useState<boolean>(isInheriting);
	const [saveFailed, setSaveFailed] = useState(false);
	const [membershipAccess, setMembershipAccess] = useState<Access>(
		// If it has deprecated 'open' and should inherit, use parent's access
		hasDeprecatedOpen
			? (topParentStatement?.membership?.access ?? Access.openToAll)
			: (statement?.membership?.access ??
					topParentStatement?.membership?.access ??
					Access.openToAll),
	);

	// Update state when statement changes
	useEffect(() => {
		// Recalculate values to avoid stale closures
		const currentIsTopLevel = statement?.parentId === 'top';
		const isDeprecatedOpen = statement?.membership?.access === 'open' && !currentIsTopLevel;
		const shouldInherit = currentIsTopLevel
			? false
			: !statement?.membership?.access || isDeprecatedOpen;

		setInheritAccess(shouldInherit);

		// Determine the correct membership access
		let newMembershipAccess: Access;
		if (statement?.membership?.access && !isDeprecatedOpen) {
			// Statement has its own valid access level
			newMembershipAccess = statement.membership.access as Access;
		} else if (topParentStatement?.membership?.access) {
			// Use inherited access from top parent
			newMembershipAccess = topParentStatement.membership.access;
		} else {
			// Default fallback
			newMembershipAccess = Access.openToAll;
		}

		setMembershipAccess(newMembershipAccess);
	}, [statement?.parentId, statement?.membership?.access, topParentStatement?.membership?.access]);

	if (!statement) return null;

	// Get inherited access level
	const inheritedAccess = topParentStatement?.membership?.access ?? Access.openToAll;

	/** Writes the access level; on failure the picker shows what is really saved. */
	async function saveAccess(access: Access | null): Promise<void> {
		const previous = { inherit: inheritAccess, access: membershipAccess };
		setSaveFailed(false);
		try {
			await setStatementMembership({ statement, membershipAccess: access });
		} catch (error) {
			logError(error, {
				operation: 'membershipSettings.MembershipSettings.saveAccess',
				statementId: statement.statementId,
				metadata: { access },
			});
			setInheritAccess(previous.inherit);
			setMembershipAccess(previous.access);
			setSaveFailed(true);
		}
	}

	const handleInheritChange = (checked: boolean) => {
		setInheritAccess(checked);

		if (checked) {
			// Clear the statement's own access to inherit from parent
			if (statement.statementId === '') {
				// New statement - ensure no membership is set
				const updatedStatement = { ...statement };
				// Explicitly remove membership field
				if ('membership' in updatedStatement) {
					delete updatedStatement.membership;
				}
				setStatementToEdit(updatedStatement);
			} else {
				// Existing statement - clear membership access
				void saveAccess(null);
			}
			// Update local state to show inherited access
			setMembershipAccess(inheritedAccess);
		} else {
			// Set a specific access level
			const newAccess = membershipAccess || inheritedAccess || Access.openToAll;
			if (statement.statementId === '') {
				setStatementToEdit({
					...statement,
					membership: {
						...statement.membership,
						access: newAccess,
					},
				});
			} else {
				void saveAccess(newAccess);
			}
		}
	};

	const handleAccessChange = (newAccess: Access) => {
		// Validate the new access value
		if (!newAccess && newAccess !== Access.public) {
			logError(newAccess, {
				operation: 'membershipSettings.MembershipSettings.handleAccessChange',
				metadata: { message: 'Invalid access value:' },
			});

			return;
		}

		// First, automatically uncheck inherit if it was checked
		if (inheritAccess) {
			setInheritAccess(false);
		}

		setMembershipAccess(newAccess);

		// Save the access level
		if (statement.statementId === '') {
			// New statement - set membership with specific access
			setStatementToEdit({
				...statement,
				membership: {
					...statement.membership,
					access: newAccess,
				},
			});
		} else {
			// Existing statement - update database
			void saveAccess(newAccess);
		}
	};

	const getAccessLabel = (access: Access): string => t(accessCopyKeys(access).label);

	return (
		<div className={styles.membershipSettings}>
			<SectionTitle title={t('people.whoCanJoin')} />

			{!isTopLevel && (
				<div className={styles.inheritSection}>
					<Checkbox
						label={t('people.sameAsGroup')}
						isChecked={inheritAccess}
						onChange={handleInheritChange}
						className={styles.inheritCheckbox}
					/>

					{inheritAccess && (
						<div className={styles.inheritedInfo}>
							<span className={styles.value}>
								{fillPlaceholders(t('people.groupIs'), { value: getAccessLabel(inheritedAccess) })}
							</span>
							{topParentStatement && (
								<span className={styles.source}>
									{fillPlaceholders(t('people.setInGroup'), { name: topParentStatement.statement })}
								</span>
							)}
						</div>
					)}
				</div>
			)}

			{(isTopLevel || !inheritAccess) && (
				<div className={styles.accessSelector}>
					{!isTopLevel && <div className={styles.overrideLabel}>{t('people.changeHere')}</div>}
					<MultiSwitch
						options={SELECTABLE_ACCESS_LEVELS.map((access) => ({
							label: t(accessCopyKeys(access).label),
							toolTip: t(accessCopyKeys(access).hint),
							value: access as string,
						}))}
						currentValue={membershipAccess as string}
						onClick={(newValue) => handleAccessChange(newValue as Access)}
					/>
				</div>
			)}

			{saveFailed && <InlineNote variant="error">{t('people.error.save')}</InlineNote>}
		</div>
	);
};

export default MembershipSettings;
