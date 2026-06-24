import { DragEvent, FC, useState } from 'react';
import type { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { enhancedEvaluationsThumbs } from '@/view/pages/statement/components/evaluations/components/evaluation/enhancedEvaluation/EnhancedEvaluationModel';
import { getEvaluationThumbIdByScore } from '@/view/pages/statement/components/evaluations/statementsEvaluationCont';
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
	/** Id of the cluster this card currently belongs to (for move animation). */
	clusterId: string;
	/** Clusters this card can be moved to (excludes its current cluster). */
	moveTargets: { id: string; label: string }[];
	onMove: (targetId: string) => void;
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
	clusterId,
	moveTargets,
	onMove,
}) => {
	const { t } = useTranslation();
	const { creator } = useAuthentication();
	const myEval = useAppSelector(evaluationSelector(statement.statementId));
	const [menuOpen, setMenuOpen] = useState(false);
	const [facesOpen, setFacesOpen] = useState(false);

	const evaluate = (value: number) => {
		if (!creator) return;
		setEvaluationToDB(statement, creator, value).catch((error) =>
			logError(error, {
				operation: 'ClusterCard.evaluate',
				statementId: statement.statementId,
			}),
		);
		// Close the face picker once the user evaluates.
		setFacesOpen(false);
	};

	const numberOfEvaluators = statement.evaluation?.numberOfEvaluators ?? 0;
	const average = statement.evaluation?.averageEvaluation ?? 0;
	const consensus = statement.consensus ?? 0;
	const hasVoted = myEval !== undefined && myEval !== null;
	const myThumbId = hasVoted ? getEvaluationThumbIdByScore(myEval) : null;
	const myThumb = myThumbId
		? enhancedEvaluationsThumbs.find((thumb) => thumb.id === myThumbId)
		: undefined;
	// Neutral face stands in as the "rate this" icon before the user has voted.
	const neutralThumb = enhancedEvaluationsThumbs.find((thumb) => thumb.evaluation === 0);
	const buttonThumb = myThumb ?? neutralThumb;

	return (
		<div
			className={`${styles.card} ${facesOpen ? styles.cardElevated : ''}`}
			style={{ background: color.card, color: color.text }}
			data-flip-id={statement.statementId}
			data-cluster-id={clusterId}
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
							{moveTargets.length > 0 && (
								<>
									<div className={styles.cardMenuLabel}>{t('Move to')}</div>
									{moveTargets.map((target) => (
										<button
											key={target.id}
											type="button"
											onClick={() => {
												setMenuOpen(false);
												onMove(target.id);
											}}
										>
											{target.label}
										</button>
									))}
								</>
							)}
						</div>
					)}
				</div>
			)}

			{isEditing ? (
				<textarea
					className={styles.cardEdit}
					defaultValue={statement.statement}
					autoFocus
					// Auto-detect LTR/RTL from the typed text and align accordingly.
					dir="auto"
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
				// dir="auto" aligns each note by its own content (Hebrew/Arabic → RTL).
				<span className={styles.cardText} dir="auto">
					{statement.statement}
				</span>
			)}

			<div className={styles.cardFooter}>
				{showEval ? (
					<div className={styles.evalStats}>
						<span title={t('Consensus')}>≈{Math.round(consensus * 100)}</span>
						<span title={t('Evaluators')}>👤{numberOfEvaluators}</span>
						<span title={t('Average')}>⌀{average.toFixed(1)}</span>
					</div>
				) : (
					<span />
				)}

				<button
					type="button"
					className={`${styles.evalToggle} ${hasVoted ? styles.evalToggleVoted : ''}`}
					style={{ backgroundColor: buttonThumb?.colorSelected }}
					aria-label={t('Evaluate')}
					aria-expanded={facesOpen}
					title={t('Evaluate')}
					onClick={() => setFacesOpen((open) => !open)}
				>
					{buttonThumb && <img src={buttonThumb.svg} alt={t('Evaluate')} />}
				</button>
			</div>

			{facesOpen && (
				<div className={styles.facesPopup} onMouseLeave={() => setFacesOpen(false)}>
					{enhancedEvaluationsThumbs.map((thumb) => {
						const active = thumb.id === myThumbId;

						return (
							<button
								key={thumb.id}
								type="button"
								className={`${styles.face} ${active ? styles.faceActive : ''}`}
								style={{ backgroundColor: active ? thumb.colorSelected : thumb.color }}
								aria-label={thumb.alt}
								aria-pressed={active}
								onClick={() => evaluate(thumb.evaluation)}
							>
								<img src={thumb.svg} alt={thumb.alt} />
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
};

export default ClusterCard;
