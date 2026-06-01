import React, { useMemo, useState } from 'react';
import { Info, ChevronDown, Layers } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useActiveFraming } from '@/controllers/hooks/useActiveFraming';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { useFramingMeta } from '@/controllers/hooks/useFramingMeta';
import { FramingMode } from '@/redux/framings/framingsSlice';
import { FramingChip } from '@/view/components/atomic/molecules/FramingChip';
import type { FramingChipPipeline } from '@/view/components/atomic/molecules/FramingChip';
import {
	FramingSheet,
	type FramingSheetOption,
} from '@/view/components/atomic/molecules/FramingSheet';

export interface SuggestionsToolbarProps {
	parentId: string | undefined;
	/** When any clusters are present, shows the contextual hint and enables the
	 *  per-user "show originals inside groups" override toggle. */
	hasActiveClusters: boolean;
	/** Per-user override state — show originals inline even in clusters-only mode. */
	showOriginalsOverride: boolean;
	onShowOriginalsOverrideChange: (next: boolean) => void;
	className?: string;
}

interface ChipDescriptor {
	id: string;
	label: string;
	pipeline: FramingChipPipeline;
	description: string;
	count?: number;
	disabled: boolean;
	stale?: boolean;
	loading?: boolean;
	onSelect: () => void;
	active: boolean;
	customFramingId?: string;
}

const SuggestionsToolbar: React.FC<SuggestionsToolbarProps> = ({
	parentId,
	hasActiveClusters,
	showOriginalsOverride,
	onShowOriginalsOverrideChange,
	className,
}) => {
	const { t } = useTranslation();
	const { mode, setMode, setCustomFraming, availableModes, customFramings, framingId } =
		useActiveFraming(parentId);
	const framingMeta = useFramingMeta(parentId);
	// Only admins can act on the "run it from settings first" hint, so unavailable
	// cluster modes are dead UI for participants — hide them unless admin.
	const { isAdmin } = useAuthorization(parentId);
	const [sheetOpen, setSheetOpen] = useState(false);

	const findMeta = (id: string) => framingMeta.find((m) => m.framingId === id);
	const semanticMeta = framingMeta.find((m) => m.createdBy === 'hybrid-auto');
	const topicMeta = framingMeta.find((m) => m.createdBy === 'topic-cluster');

	const chips = useMemo<ChipDescriptor[]>(() => {
		const list: ChipDescriptor[] = [
			{
				id: 'flat',
				label: t('Flat'),
				pipeline: 'flat',
				description: t('Show all suggestions as a flat list'),
				disabled: false,
				active: mode === FramingMode.regular,
				onSelect: () => setMode(FramingMode.regular),
			},
		];

		// Semantic chip — always shown so the grouping option stays discoverable;
		// disabled (with an explanatory tooltip) until a hybrid-auto framing
		// exists. Admins get an actionable hint pointing at settings.
		const semanticAvailable = availableModes.includes(FramingMode.semantic);
		list.push({
			id: 'semantic',
			label: t('Semantic'),
			pipeline: 'semantic',
			description: semanticAvailable
				? t('Auto-grouped by similarity (k-means on embeddings)')
				: isAdmin
					? t('No clustering of this type available — run it from settings first')
					: t('No similarity grouping available yet'),
			count: semanticMeta?.clusterCount,
			disabled: !semanticAvailable,
			stale: semanticMeta?.isStale ?? false,
			loading: semanticMeta?.isComputing ?? false,
			active: mode === FramingMode.semantic,
			onSelect: () => setMode(FramingMode.semantic),
		});

		const topicAvailable = availableModes.includes(FramingMode.topic);
		list.push({
			id: 'topic',
			label: t('Topic'),
			pipeline: 'topic',
			description: topicAvailable
				? t('Themes from deliberation (LLM-derived)')
				: isAdmin
					? t('No clustering of this type available — run it from settings first')
					: t('No topic grouping available yet'),
			count: topicMeta?.clusterCount,
			disabled: !topicAvailable,
			stale: topicMeta?.isStale ?? false,
			loading: topicMeta?.isComputing ?? false,
			active: mode === FramingMode.topic,
			onSelect: () => setMode(FramingMode.topic),
		});

		// Custom framings — one chip per active admin/AI custom framing.
		for (const cf of customFramings) {
			const meta = findMeta(cf.framingId);
			list.push({
				id: `custom:${cf.framingId}`,
				label: cf.name,
				pipeline: 'custom',
				description: cf.description || t('Custom framing'),
				count: meta?.clusterCount,
				disabled: false,
				stale: meta?.isStale ?? false,
				loading: meta?.isComputing ?? false,
				active: mode === FramingMode.custom && framingId === cf.framingId,
				onSelect: () => setCustomFraming(cf.framingId),
				customFramingId: cf.framingId,
			});
		}

		return list;
	}, [
		t,
		mode,
		setMode,
		setCustomFraming,
		availableModes,
		customFramings,
		semanticMeta,
		topicMeta,
		framingId,
		framingMeta,
		isAdmin,
	]);

	const activeChip = chips.find((c) => c.active);

	const sheetOptions = useMemo<FramingSheetOption[]>(
		() =>
			chips.map((c) => ({
				id: c.id,
				label: c.label,
				pipeline: c.pipeline,
				description: c.description,
				count: c.count,
				disabled: c.disabled,
				stale: c.stale,
			})),
		[chips],
	);

	const handleSheetSelect = (id: string) => {
		const chip = chips.find((c) => c.id === id);
		if (chip && !chip.disabled) chip.onSelect();
	};

	if (!parentId) return null;

	// Originals represented by a cluster are now hidden from the flat list in
	// BOTH visibility modes (see SuggestionCards `originalsHiddenByGroup`), so
	// the "show originals inside groups" escape hatch must be available whenever
	// clusters are present — not just in clusters-only mode.
	const showOverride = hasActiveClusters;

	const showHint = hasActiveClusters && mode !== FramingMode.regular;

	return (
		<div className={['suggestions-toolbar', className].filter(Boolean).join(' ')}>
			<div className="suggestions-toolbar__row" role="group" aria-label={t('View grouping')}>
				<span className="suggestions-toolbar__label">{t('Group by')}</span>
				<div className="suggestions-toolbar__chips">
					{chips.map((c) => (
						<FramingChip
							key={c.id}
							label={c.label}
							pipeline={c.pipeline}
							count={c.count}
							active={c.active}
							disabled={c.disabled}
							loading={c.loading}
							stale={c.stale}
							title={c.description}
							onClick={c.onSelect}
						/>
					))}
				</div>
				<button
					type="button"
					className="suggestions-toolbar__mobile-trigger"
					onClick={() => setSheetOpen(true)}
					aria-haspopup="dialog"
					aria-expanded={sheetOpen}
				>
					<Layers size={14} aria-hidden />
					<span>{activeChip?.label ?? t('Flat')}</span>
					{typeof activeChip?.count === 'number' && <span aria-hidden>· {activeChip.count}</span>}
					<ChevronDown size={14} aria-hidden />
				</button>
			</div>

			{(showHint || showOverride) && (
				<div className="suggestions-toolbar__row suggestions-toolbar__row--secondary">
					{showHint && (
						<span className="suggestions-toolbar__hint">
							<Info size={12} aria-hidden />
							{t('Sort applies to clusters and members within each cluster using the same metric')}
						</span>
					)}
					{showOverride && (
						<label className="suggestions-toolbar__override">
							<input
								type="checkbox"
								className="suggestions-toolbar__override-input"
								checked={showOriginalsOverride}
								onChange={(e) => onShowOriginalsOverrideChange(e.target.checked)}
							/>
							<span>{t('Show originals inside groups')}</span>
						</label>
					)}
				</div>
			)}

			<FramingSheet
				open={sheetOpen}
				options={sheetOptions}
				activeId={activeChip?.id ?? 'flat'}
				onSelect={(id) => {
					handleSheetSelect(id);
					setSheetOpen(false);
				}}
				onClose={() => setSheetOpen(false)}
				override={
					showOverride
						? {
								label: t('Also show originals inside groups'),
								checked: showOriginalsOverride,
								onToggle: onShowOriginalsOverrideChange,
							}
						: undefined
				}
			/>
		</div>
	);
};

export default SuggestionsToolbar;
