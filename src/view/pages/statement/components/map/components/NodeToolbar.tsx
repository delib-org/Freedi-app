import React, { useLayoutEffect, useRef, useState } from 'react';
import type { StatementType } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { TYPE_LABEL_KEYS } from '../mapHelpers/statementTypeChoices';
import type { TypeChoice } from '../mapHelpers/statementTypeChoices';
import type { MapEvaluationFace } from '../mapHelpers/mapEvaluationFaces';
import styles from './NodeToolbar.module.scss';

/** Gap kept between the panel and the edge of the viewport. */
const VIEWPORT_MARGIN_PX = 8;

export interface NodeToolbarRating {
	faces: MapEvaluationFace[];
	activeValue: number | undefined;
	/** An original counted into a merged idea: faces show but cannot be pressed. */
	readOnly: boolean;
	onRate: (value: number) => void;
}

interface NodeToolbarProps {
	/** Viewport y of the node's top edge (panel sits above) and bottom edge (fallback below). */
	anchorTop: number;
	anchorBottom: number;
	/** Viewport x of the node's horizontal centre. */
	anchorLeft: number;
	onOpen: () => void;
	/** Omit to hide the control. */
	onEdit?: () => void;
	onDelete?: () => void;
	typeChoices?: TypeChoice[];
	onChangeType?: (type: StatementType) => void;
	rating?: NodeToolbarRating;
}

interface Placement {
	below: boolean;
	left: number;
}

function Icon({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

const NodeToolbar: React.FC<NodeToolbarProps> = ({
	anchorTop,
	anchorBottom,
	anchorLeft,
	onOpen,
	onEdit,
	onDelete,
	typeChoices,
	onChangeType,
	rating,
}) => {
	const { t } = useTranslation();
	const panelRef = useRef<HTMLDivElement>(null);
	const [typeMenuOpen, setTypeMenuOpen] = useState(false);
	const [placement, setPlacement] = useState<Placement>({ below: false, left: anchorLeft });

	const canChangeType = Boolean(onChangeType && typeChoices);
	const hasRating = Boolean(rating);
	const hasEdit = Boolean(onEdit);
	const hasDelete = Boolean(onDelete);

	// The panel is taller now that every action carries a name: flip it under the
	// node when there is no room above, and keep it inside the screen sideways.
	useLayoutEffect(() => {
		const panel = panelRef.current;
		if (!panel) return;

		const { offsetHeight, offsetWidth } = panel;
		const half = offsetWidth / 2;
		const minLeft = half + VIEWPORT_MARGIN_PX;
		const maxLeft = Math.max(minLeft, window.innerWidth - half - VIEWPORT_MARGIN_PX);

		setPlacement({
			below: anchorTop - offsetHeight < VIEWPORT_MARGIN_PX,
			left: Math.min(maxLeft, Math.max(minLeft, anchorLeft)),
		});
	}, [anchorTop, anchorLeft, canChangeType, hasRating, hasEdit, hasDelete]);

	const ratingLabel = rating?.readOnly ? t('Counted into the merged idea') : t('Rate this');

	return (
		<div
			ref={panelRef}
			className={`${styles.toolbar} ${placement.below ? styles['toolbar--below'] : ''}`}
			style={{ top: placement.below ? anchorBottom : anchorTop, left: placement.left }}
			onMouseDown={(e) => e.stopPropagation()}
			onPointerDown={(e) => e.stopPropagation()}
		>
			<div className={styles.toolbar__row}>
				<button
					type="button"
					className={styles.toolbar__btn}
					onClick={onOpen}
					title={t('map.node.open')}
				>
					<Icon>
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
						<polyline points="15 3 21 3 21 9" />
						<line x1="10" y1="14" x2="21" y2="3" />
					</Icon>
					<span className={styles.toolbar__label}>{t('map.node.open')}</span>
				</button>
				{onEdit && (
					<button type="button" className={styles.toolbar__btn} onClick={onEdit} title={t('Edit')}>
						<Icon>
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
						</Icon>
						<span className={styles.toolbar__label}>{t('Edit')}</span>
					</button>
				)}
				{canChangeType && (
					<button
						type="button"
						className={`${styles.toolbar__btn} ${typeMenuOpen ? styles['toolbar__btn--active'] : ''}`}
						onClick={() => setTypeMenuOpen((open) => !open)}
						aria-expanded={typeMenuOpen}
						title={t('Change type')}
					>
						<Icon>
							<rect x="3" y="13" width="8" height="8" rx="2" />
							<circle cx="17" cy="17" r="4" />
							<path d="M7 3 3 9h8L7 3z" />
						</Icon>
						<span className={styles.toolbar__label}>{t('Change type')}</span>
					</button>
				)}
				{onDelete && (
					<>
						<div className={styles.toolbar__divider} />
						<button
							type="button"
							className={`${styles.toolbar__btn} ${styles['toolbar__btn--delete']}`}
							onClick={onDelete}
							title={t('Delete')}
						>
							<Icon>
								<polyline points="3 6 5 6 21 6" />
								<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
								<line x1="10" y1="11" x2="10" y2="17" />
								<line x1="14" y1="11" x2="14" y2="17" />
							</Icon>
							<span className={styles.toolbar__label}>{t('Delete')}</span>
						</button>
					</>
				)}
			</div>

			{rating && (
				<div className={styles.rating} role="group" aria-labelledby="map-node-rating-heading">
					<div id="map-node-rating-heading" className={styles.rating__heading}>
						{ratingLabel}
					</div>
					<div
						className={`${styles.rating__faces} ${rating.readOnly ? styles['rating__faces--readonly'] : ''}`}
					>
						{rating.faces.map((face) => {
							const isActive = rating.activeValue === face.value;

							return (
								<button
									key={face.value}
									type="button"
									className={`${styles.rating__btn} ${isActive ? styles['rating__btn--active'] : ''}`}
									style={{ backgroundColor: isActive ? face.colorSelected : face.color }}
									onClick={() => rating.onRate(face.value)}
									disabled={rating.readOnly}
									aria-label={t(face.labelKey)}
									aria-pressed={isActive}
									title={t(face.labelKey)}
								>
									{face.svg ? (
										<img src={face.svg} alt="" aria-hidden />
									) : (
										<span className={styles.rating__emoji} aria-hidden>
											{face.emoji}
										</span>
									)}
								</button>
							);
						})}
					</div>
				</div>
			)}

			{typeMenuOpen && canChangeType && typeChoices && onChangeType && (
				<div className={styles.typeMenu} role="menu">
					{typeChoices.map((choice) => (
						<button
							key={choice.type}
							type="button"
							role="menuitem"
							className={`${styles.typeMenu__item} ${choice.isCurrent ? styles['typeMenu__item--current'] : ''}`}
							disabled={!choice.allowed}
							title={choice.reasonKey ? t(choice.reasonKey) : undefined}
							onClick={() => {
								onChangeType(choice.type);
								setTypeMenuOpen(false);
							}}
						>
							<span className={styles.typeMenu__swatch} data-type={choice.type} aria-hidden />
							{t(TYPE_LABEL_KEYS[choice.type] ?? choice.type)}
						</button>
					))}
				</div>
			)}
		</div>
	);
};

export default NodeToolbar;
