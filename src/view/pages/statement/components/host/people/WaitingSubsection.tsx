import { FC, useRef, useState } from 'react';
import { WaitingMember } from '@freedi/shared-types';
import { UserCheck } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import { formatRelativeTime } from '@/helpers/relativeTime';
import Button from '@/view/components/atomic/atoms/Button';
import Checkbox from '@/view/components/atomic/atoms/Checkbox';
import InlineNote from '@/view/components/atomic/atoms/InlineNote';
import EmptyState from '@/view/components/atomic/molecules/EmptyState';
import PeopleSubsection from '@/view/components/atomic/molecules/PeopleSubsection';
import PersonRow from '@/view/components/atomic/molecules/PersonRow';
import DeclineManyDialog from './DeclineManyDialog';
import { useWaitingSelection } from './useWaitingSelection';
import { WaitingDecision, WaitingDecisions } from './useWaitingDecisions';
import styles from './WaitingSubsection.module.scss';

interface WaitingSubsectionProps {
	decisions: WaitingDecisions;
	isOpen: boolean;
	onToggle: (anchor: string) => void;
	toggleRef: (element: HTMLButtonElement | null) => void;
}

const ROW_ERROR_KEY: Record<WaitingDecision, string> = {
	letIn: 'people.error.letIn',
	decline: 'people.error.decline',
};

const letInButtonId = (subscriptionId: string): string => `waiting-let-in-${subscriptionId}`;

/** Bulk Decline of this many or more asks first (UX 4.3). */
const CONFIRM_DECLINE_FROM = 2;

/**
 * Waiting to join (#waiting): let each person in or decline, one at a time or
 * as a selection. Reversible decisions show Undo; declining several asks first.
 */
const WaitingSubsection: FC<WaitingSubsectionProps> = ({
	decisions,
	isOpen,
	onToggle,
	toggleRef,
}) => {
	const { t, currentLanguage } = useTranslation();
	const { visible, rowErrors, decide } = decisions;
	const selection = useWaitingSelection(visible);
	const [isConfirmingDecline, setIsConfirmingDecline] = useState(false);
	const headerRef = useRef<HTMLButtonElement | null>(null);
	const now = Date.now();

	function setHeader(element: HTMLButtonElement | null): void {
		headerRef.current = element;
		toggleRef(element);
	}

	/** Focus never lands on a removed row: a remaining row's Let in, else the heading. */
	function focusAfterLeaving(leaving: ReadonlyArray<WaitingMember>): void {
		const index = visible.indexOf(leaving[0]);
		const after = visible.slice(index + 1).find((member) => !leaving.includes(member));
		const before = visible
			.slice(0, index)
			.reverse()
			.find((member) => !leaving.includes(member));
		const next = after ?? before;
		window.requestAnimationFrame(() => {
			const target = next
				? document.getElementById(letInButtonId(next.statementsSubscribeId))
				: null;
			(target ?? headerRef.current)?.focus();
		});
	}

	function decideOne(member: WaitingMember, decision: WaitingDecision): void {
		focusAfterLeaving([member]);
		decide([member], decision);
	}

	/** The selection bar goes with the rows, so focus is placed before it does. */
	function decideSelected(decision: WaitingDecision): void {
		focusAfterLeaving(selection.selected);
		decide(selection.selected, decision);
		selection.clear();
	}

	function handleDeclineSelected(): void {
		if (selection.selected.length >= CONFIRM_DECLINE_FROM) setIsConfirmingDecline(true);
		else decideSelected('decline');
	}

	const count = visible.length;

	return (
		<PeopleSubsection
			id="waiting"
			title={t('people.waiting')}
			count={count}
			countLabel={fillPlaceholders(t('people.waitingCount'), { count })}
			isOpen={isOpen}
			onToggle={onToggle}
			toggleRef={setHeader}
		>
			{count === 0 ? (
				<EmptyState
					compact
					icon={<UserCheck />}
					text={t('people.waiting.empty')}
					hint={t('people.waiting.emptyHint')}
				/>
			) : (
				<>
					{selection.selected.length > 0 ? (
						<div className={styles.bulkBar} role="group" aria-label={t('people.waiting')}>
							<span className={styles.bulkCount}>
								{fillPlaceholders(t('people.nSelected'), { count: selection.selected.length })}
							</span>
							<Button
								text={t('people.letIn')}
								variant="approve"
								size="small"
								className="button--touch"
								onClick={() => decideSelected('letIn')}
							/>
							<Button
								text={t('people.decline')}
								variant="secondary"
								size="small"
								className="button--touch"
								onClick={handleDeclineSelected}
							/>
							<Button
								text={t('people.clearSelection')}
								variant="cancel"
								size="small"
								className="button--touch"
								onClick={selection.clear}
							/>
						</div>
					) : (
						<div className={styles.toolbar}>
							<Checkbox
								label={t('people.selectAll')}
								checked={false}
								onChange={selection.toggleAll}
								name="waiting-select-all"
								size="small"
							/>
							<span className={styles.caption}>
								{fillPlaceholders(t('people.summary.waiting'), { count })}
							</span>
						</div>
					)}

					<ul className={styles.list}>
						{visible.map((member) => {
							const id = member.statementsSubscribeId;
							const name = member.user?.displayName ?? '';
							const rowError = rowErrors.get(id);

							return (
								<PersonRow
									key={id}
									name={name}
									photoURL={member.user?.photoURL}
									meta={
										member.createdAt
											? fillPlaceholders(t('people.waiting.asked'), {
													time: formatRelativeTime(member.createdAt, now, currentLanguage),
												})
											: undefined
									}
									stackActionsOnMobile
									testId={`waiting-row-${id}`}
									select={
										<Checkbox
											label=""
											ariaLabel={fillPlaceholders(t('people.selectPerson'), { name })}
											checked={selection.isSelected(id)}
											onChange={() => selection.toggle(id)}
											name={`waiting-select-${id}`}
											size="small"
										/>
									}
									actions={
										<>
											<Button
												id={letInButtonId(id)}
												text={t('people.letIn')}
												ariaLabel={`${t('people.letIn')}: ${name}`}
												variant="approve"
												size="small"
												className="button--touch"
												onClick={() => decideOne(member, 'letIn')}
											/>
											<Button
												text={t('people.decline')}
												ariaLabel={`${t('people.decline')}: ${name}`}
												variant="secondary"
												size="small"
												className="button--touch"
												onClick={() => decideOne(member, 'decline')}
											/>
										</>
									}
									note={
										rowError && (
											<InlineNote variant="error">{t(ROW_ERROR_KEY[rowError])}</InlineNote>
										)
									}
								/>
							);
						})}
					</ul>
				</>
			)}

			<DeclineManyDialog
				isOpen={isConfirmingDecline}
				count={selection.selected.length}
				onCancel={() => setIsConfirmingDecline(false)}
				onConfirm={() => {
					setIsConfirmingDecline(false);
					decideSelected('decline');
				}}
			/>
		</PeopleSubsection>
	);
};

export default WaitingSubsection;
