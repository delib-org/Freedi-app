import { FC, useState, useEffect } from 'react'
import SectionTitle from '../sectionTitle/SectionTitle'
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { Access, Statement } from 'delib-npm';
import MultiSwitch from '@/view/components/switch/multiSwitch/MultiSwitch';
import Checkbox from '@/view/components/checkbox/Checkbox';
import { setStatementMembership } from '@/controllers/db/statements/setStatementMembership';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';
import styles from './MembershipSettings.module.scss';

interface Props {
	statement: Statement;
	setStatementToEdit: (statement: Statement) => void;
}

const MembershipSettings: FC<Props> = ({ statement, setStatementToEdit }) => {
	const { t } = useUserConfig();
	
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
	
	// Debug logging
	console.info('MembershipSettings Debug:', {
		statementId: statement?.statementId,
		parentId: statement?.parentId,
		isTopLevel,
		hasDeprecatedOpen,
		hasOwnMembership,
		membershipAccess: statement?.membership?.access,
		isInheriting,
		topParentAccess: topParentStatement?.membership?.access
	});
	
	const [inheritAccess, setInheritAccess] = useState<boolean>(isInheriting);
	const [membershipAccess, setMembershipAccess] = useState<Access>(
		// If it has deprecated 'open' and should inherit, use parent's access
		hasDeprecatedOpen 
			? (topParentStatement?.membership?.access ?? Access.openToAll)
			: (statement?.membership?.access ?? topParentStatement?.membership?.access ?? Access.openToAll)
	);

	// Update state when statement changes
	useEffect(() => {
		const isDeprecatedOpen = statement?.membership?.access === 'open' && !isTopLevel;
		const shouldInherit = isTopLevel ? false : (!statement?.membership?.access || isDeprecatedOpen);
		setInheritAccess(shouldInherit);
		
		if (statement?.membership?.access && !isDeprecatedOpen) {
			// Statement has its own valid access level
			setMembershipAccess(statement.membership.access);
		} else if (topParentStatement?.membership?.access) {
			// Use inherited access from top parent
			setMembershipAccess(topParentStatement.membership.access);
		} else {
			// Default fallback
			setMembershipAccess(Access.openToAll);
		}
	}, [statement?.parentId, statement?.membership?.access, topParentStatement?.membership?.access, isTopLevel]);

	if (!statement) return null;
	
	// Get inherited access level
	const inheritedAccess = topParentStatement?.membership?.access ?? Access.openToAll;

	const handleInheritChange = (checked: boolean) => {
		setInheritAccess(checked);
		
		if (checked) {
			// Clear the statement's own access to inherit from parent
			if (statement.statementId === "") {
				// New statement - ensure no membership is set
				const updatedStatement = { ...statement };
				// Explicitly remove membership field
				if ('membership' in updatedStatement) {
					delete updatedStatement.membership;
				}
				setStatementToEdit(updatedStatement);
			} else {
				// Existing statement - clear membership access
				setStatementMembership({ statement, membershipAccess: null });
			}
			// Update local state to show inherited access
			setMembershipAccess(inheritedAccess);
		} else {
			// Set a specific access level
			const newAccess = membershipAccess || inheritedAccess || Access.openToAll;
			if (statement.statementId === "") {
				setStatementToEdit({
					...statement,
					membership: {
						...statement.membership,
						access: newAccess
					}
				});
			} else {
				setStatementMembership({ statement, membershipAccess: newAccess });
			}
		}
	};

	const handleAccessChange = (newAccess: Access) => {
		setMembershipAccess(newAccess);
		
		// Only save the access level if not inheriting
		if (!inheritAccess) {
			if (statement.statementId === "") {
				// New statement - set membership with specific access
				setStatementToEdit({
					...statement,
					membership: {
						...statement.membership,
						access: newAccess
					}
				});
			} else {
				// Existing statement - update database
				setStatementMembership({ statement, membershipAccess: newAccess });
			}
		}
	};

	const getAccessLabel = (access: Access): string => {
		switch (access) {
			case Access.public:
				return t('Public');
			case Access.openToAll:
				return t('Open to all');
			case Access.openForRegistered:
				return t('Open for registered members');
			case Access.moderated:
				return t('Moderated');
			case Access.secret:
				return t('Secret');
			default:
				return t('Open to all');
		}
	};

	return (
		<div className={styles.membershipSettings}>
			<SectionTitle title={t('Membership Settings')} />
			
			{!isTopLevel && (
				<div className={styles.inheritSection}>
					<Checkbox
						label={t('Inherit from parent group')}
						isChecked={inheritAccess}
						onChange={handleInheritChange}
						className={styles.inheritCheckbox}
					/>
					
					{inheritAccess && (
						<div className={styles.inheritedInfo}>
							<span className={styles.label}>{t('Inherited access level')}:</span>
							<span className={styles.value}>{getAccessLabel(inheritedAccess)}</span>
							{topParentStatement && (
								<span className={styles.source}>
									{t('from')}: {topParentStatement.statement}
								</span>
							)}
						</div>
					)}
				</div>
			)}
			
			{(isTopLevel || !inheritAccess) && (
				<div className={styles.accessSelector}>
					{!isTopLevel && (
						<div className={styles.overrideLabel}>
							{t('Set specific access level for this statement')}:
						</div>
					)}
					<MultiSwitch
						options={[
							{
								label: t('Public'),
								toolTip: t('Anyone can view and interact without login'),
								value: Access.public,
							},
							{
								label: t('Open to all'),
								toolTip: t('Anyone can join the group'),
								value: Access.openToAll,
							},
							{
								label: t('Registered'),
								toolTip: t('Only registered members can join'),
								value: Access.openForRegistered,
							},
							{
								label: t('Moderated'),
								toolTip: t('Requires approval to join'),
								value: Access.moderated,
							},
							{
								label: t('Secret'),
								toolTip: t('Invitation only'),
								value: Access.secret,
							}
						]}
						currentValue={membershipAccess}
						onClick={(newValue) => handleAccessChange(newValue as Access)}
					/>
				</div>
			)}
		</div>
	);
};

export default MembershipSettings;