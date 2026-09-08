import { useMemo, useRef, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button, EmptyState, Input, Skeleton } from '@/components/atomic/atoms';
import { Tag } from '@/components/atomic/atoms/Tag';
import { useLinkableQuestions, type LinkableQuestion } from '@/db/orgActivities';
import { linkOrgStatement } from '@/db/orgFunctions';
import { callableMessage } from '../_shared/callableErrors';
import { logError } from '@/utils/logError';
import SimpleModal from '../_shared/SimpleModal';
import styles from './OrgQuestions.module.scss';

interface AddExistingQuestionModalProps {
	organizationId: string;
	userId: string;
	/** Questions already on this board — owned or linked — hidden from the list. */
	alreadyOnBoard: ReadonlySet<string>;
	onClose: () => void;
	onLinked: (statementId: string) => void;
}

/** How many matches to render before asking the consultant to narrow the search. */
const MAX_ROWS = 40;

function matches(question: LinkableQuestion, search: string): boolean {
	if (!search) return true;

	return question.title.toLowerCase().includes(search);
}

/**
 * Adds a question or survey that already exists to this organization's board.
 *
 * The list is the consultant's own questions — the ones they administer —
 * because linking hands the organization's admins authority over the question.
 * The name typed here is the organization's name for it; participants go on
 * seeing the question's own title, which the row shows underneath.
 */
export default function AddExistingQuestionModal({
	organizationId,
	userId,
	alreadyOnBoard,
	onClose,
	onLinked,
}: AddExistingQuestionModalProps) {
	const { t, tWithParams } = useTranslation();
	const searchRef = useRef<HTMLDivElement>(null);
	const [search, setSearch] = useState('');
	const [selected, setSelected] = useState<LinkableQuestion | null>(null);
	const [label, setLabel] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	const { data: candidates, loading } = useLinkableQuestions(userId);

	const available = useMemo(
		() => candidates.filter((question) => !alreadyOnBoard.has(question.statementId)),
		[candidates, alreadyOnBoard],
	);
	const filtered = useMemo(() => {
		const needle = search.trim().toLowerCase();

		return available.filter((question) => matches(question, needle));
	}, [available, search]);
	const shown = filtered.slice(0, MAX_ROWS);
	const hiddenCount = filtered.length - shown.length;

	const select = (question: LinkableQuestion) => {
		setSelected(question);
		setLabel(question.title);
		setError('');
	};

	const handleAdd = async () => {
		if (!selected || submitting) return;
		setSubmitting(true);
		setError('');
		try {
			const trimmed = label.trim();
			await linkOrgStatement({
				organizationId,
				statementId: selected.statementId,
				// Same as the question's own title → no board name worth storing.
				label: trimmed && trimmed !== selected.title ? trimmed : undefined,
			});
			onLinked(selected.statementId);
		} catch (err) {
			logError(err, {
				operation: 'AddExistingQuestionModal.link',
				organizationId,
				statementId: selected.statementId,
			});
			setError(callableMessage(err, t('Could not add the question. Please try again.')));
			setSubmitting(false);
		}
	};

	return (
		<SimpleModal
			title={t('Add an existing question')}
			onClose={onClose}
			busy={submitting}
			size="medium"
			initialFocusRef={searchRef}
			footer={
				<>
					<Button text={t('Cancel')} variant="secondary" disabled={submitting} onClick={onClose} />
					<Button
						text={t('Add to organization')}
						variant="primary"
						disabled={!selected || submitting}
						loading={submitting}
						onClick={handleAdd}
					/>
				</>
			}
		>
			<div className={styles.form}>
				<div ref={searchRef} tabIndex={-1} className={styles.field}>
					<Input
						label={t('Find a question')}
						value={search}
						onChange={setSearch}
						placeholder={t('Search your questions')}
						fullWidth
						autoFocus
						disabled={submitting}
					/>
				</div>

				{loading && (
					<div className={styles.pickerList}>
						<Skeleton variant="text" />
						<Skeleton variant="text" width="80%" />
						<Skeleton variant="text" width="60%" />
					</div>
				)}

				{!loading && available.length === 0 && (
					<EmptyState
						icon="🔗"
						title={t('Nothing to add')}
						text={t(
							'Questions you administer will appear here, ready to add to this organization.',
						)}
						compact
					/>
				)}

				{!loading && available.length > 0 && filtered.length === 0 && (
					<EmptyState icon="🔍" title={t('No question matches that search.')} compact />
				)}

				{shown.length > 0 && (
					<ul className={styles.pickerList} role="listbox" aria-label={t('Your questions')}>
						{shown.map((question) => {
							const isSelected = selected?.statementId === question.statementId;

							return (
								<li key={question.statementId}>
									<button
										type="button"
										role="option"
										aria-selected={isSelected}
										className={
											isSelected
												? `${styles.pickerRow} ${styles.pickerRowSelected}`
												: styles.pickerRow
										}
										disabled={submitting}
										onClick={() => select(question)}
									>
										<span className={styles.pickerTitle} dir="auto">
											{question.title.trim() || t('Untitled')}
										</span>
										{!question.isTopLevel && <Tag outline>{t('Activity')}</Tag>}
									</button>
								</li>
							);
						})}
					</ul>
				)}

				{hiddenCount > 0 && (
					<p className={styles.pickerHint}>
						{tWithParams('{{count}} more — narrow the search to see them.', {
							count: hiddenCount,
						})}
					</p>
				)}

				{selected && (
					<Input
						label={t('Name it on this board')}
						value={label}
						onChange={setLabel}
						helperText={t('Only this organization sees this name. Participants keep the original.')}
						fullWidth
						disabled={submitting}
					/>
				)}

				{error && (
					<p className={styles.error} role="alert">
						{error}
					</p>
				)}
			</div>
		</SimpleModal>
	);
}
