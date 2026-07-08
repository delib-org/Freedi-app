import { DragEvent, FC, useEffect, useRef, useState } from 'react';
import {
	getEvaluationScale,
	getEvaluationEntry,
	type RatingMode,
	type Statement,
} from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { enhancedEvaluationsThumbs } from '@/view/pages/statement/components/evaluations/components/evaluation/enhancedEvaluation/EnhancedEvaluationModel';
import { getEvaluationThumbIdByScore } from '@/view/pages/statement/components/evaluations/statementsEvaluationCont';
import { logError } from '@/utils/errorHandling';
import type { ClusterPaletteEntry } from '../mapHelpers/mindElixirTransform';
import NoteFocusOverlay from './NoteFocusOverlay';
import styles from './ClusterBoard.module.scss';

/**
 * The note's own text direction, decided by its first strong-directional
 * character — like `dir="auto"`, but scoped to the NOTE text alone. We set this
 * EXPLICITLY on the card (not `dir="auto"`) so the menu's `inset-inline-end` and
 * the text's `padding-inline-end` resolve against the SAME direction and land on
 * the same side — otherwise the "⋮" overlaps RTL text. (`dir="auto"` on the card
 * would ignore the note — the menu/footer would flip it to LTR — and each
 * child's own `inset-inline-*` resolves against ITS OWN direction, not the card's.)
 */
function detectTextDir(text: string): 'rtl' | 'ltr' {
	for (const ch of text) {
		const c = ch.codePointAt(0);
		if (c === undefined) continue;
		// RTL scripts: Hebrew, Arabic, Syriac, Thaana, NKo + Arabic presentation forms.
		if (
			(c >= 0x0590 && c <= 0x08ff) ||
			(c >= 0xfb1d && c <= 0xfdff) ||
			(c >= 0xfe70 && c <= 0xfeff)
		) {
			return 'rtl';
		}
		// Strong LTR: Latin, Greek, Cyrillic letters (covers the common cases).
		if ((c >= 0x0041 && c <= 0x024f) || (c >= 0x0370 && c <= 0x04ff)) {
			return 'ltr';
		}
	}

	return 'ltr';
}

interface Props {
	statement: Statement;
	color: ClusterPaletteEntry;
	/** True when the current user may edit/delete/move/duplicate this card. */
	canManage: boolean;
	/** True when the admin enabled evaluation display on this board. */
	showEval: boolean;
	/**
	 * How participants rate this option — inherited from the question's
	 * statementSettings.ratingMode. 'reactions' renders the positive-only 0→1
	 * emoji scale (😐🙂😊👍❤️); anything else keeps the classic agree/disagree faces.
	 */
	ratingMode?: RatingMode;
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
	ratingMode,
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
	const menuRef = useRef<HTMLDivElement>(null);
	const facesRef = useRef<HTMLDivElement>(null);
	const faceToggleRef = useRef<HTMLButtonElement>(null);
	// The card and its text node — used to detect clamped text and to anchor the
	// focus overlay's scale-in to the card's on-screen position.
	const cardRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<HTMLSpanElement>(null);
	// True when the note text is longer than the 4-line clamp can show, so a
	// non-manager still gets a pressable affordance to read the whole note.
	const [isClamped, setIsClamped] = useState(false);
	// The source card rect captured when the overlay opens (null = overlay closed).
	const [focusRect, setFocusRect] = useState<DOMRect | null>(null);

	const noteDir = detectTextDir(statement.statement);

	// Re-measure clamping whenever the text, the admin font-size control
	// (--map-card-font), or the card size changes. scrollHeight > clientHeight
	// means the -webkit-line-clamp is hiding overflow.
	useEffect(() => {
		const el = textRef.current;
		if (!el) return;
		const measure = () => setIsClamped(el.scrollHeight > el.clientHeight + 1);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);

		return () => observer.disconnect();
	}, [statement.statement]);

	// The text is a pressable affordance when there's something the box adds:
	// more text than the card can show, or edit rights.
	const canOpen = isClamped || canManage;

	// Open the focus box, anchoring its scale-in to the card's on-screen rect.
	const openFocus = () => {
		if (cardRef.current) setFocusRect(cardRef.current.getBoundingClientRect());
	};

	// Editing lives inside the focus box. When the parent turns edit mode on
	// (menu "Edit", or a freshly added card that starts in edit mode), open the
	// box automatically — capture the rect here so it works without a prior tap.
	useEffect(() => {
		if (isEditing && cardRef.current) {
			setFocusRect((rect) => rect ?? cardRef.current!.getBoundingClientRect());
		}
	}, [isEditing]);

	// Close the card's menu / faces popup when pressing anywhere outside them.
	// Capture phase so it fires before the canvas pan handler (and before any
	// toggle's own click), regardless of pointer capture.
	useEffect(() => {
		if (!menuOpen && !facesOpen) return;
		const onPointerDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (menuOpen && menuRef.current && !menuRef.current.contains(target)) {
				setMenuOpen(false);
			}
			if (
				facesOpen &&
				!facesRef.current?.contains(target) &&
				!faceToggleRef.current?.contains(target)
			) {
				setFacesOpen(false);
			}
		};
		document.addEventListener('pointerdown', onPointerDown, true);

		return () => document.removeEventListener('pointerdown', onPointerDown, true);
	}, [menuOpen, facesOpen]);

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

	// Reactions mode (0→1 emoji scale) renders emoji instead of the SVG faces;
	// the classic agree/disagree path is untouched. The scale is the shared,
	// cross-app source of truth so the cluster map matches every other surface.
	const isReactions = ratingMode === 'reactions';
	const reactionScale = getEvaluationScale('reactions');
	const myReaction = hasVoted ? getEvaluationEntry(myEval, 'reactions') : undefined;
	const buttonReactionEmoji = myReaction?.emoji ?? reactionScale[0].emoji;

	return (
		<div
			ref={cardRef}
			className={`${styles.card} ${facesOpen ? styles.cardElevated : ''}`}
			style={{ background: color.card, color: color.text }}
			// Explicit note direction (not "auto") so the menu and the reserved text
			// padding resolve on the same side — see detectTextDir. The menu and text
			// inherit this; the footer reads naturally in the note's direction too.
			dir={noteDir}
			data-flip-id={statement.statementId}
			data-cluster-id={clusterId}
			draggable={canManage}
			onDragStart={onDragStart}
		>
			{canManage && (
				<div className={styles.cardMenu} ref={menuRef}>
					<button
						type="button"
						className={styles.cardMenuButton}
						aria-label={t('Options')}
						onClick={() => setMenuOpen((open) => !open)}
					>
						⋮
					</button>
					{menuOpen && (
						<div className={styles.cardMenuList}>
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

			{/* Press the text to open the focus box: read the full note, and — with
			    edit rights — edit it there instead of in the cramped card. The box
			    opens when there's more to show (clamped) or the user can edit. */}
			<div className={styles.cardTextWrap}>
				<span
					ref={textRef}
					className={`${styles.cardText} ${canManage ? styles.cardTextHasMenu : ''} ${
						isClamped ? styles.cardTextClamped : ''
					} ${canOpen ? styles.cardTextClickable : ''}`}
					role={canOpen ? 'button' : undefined}
					tabIndex={canOpen ? 0 : undefined}
					aria-haspopup={canOpen ? 'dialog' : undefined}
					onClick={
						canOpen
							? (e) => {
									e.stopPropagation();
									openFocus();
								}
							: undefined
					}
					onKeyDown={
						canOpen
							? (e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										openFocus();
									}
								}
							: undefined
					}
				>
					{statement.statement}
				</span>
			</div>

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
					ref={faceToggleRef}
					type="button"
					className={`${styles.evalToggle} ${hasVoted ? styles.evalToggleVoted : ''}`}
					style={isReactions ? undefined : { backgroundColor: buttonThumb?.colorSelected }}
					aria-label={t('Evaluate')}
					aria-expanded={facesOpen}
					title={t('Evaluate')}
					onClick={() => setFacesOpen((open) => !open)}
				>
					{isReactions ? (
						<span className={styles.reactionEmoji} aria-hidden>
							{buttonReactionEmoji}
						</span>
					) : (
						buttonThumb && <img src={buttonThumb.svg} alt={t('Evaluate')} />
					)}
				</button>
			</div>

			{facesOpen && (
				<div className={styles.facesPopup} ref={facesRef}>
					{isReactions
						? reactionScale.map((entry) => {
								const active = myReaction?.value === entry.value;

								return (
									<button
										key={entry.value}
										type="button"
										className={`${styles.face} ${styles.reactionFace} ${
											active ? styles.faceActive : ''
										}`}
										aria-label={t(entry.labelKey)}
										aria-pressed={active}
										onClick={() => evaluate(entry.value)}
									>
										<span className={styles.reactionEmoji} aria-hidden>
											{entry.emoji}
										</span>
									</button>
								);
							})
						: enhancedEvaluationsThumbs.map((thumb) => {
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

			{focusRect && (
				<NoteFocusOverlay
					text={statement.statement}
					dir={noteDir}
					color={color}
					sourceRect={focusRect}
					canEdit={canManage}
					editing={isEditing}
					onRequestEdit={onRequestEdit}
					onSave={(value) => onSaveText(value)}
					onClose={() => {
						if (isEditing) onCancelEdit();
						setFocusRect(null);
					}}
				/>
			)}
		</div>
	);
};

export default ClusterCard;
