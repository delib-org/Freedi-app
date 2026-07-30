import React, { useCallback, useState } from 'react';
import clsx from 'clsx';
import { SlidersHorizontal, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import type { ViewLayers } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import useClickOutside from '@/controllers/hooks/useClickOutside';
import ViewLayersToggle from '../ViewLayersToggle/ViewLayersToggle';
import { TreeFilterMode } from '@/view/pages/statement/components/treeView/TreeFilterMode';

export interface ListToolbarProps {
	/** Current list filter, and the setter for it. */
	filterMode: TreeFilterMode;
	onFilterChange: (mode: TreeFilterMode) => void;
	/** Collapse/expand every group in the list. */
	onToggleCollapse: () => void;
	isCollapsed: boolean;
	/** View layers. The chips only render when a non-raw layer has data. */
	layers: ViewLayers;
	availableLayers: ViewLayers;
	onLayersChange: (next: ViewLayers) => void;
	isAdmin?: boolean;
	onSetLayersDefault?: () => void;
	hasLayersOverride?: boolean;
	onResetLayers?: () => void;
	className?: string;
}

const FILTER_LABELS: Record<TreeFilterMode, string> = {
	[TreeFilterMode.all]: 'All',
	[TreeFilterMode.bookmarked]: 'Bookmarked',
	[TreeFilterMode.mine]: 'My Statements',
	[TreeFilterMode.grouped]: 'Grouped',
};

const FILTER_ORDER: TreeFilterMode[] = [
	TreeFilterMode.all,
	TreeFilterMode.bookmarked,
	TreeFilterMode.mine,
	TreeFilterMode.grouped,
];

/**
 * ListToolbar — the single band of list controls above the suggestion list.
 *
 * Replaces three stacked bands: a permanent four-chip filter row, a full-width
 * card whose only content was the words "VIEW LAYERS" plus three chips, and a
 * participation stats line. Those cost ~150px of vertical space above the fold
 * on every visit, to serve controls a participant touches rarely if ever.
 *
 * What stays visible is what changes what you are looking at right now: the
 * current filter (as a button, with a dot when it is not the default) and the
 * layer chips — and those only when a layer other than raw actually has data,
 * which is the minority of questions. Everything else lives in the sheet.
 */
const ListToolbar: React.FC<ListToolbarProps> = ({
	filterMode,
	onFilterChange,
	onToggleCollapse,
	isCollapsed,
	layers,
	availableLayers,
	onLayersChange,
	isAdmin = false,
	onSetLayersDefault,
	hasLayersOverride = false,
	onResetLayers,
	className,
}) => {
	const { t } = useTranslation();
	const [isSheetOpen, setIsSheetOpen] = useState(false);

	const closeSheet = useCallback(() => setIsSheetOpen(false), []);
	const sheetRef = useClickOutside(closeSheet);

	// Layer chips earn their space only when there is more than one layer to
	// choose between. Most questions have no AI proposals and no clusters.
	const showLayers = availableLayers.synth || availableLayers.cluster;
	const isDefaultFilter = filterMode === TreeFilterMode.all;

	const handleFilterChange = (mode: TreeFilterMode) => {
		onFilterChange(mode);
		closeSheet();
	};

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === 'Escape' && isSheetOpen) {
			closeSheet();
		}
	};

	return (
		<div className={clsx('list-toolbar', className)} onKeyDown={handleKeyDown}>
			<div className="list-toolbar__row">
				<div className="list-toolbar__sheet-anchor" ref={sheetRef}>
					<button
						type="button"
						className={clsx(
							'list-toolbar__trigger',
							!isDefaultFilter && 'list-toolbar__trigger--active',
						)}
						onClick={() => setIsSheetOpen((open) => !open)}
						aria-expanded={isSheetOpen}
						aria-haspopup="true"
					>
						<SlidersHorizontal size={16} aria-hidden />
						<span>{t(FILTER_LABELS[filterMode])}</span>
						{!isDefaultFilter && <span className="list-toolbar__dot" aria-hidden />}
					</button>

					{isSheetOpen && (
						<div className="list-toolbar__sheet" role="group" aria-label={t('Filter')}>
							<div className="list-toolbar__section">
								<p className="list-toolbar__section-label">{t('Filter')}</p>
								<div className="list-toolbar__chips">
									{FILTER_ORDER.map((mode) => (
										<button
											key={mode}
											type="button"
											className={clsx(
												'list-toolbar__chip',
												filterMode === mode && 'list-toolbar__chip--active',
											)}
											aria-pressed={filterMode === mode}
											onClick={() => handleFilterChange(mode)}
										>
											{t(FILTER_LABELS[mode])}
										</button>
									))}
								</div>
							</div>
						</div>
					)}
				</div>

				{showLayers && (
					<ViewLayersToggle
						layers={layers}
						available={availableLayers}
						onChange={onLayersChange}
						isAdmin={isAdmin}
						onSetDefault={onSetLayersDefault}
						hasUserOverride={hasLayersOverride}
						onReset={onResetLayers}
						className="list-toolbar__layers"
					/>
				)}

				<div className="list-toolbar__spacer" />

				<button
					type="button"
					className="list-toolbar__icon-btn"
					onClick={onToggleCollapse}
					aria-label={isCollapsed ? t('Expand all') : t('Collapse all')}
					title={isCollapsed ? t('Expand all') : t('Collapse all')}
				>
					{isCollapsed ? (
						<ChevronsUpDown size={18} aria-hidden />
					) : (
						<ChevronsDownUp size={18} aria-hidden />
					)}
				</button>
			</div>
		</div>
	);
};

export default ListToolbar;
