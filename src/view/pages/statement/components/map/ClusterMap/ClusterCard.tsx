import { DragEvent, FC, useState } from 'react';
import type { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { logError } from '@/utils/errorHandling';
import type { ClusterPaletteEntry } from '../mapHelpers/mindElixirTransform';
import styles from './ClusterBoard.module.scss';

interface Props {
	statement: Statement;
	color: ClusterPaletteEntry;
	/** True when the current user may edit/delete/move/duplicate this card. */
	canManage: boolean;
	/** True when the admin enabled evaluation display on this board. */
	showEval: boolean;
	isEditing: boolean;
	onRequestEdit: () => void;
	onSaveText: (newText: string) => void;
	onCancelEdit: () => void;
	onDuplicate: () => void;
	onDelete: () => void;
	onDragStart: (e: DragEvent) => void;
}

const ClusterCard: FC<Props> = ({
	statement,
	color,
	canManage,
	showEval,
	isEditing,
	onRequestEdit,
	onSaveText,
	onCancelEdit,
	onDuplicate,
	onDelete,
	onDragStart,
}) => {
	const { t } = useTranslation();
	const { creator } = useAuthentication();
	const myEval = useAppSelector(evaluationSelector(statement.statementId));
	const [menuOpen, setMenuOpen] = useState(false);

	const evaluate = (value: number) => {
		if (!creator) return;
		const next = myEval === value ? 0 : value;
		setEvaluationToDB(statement, creator, next).catch((error) =>
			logError(error, {
				operation: 'ClusterCard.evaluate',
				statementId: statement.statementId,
			}),
		);
	};

	const numberOfEvaluators = statement.evaluation?.numberOfEvaluators ?? 0;
	const average = statement.evaluation?.averageEvaluation ?? 0;
	const consensus = statement.consensus ?? 0;

	return (
		<div
			className={styles.card}
			style={{ background: color.card, color: color.text }}
			draggable={canManage}
			onDragStart={onDragStart}
			onDoubleClick={canManage && !isEditing ? onRequestEdit : undefined}
		>
			{canManage && !isEditing && (
				<div className={styles.cardMenu}>
					<button
						type="button"
						className={styles.cardMenuButton}
						aria-label={t('Options')}
						onClick={() => setMenuOpen((open) => !open)}
					>
						⋮
					</button>
					{menuOpen && (
						<div className={styles.cardMenuList} onMouseLeave={() => setMenuOpen(false)}>
							<button
								type="button"
								onClick={() => {
									setMenuOpen(false);
									onRequestEdit();
								}}
							>
								{t('Edit')}
							</button>
							<button
								type="button"
								onClick={() => {
									setMenuOpen(false);
									onDuplicate();
								}}
							>
								{t('Duplicate')}
							</button>
							<button
								type="button"
								onClick={() => {
									setMenuOpen(false);
									onDelete();
								}}
							>
								{t('Delete')}
							</button>
						</div>
					)}
				</div>
			)}

			{isEditing ? (
				<textarea
					className={styles.cardEdit}
					defaultValue={statement.statement}
					autoFocus
					onFocus={(e) => e.currentTarget.select()}
					onBlur={(e) => onSaveText(e.currentTarget.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault();
							e.currentTarget.blur();
						}
						if (e.key === 'Escape') onCancelEdit();
					}}
				/>
			) : (
				<span className={styles.cardText}>{statement.statement}</span>
			)}

			<div className={styles.cardFooter}>
				<div className={styles.evalButtons}>
					<button
						type="button"
						className={`${styles.evalButton} ${myEval === 1 ? styles.evalButtonAgree : ''}`}
						aria-label={t('Agree')}
						aria-pressed={myEval === 1}
						onClick={() => evaluate(1)}
					>
						▲
					</button>
					<button
						type="button"
						className={`${styles.evalButton} ${myEval === -1 ? styles.evalButtonDisagree : ''}`}
						aria-label={t('Disagree')}
						aria-pressed={myEval === -1}
						onClick={() => evaluate(-1)}
					>
						▼
					</button>
				</div>

				{showEval && (
					<div className={styles.evalStats}>
						<span title={t('Consensus')}>≈{consensus.toFixed(1)}</span>
						<span title={t('Evaluators')}>👤{numberOfEvaluators}</span>
						<span title={t('Average')}>⌀{average.toFixed(1)}</span>
					</div>
				)}
			</div>
		</div>
	);
};

export default ClusterCard;
