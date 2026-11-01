import { FC, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import Button from '@/view/components/atomic/atoms/Button';
import Loader from '@/view/components/atomic/atoms/Loader';
import SegmentedControl from '@/view/components/atomic/atoms/SegmentedControl/SegmentedControl';
import EmptyState from '@/view/components/atomic/molecules/EmptyState';
import Modal from '@/view/components/atomic/molecules/Modal';
import { ClipboardCheck } from 'lucide-react';
import type {
	EntryCheckState,
	EntryStatus,
} from '@/view/pages/statement/components/host/people/useEntryCheck';
import MemberReviewList from './memberReviewList/MemberReviewList';
import styles from './MemberValidation.module.scss';

type EntryFilter = EntryStatus | 'all';

const FILTERS: ReadonlyArray<{ id: EntryFilter; label: string }> = [
	{ id: 'all', label: 'people.filter.all' },
	{ id: 'pending', label: 'people.entry.waitingReview' },
	{ id: 'flagged', label: 'people.entry.flagged' },
	{ id: 'approved', label: 'people.entry.approved' },
	{ id: 'banned', label: 'people.entry.blocked' },
];

const COUNT_LINE: ReadonlyArray<{ id: EntryStatus; label: string }> = FILTERS.filter(
	(filter): filter is { id: EntryStatus; label: string } => filter.id !== 'all',
);

interface Props {
	statement: Statement;
	entryCheck: EntryCheckState;
}

/**
 * Entry check (#entry-check): the review counts and one "Review answers"
 * button. The review itself — status tabs, per-person answers, Approve /
 * Flag / Block — opens in a Modal; it needs the width (UX §6.5).
 */
const MemberValidation: FC<Props> = ({ statement, entryCheck }) => {
	const { t } = useTranslation();
	const [isReviewing, setIsReviewing] = useState(false);
	const [filter, setFilter] = useState<EntryFilter>('pending');
	const { members, counts, isLoading, reload, decide } = entryCheck;
	const filtered = filter === 'all' ? members : members.filter((m) => m.status === filter);

	return (
		<div className={styles.entryCheck}>
			<p className={styles.counts}>
				{COUNT_LINE.map(({ id, label }) => (
					<span key={id} className={styles.count}>
						<span className={styles.countNumber}>{counts[id]}</span> {t(label)}
					</span>
				))}
			</p>
			<Button
				text={t('people.reviewAnswers')}
				variant="primary"
				size="small"
				className="button--touch"
				onClick={() => setIsReviewing(true)}
			/>

			<Modal
				isOpen={isReviewing}
				onClose={() => setIsReviewing(false)}
				size="large"
				title={t('people.entryCheck')}
				closeButtonLabel={t('Close')}
			>
				<SegmentedControl
					segments={FILTERS.map(({ id, label }) => ({ id, label: t(label), count: counts[id] }))}
					activeId={filter}
					onChange={(id) => setFilter(id as EntryFilter)}
					ariaLabel={t('people.entryCheck')}
				/>
				{isLoading && <Loader />}
				{!isLoading && members.length === 0 && (
					<EmptyState compact icon={<ClipboardCheck />} text={t('people.entry.empty')} />
				)}
				{!isLoading && members.length > 0 && (
					<MemberReviewList
						members={filtered}
						onMemberAction={decide}
						statementId={statement.statementId}
						statement={statement}
						onRefresh={reload}
					/>
				)}
			</Modal>
		</div>
	);
};

export default MemberValidation;
