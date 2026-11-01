import { FC, ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { setConfidenceIndexSettings } from '@/controllers/db/evaluation/setEvaluation';
import { logError } from '@/utils/errorHandling';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import {
	isStakeholderCountInherited,
	resolveInheritedStakeholders,
	type InheritedStakeholders,
} from '@/helpers/stakeholderInheritance';
import InlineNote from '@/view/components/atomic/atoms/InlineNote';
import InheritanceSwitch from '@/view/components/atomic/molecules/InheritanceSwitch';
import { buildPeopleAnchorPath } from '../../../host/hostHubLogic';
import StakeholderMore from './StakeholderMore';
import styles from './ConfidenceIndexSettings.module.scss';

const OPERATION = 'ConfidenceIndexSettings.saveTargetPopulation';

interface ConfidenceIndexSettingsProps {
	statement: Statement;
}

/** A typed count, or 0 (= clear the field, so the space inherits again). */
function parseCount(text: string): number {
	const value = parseInt(text, 10);

	return isNaN(value) || value <= 0 ? 0 : value;
}

/**
 * Stakeholders (#stakeholders): the count first, sample quality and
 * recalculate behind "More". A sub-space inherits the count through
 * "Same as the group | Change for this question"; a top-level space types it.
 * Writes `evaluationSettings.targetPopulation` (removed to inherit) as before.
 */
const ConfidenceIndexSettings: FC<ConfidenceIndexSettingsProps> = ({ statement }) => {
	const { t } = useTranslation();
	const parent = useAppSelector(statementSelector(statement.parentId));
	const top = useAppSelector(statementSelector(statement.topParentId));
	const isTopLevel = statement.parentId === 'top';
	const inherited = resolveInheritedStakeholders(parent, top);
	const declaredHere = statement.evaluationSettings?.targetPopulation;

	const [isInherited, setIsInherited] = useState(isStakeholderCountInherited(statement));
	const [countText, setCountText] = useState(declaredHere ? String(declaredHere) : '');
	const [saveFailed, setSaveFailed] = useState(false);

	useEffect(() => {
		setIsInherited(isStakeholderCountInherited(statement));
		setCountText(declaredHere ? String(declaredHere) : '');
	}, [statement.statementId, statement.parentId, declaredHere]);

	async function saveCount(targetPopulation: number): Promise<void> {
		setSaveFailed(false);
		try {
			await setConfidenceIndexSettings(statement.statementId, { targetPopulation });
		} catch (error) {
			logError(error, {
				operation: OPERATION,
				statementId: statement.statementId,
				metadata: { targetPopulation },
			});
			setSaveFailed(true);
		}
	}

	function handleInheritChange(nextInherited: boolean): void {
		setIsInherited(nextInherited);
		const prefill = nextInherited || inherited.count === undefined ? '' : String(inherited.count);
		setCountText(prefill);
		if (nextInherited || prefill) void saveCount(parseCount(prefill));
	}

	const isReadOnly = !isTopLevel && isInherited;
	const field = (
		<div className={styles.field}>
			<label htmlFor={`${statement.statementId}-stakeholders`}>{t('Number of stakeholders')}</label>
			<input
				id={`${statement.statementId}-stakeholders`}
				type="number"
				min="1"
				inputMode="numeric"
				readOnly={isReadOnly}
				placeholder={inheritedPlaceholder(inherited, t)}
				value={isReadOnly ? '' : countText}
				onChange={(e) => setCountText(e.target.value)}
				onBlur={() => {
					if (!isReadOnly) void saveCount(parseCount(countText));
				}}
				aria-describedby={`${statement.statementId}-stakeholders-hint`}
				data-cy="target-population-input"
			/>
			<p id={`${statement.statementId}-stakeholders-hint`} className={styles.hint}>
				{t('people.stakeholders.hint')}
			</p>
			{saveFailed && <InlineNote variant="error">{t('people.error.save')}</InlineNote>}
		</div>
	);

	return (
		<div className={styles.stakeholders}>
			{isTopLevel ? (
				field
			) : (
				<InheritanceSwitch
					isInherited={isInherited}
					onChange={handleInheritChange}
					inheritLabel={t('people.sameAsGroup')}
					overrideLabel={t('people.changeHere')}
					groupLabel={t('host.people.stakeholders')}
					caption={<InheritedCaption inherited={inherited} groupId={statement.topParentId} t={t} />}
				>
					{field}
				</InheritanceSwitch>
			)}
			<StakeholderMore statement={statement} />
		</div>
	);
};

type Translate = (key: string) => string;

function inheritedPlaceholder(inherited: InheritedStakeholders, t: Translate): string {
	if (inherited.count === undefined) return t('people.notSetAnywhere');
	const source = inherited.isFromGroup
		? t('people.stakeholders.fromGroup')
		: t('people.stakeholders.fromParent');

	return `${inherited.count.toLocaleString()} (${source})`;
}

interface InheritedCaptionProps {
	inherited: InheritedStakeholders;
	groupId: string;
	t: Translate;
}

/** "Group is: 1,200" linking to the group's Stakeholders, or where else it comes from. */
function InheritedCaption({ inherited, groupId, t }: InheritedCaptionProps): ReactNode {
	if (inherited.count === undefined) return t('people.notSetAnywhere');
	const count = inherited.count.toLocaleString();

	if (!inherited.isFromGroup) return `${count} (${t('people.stakeholders.fromParent')})`;

	return (
		<Link to={buildPeopleAnchorPath(groupId, 'stakeholders')} className={styles.groupLink}>
			{fillPlaceholders(t('people.groupIs'), { value: count })}
		</Link>
	);
}

export default ConfidenceIndexSettings;
