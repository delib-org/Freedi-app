import React from 'react';
import clsx from 'clsx';
import { Lightbulb, Sparkles, Layers, Check, RotateCcw } from 'lucide-react';
import type { ViewLayers } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';

export interface ViewLayersToggleProps {
	layers: ViewLayers;
	onChange: (next: ViewLayers) => void;
	/** Admins can save the current layers as the default everyone lands on. */
	isAdmin?: boolean;
	/** Persist the current layers as the statement default (admin only). */
	onSetDefault?: () => void;
	/** True when the user has a local override differing from the admin default. */
	hasUserOverride?: boolean;
	/** Clear the local override and return to the admin default. */
	onReset?: () => void;
	className?: string;
}

type LayerKey = keyof ViewLayers;

const ViewLayersToggle: React.FC<ViewLayersToggleProps> = ({
	layers,
	onChange,
	isAdmin = false,
	onSetDefault,
	hasUserOverride = false,
	onReset,
	className,
}) => {
	const { t } = useTranslation();

	const activeCount = Number(layers.raw) + Number(layers.synth) + Number(layers.cluster);

	const chips: Array<{ key: LayerKey; label: string; icon: React.ReactNode }> = [
		{ key: 'raw', label: t('Raw'), icon: <Lightbulb size={14} aria-hidden /> },
		{ key: 'synth', label: t('Synth'), icon: <Sparkles size={14} aria-hidden /> },
		{ key: 'cluster', label: t('Cluster'), icon: <Layers size={14} aria-hidden /> },
	];

	const toggle = (key: LayerKey) => {
		// Never allow turning off the last active layer — the list would go blank.
		if (layers[key] && activeCount === 1) return;
		onChange({ ...layers, [key]: !layers[key] });
	};

	return (
		<div className={clsx('view-layers-toggle', className)}>
			<span className="view-layers-toggle__label">{t('View layers')}</span>
			<div className="view-layers-toggle__chips" role="group" aria-label={t('View layers')}>
				{chips.map(({ key, label, icon }) => {
					const active = layers[key];
					const isLastActive = active && activeCount === 1;

					return (
						<button
							key={key}
							type="button"
							className={clsx(
								'view-layers-toggle__chip',
								active && 'view-layers-toggle__chip--active',
								`view-layers-toggle__chip--${key}`,
							)}
							aria-pressed={active}
							aria-disabled={isLastActive}
							title={isLastActive ? t('At least one layer must stay on') : undefined}
							onClick={() => toggle(key)}
						>
							{icon}
							<span>{label}</span>
						</button>
					);
				})}
			</div>

			{(isAdmin || hasUserOverride) && (
				<div className="view-layers-toggle__actions">
					{hasUserOverride && onReset && (
						<button
							type="button"
							className="view-layers-toggle__action"
							onClick={onReset}
							title={t('Reset to the default view')}
						>
							<RotateCcw size={13} aria-hidden />
							<span>{t('Reset')}</span>
						</button>
					)}
					{isAdmin && onSetDefault && (
						<button
							type="button"
							className="view-layers-toggle__action view-layers-toggle__action--primary"
							onClick={onSetDefault}
							title={t('Save this view as the default for everyone')}
						>
							<Check size={13} aria-hidden />
							<span>{t('Set as default')}</span>
						</button>
					)}
				</div>
			)}
		</div>
	);
};

export default ViewLayersToggle;
