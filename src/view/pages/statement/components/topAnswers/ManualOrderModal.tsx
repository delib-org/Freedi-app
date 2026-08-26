import { DragEvent, FC, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { GripVertical } from 'lucide-react';
import { Statement } from '@freedi/shared-types';
import Modal from '@/view/components/atomic/molecules/Modal/Modal';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { bulkLoadStatements } from '@/controllers/db/statements/bulkLoadStatements';
import {
	fullyLoadedScopeSelector,
	setScopeFullyLoaded,
	statementOptionsSelector,
} from '@/redux/statements/statementsSlice';
import { logError } from '@/utils/errorHandling';
import styles from './TopAnswersPanel.module.scss';

interface ManualOrderModalProps {
	statementId: string;
	isOpen: boolean;
	onClose: () => void;
	/** Persist the hand-placed order. Receives the ids in their new order. */
	onSave: (optionIds: string[]) => Promise<void>;
}

/**
 * Drag-and-drop editor for a question's hand-placed answer order.
 *
 * Reorders **local state only** and commits a single id array on Save. It must
 * not write the per-statement `order` field — that one carries sub-question
 * ordering and is a different concept entirely.
 *
 * The page's own listener only loads the newest window of answers, so the modal
 * bulk-loads the full set on open: an admin ordering "all the answers" has to
 * actually be looking at all of them.
 */
const ManualOrderModal: FC<ManualOrderModalProps> = ({ statementId, isOpen, onClose, onSave }) => {
	const { t } = useTranslation();
	const dispatch = useDispatch();
	const options = useSelector(statementOptionsSelector(statementId));
	const fullyLoaded = useSelector(fullyLoadedScopeSelector(statementId));

	const [orderedIds, setOrderedIds] = useState<string[]>([]);
	const [draggedId, setDraggedId] = useState<string | null>(null);
	const [dragOverId, setDragOverId] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	// Load the complete answer set once, when the modal first opens.
	useEffect(() => {
		if (!isOpen || fullyLoaded || isLoading) return;

		let cancelled = false;
		setIsLoading(true);
		bulkLoadStatements(statementId, 'direct')
			.then(({ watermark }) => {
				if (cancelled) return;
				dispatch(setScopeFullyLoaded({ rootId: statementId, mode: 'direct', watermark }));
			})
			.catch((error) =>
				logError(error, {
					operation: 'topAnswers.ManualOrderModal.bulkLoad',
					statementId,
				}),
			)
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});

		return () => {
			cancelled = true;
		};
		// `isLoading` is read but deliberately not a dependency: including it
		// would re-run the effect on the loading flag's own transitions.
	}, [isOpen, fullyLoaded, statementId, dispatch]);

	// Seed the working order from the live option list whenever the modal opens,
	// and extend it as a bulk load brings more answers in. Ids already placed
	// keep their position; newly arrived ones land at the end.
	useEffect(() => {
		if (!isOpen) return;
		setOrderedIds((previous) => {
			const present = new Set(options.map((option) => option.statementId));
			const kept = previous.filter((id) => present.has(id));
			const keptSet = new Set(kept);
			const added = options.map((option) => option.statementId).filter((id) => !keptSet.has(id));

			return [...kept, ...added];
		});
	}, [isOpen, options]);

	const byId = useMemo(() => {
		const map = new Map<string, Statement>();
		for (const option of options) map.set(option.statementId, option);

		return map;
	}, [options]);

	function handleDragStart(id: string): void {
		setDraggedId(id);
	}

	function handleDragOver(e: DragEvent<HTMLLIElement>, id: string): void {
		e.preventDefault();
		if (id !== dragOverId) setDragOverId(id);
	}

	function handleDrop(e: DragEvent<HTMLLIElement>, targetId: string): void {
		e.preventDefault();
		setDragOverId(null);
		if (!draggedId || draggedId === targetId) return;

		setOrderedIds((previous) => {
			const next = previous.filter((id) => id !== draggedId);
			const targetIndex = next.indexOf(targetId);
			if (targetIndex === -1) return previous;
			next.splice(targetIndex, 0, draggedId);

			return next;
		});
	}

	function handleDragEnd(): void {
		setDraggedId(null);
		setDragOverId(null);
	}

	/** Keyboard equivalent of a drag, so the list is orderable without a pointer. */
	function move(id: string, delta: number): void {
		setOrderedIds((previous) => {
			const from = previous.indexOf(id);
			const to = from + delta;
			if (from === -1 || to < 0 || to >= previous.length) return previous;
			const next = [...previous];
			next.splice(to, 0, next.splice(from, 1)[0]);

			return next;
		});
	}

	async function handleSave(): Promise<void> {
		if (isSaving) return;
		setIsSaving(true);
		try {
			await onSave(orderedIds);
			onClose();
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('Order the answers by hand')}
			size="medium"
			ariaLabel={t('Order the answers by hand')}
			footer={
				<>
					<button type="button" className="btn btn--secondary" onClick={onClose}>
						{t('Cancel')}
					</button>
					<button
						type="button"
						className={`btn btn--primary${isSaving ? ' btn--disabled' : ''}`}
						onClick={handleSave}
						disabled={isSaving}
					>
						{isSaving ? t('Saving...') : t('Save order')}
					</button>
				</>
			}
		>
			<p className={styles.modalHelp}>
				{t('Drag an answer to move it. This order replaces the ranking for everyone.')}
			</p>

			{isLoading && <p className={styles.modalHelp}>{t('Loading all answers...')}</p>}

			<ul className={styles.reorderList}>
				{orderedIds.map((id, index) => {
					const option = byId.get(id);
					if (!option) return null;

					return (
						<li
							key={id}
							className={[
								styles.reorderItem,
								draggedId === id ? styles.reorderItemDragging : '',
								dragOverId === id ? styles.reorderItemOver : '',
							]
								.filter(Boolean)
								.join(' ')}
							draggable
							onDragStart={() => handleDragStart(id)}
							onDragOver={(e) => handleDragOver(e, id)}
							onDrop={(e) => handleDrop(e, id)}
							onDragEnd={handleDragEnd}
						>
							<span className={styles.reorderGrip} aria-hidden>
								<GripVertical size={16} />
							</span>
							<span className={styles.reorderIndex}>{index + 1}</span>
							<span className={styles.reorderText}>{option.statement}</span>
							<span className={styles.reorderNudge}>
								<button
									type="button"
									aria-label={t('Move up')}
									disabled={index === 0}
									onClick={() => move(id, -1)}
								>
									↑
								</button>
								<button
									type="button"
									aria-label={t('Move down')}
									disabled={index === orderedIds.length - 1}
									onClick={() => move(id, 1)}
								>
									↓
								</button>
							</span>
						</li>
					);
				})}
			</ul>
		</Modal>
	);
};

export default ManualOrderModal;
