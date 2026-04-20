import { FC, useState } from 'react';
import { useNavigate } from 'react-router';
import {
	Statement,
	StatementSettings,
	StatementType,
	CondensationConfig,
	CondensationLevel,
	CondensationSurfaceVisibility,
} from '@freedi/shared-types';
import { Layers, Play, RotateCcw, Eye, ListChecks, Search, X, Check } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { CONDENSATION, CONDENSATION_VISIBILITY_DEFAULTS } from '@/constants/common';
import { logError } from '@/utils/errorHandling';
import ToggleSwitch from './ToggleSwitch';
import styles from './EnhancedAdvancedSettings.module.scss';

interface GroupingSettingsProps {
	statement: Statement;
	settings: StatementSettings;
}

const defaultCondensation = (): CondensationConfig => ({
	enabled: false,
	level: 'balanced',
	autoApply: false,
	allowCreatorOverrides: true,
	minGroupSize: CONDENSATION.MIN_GROUP_SIZE_DEFAULT,
	visibility: { ...CONDENSATION_VISIBILITY_DEFAULTS },
	allowDrillToOriginals: true,
	minAverageForClustering: undefined,
	minEvaluatorsForClustering: undefined,
});

const levelOrder: CondensationLevel[] = ['loose', 'balanced', 'tight'];
const visibilityOrder: CondensationSurfaceVisibility[] = ['both', 'clusters-only'];

interface PreviewGroup {
	kind: 'create' | 'update';
	existingClusterId?: string;
	existingTitle?: string;
	suggestedTitle: string;
	suggestedDescription: string;
	memberIds: string[];
	memberTexts: string[];
}

interface PreviewPayload {
	preview: PreviewGroup[];
	produced: number;
	created: number;
	updated: number;
	orphanedClusters: string[];
}

const GroupingSettings: FC<GroupingSettingsProps> = ({ statement, settings }) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [runState, setRunState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
	const [previewState, setPreviewState] = useState<'idle' | 'running' | 'error'>('idle');
	const [previewPayload, setPreviewPayload] = useState<PreviewPayload | null>(null);
	const [applying, setApplying] = useState(false);

	if (statement.statementType !== StatementType.question) {
		return null;
	}

	const condensation: CondensationConfig = settings.condensation ?? defaultCondensation();

	function update(patch: Partial<CondensationConfig>) {
		const next: CondensationConfig = { ...condensation, ...patch };
		setStatementSettingToDB({
			statement,
			property: 'condensation',
			newValue: next as unknown as Record<string, unknown>,
			settingsSection: 'statementSettings',
		});
	}

	function updateVisibility(
		surface: keyof CondensationConfig['visibility'],
		value: CondensationSurfaceVisibility,
	) {
		update({ visibility: { ...condensation.visibility, [surface]: value } });
	}

	async function runNow() {
		setRunState('running');
		try {
			const { httpsCallable } = await import('firebase/functions');
			const { functions } = await import('@/controllers/db/config');
			const call = httpsCallable(functions, 'runCondensation');
			await call({ parentId: statement.statementId, mode: 'manual' });
			setRunState('done');
		} catch (error) {
			logError(error, {
				operation: 'groupingSettings.runNow',
				statementId: statement.statementId,
			});
			setRunState('error');
		}
	}

	async function previewGroups() {
		setPreviewState('running');
		setPreviewPayload(null);
		try {
			const { httpsCallable } = await import('firebase/functions');
			const { functions } = await import('@/controllers/db/config');
			const call = httpsCallable<unknown, PreviewPayload & { ok: boolean }>(
				functions,
				'runCondensation',
			);
			const res = await call({
				parentId: statement.statementId,
				mode: 'manual',
				dryRun: true,
			});
			setPreviewPayload({
				preview: res.data.preview ?? [],
				produced: res.data.produced ?? 0,
				created: res.data.created ?? 0,
				updated: res.data.updated ?? 0,
				orphanedClusters: res.data.orphanedClusters ?? [],
			});
			setPreviewState('idle');
		} catch (error) {
			logError(error, {
				operation: 'groupingSettings.previewGroups',
				statementId: statement.statementId,
			});
			setPreviewState('error');
		}
	}

	async function applyPreview() {
		setApplying(true);
		try {
			await runNow();
			setPreviewPayload(null);
		} finally {
			setApplying(false);
		}
	}

	function closePreview() {
		setPreviewPayload(null);
		setPreviewState('idle');
	}

	async function restoreLast() {
		if (!window.confirm(t('Undo the last grouping run? Cluster statements from the last run will be removed.'))) {
			return;
		}
		try {
			const { httpsCallable } = await import('firebase/functions');
			const { functions } = await import('@/controllers/db/config');
			const call = httpsCallable(functions, 'restoreCondensationSnapshot');
			await call({ parentId: statement.statementId });
		} catch (error) {
			logError(error, {
				operation: 'groupingSettings.restoreLast',
				statementId: statement.statementId,
			});
		}
	}

	return (
		<>
			<ToggleSwitch
				isChecked={condensation.enabled}
				onChange={(checked) => update({ enabled: checked })}
				label={t('Group similar suggestions')}
				description={t(
					'Creates a new grouped suggestion that represents several similar originals. Originals stay live and evaluations aggregate into the group.',
				)}
				icon={Layers}
				badge="new"
			/>

			{condensation.enabled && (
				<div className={styles.sliderSection}>
					{/* Grouping strength — 3-stop segmented control */}
					<div className={styles.sliderHeader}>
						<span className={styles.sliderLabel}>{t('Grouping strength')}</span>
					</div>
					<p className={styles.sliderDescription}>
						{t('How aggressively to group. Tighter = only near-duplicates; looser = shared theme.')}
					</p>
					<div role="radiogroup" aria-label={t('Grouping strength')} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
						{levelOrder.map((lvl) => {
							const active = condensation.level === lvl;

							return (
								<button
									key={lvl}
									type="button"
									role="radio"
									aria-checked={active}
									onClick={() => update({ level: lvl })}
									style={{
										flex: 1,
										padding: '8px 12px',
										borderRadius: 8,
										border: active ? '2px solid var(--btn-primary)' : '1px solid var(--border-color, #ccc)',
										background: active ? 'var(--btn-primary)' : 'transparent',
										color: active ? 'var(--btn-primary-text, #fff)' : 'inherit',
										fontWeight: active ? 600 : 400,
										cursor: 'pointer',
										textTransform: 'capitalize',
									}}
								>
									{t(lvl)}
								</button>
							);
						})}
					</div>

					{/* Auto-apply */}
					<ToggleSwitch
						isChecked={condensation.autoApply}
						onChange={(checked) => update({ autoApply: checked })}
						label={t('Apply groups automatically')}
						description={t(
							'If off, you review proposed groups in a preview before they become visible to voters.',
						)}
						icon={Play}
					/>

					{/* Minimum group size */}
					<label
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 12,
							padding: '8px 16px',
							fontSize: '0.875rem',
						}}
					>
						<span style={{ flex: 1 }}>{t('Minimum group size')}</span>
						<input
							type="number"
							min={2}
							max={20}
							value={condensation.minGroupSize}
							onChange={(e) => update({ minGroupSize: Number(e.target.value) })}
							style={{
								width: 60,
								padding: '4px 8px',
								borderRadius: 8,
								border: '1px solid #ccc',
							}}
						/>
					</label>

					{/* Eligibility filters — only well-evaluated options are grouped */}
					<div className={styles.sliderHeader} style={{ marginTop: 16 }}>
						<span className={styles.sliderLabel}>{t('Only cluster well-evaluated options')}</span>
					</div>
					<p className={styles.sliderDescription}>
						{t('Options that fail these thresholds stay ungrouped. Leave blank to include everything.')}
					</p>
					<label
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 12,
							padding: '8px 16px',
							fontSize: '0.875rem',
						}}
					>
						<span style={{ flex: 1 }}>{t('Minimum average score')}</span>
						<input
							type="number"
							min={-1}
							max={1}
							step={0.05}
							value={
								typeof condensation.minAverageForClustering === 'number'
									? condensation.minAverageForClustering
									: ''
							}
							placeholder={t('Any')}
							onChange={(e) => {
								const v = e.target.value;
								update({
									minAverageForClustering: v === '' ? undefined : Number(v),
								});
							}}
							style={{
								width: 80,
								padding: '4px 8px',
								borderRadius: 8,
								border: '1px solid #ccc',
							}}
						/>
					</label>
					<label
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 12,
							padding: '8px 16px',
							fontSize: '0.875rem',
						}}
					>
						<span style={{ flex: 1 }}>{t('Minimum number of evaluators')}</span>
						<input
							type="number"
							min={0}
							max={500}
							value={
								typeof condensation.minEvaluatorsForClustering === 'number'
									? condensation.minEvaluatorsForClustering
									: ''
							}
							placeholder={t('Any')}
							onChange={(e) => {
								const v = e.target.value;
								update({
									minEvaluatorsForClustering: v === '' ? undefined : Number(v),
								});
							}}
							style={{
								width: 80,
								padding: '4px 8px',
								borderRadius: 8,
								border: '1px solid #ccc',
							}}
						/>
					</label>

					{/* Per-surface visibility */}
					<div className={styles.sliderHeader} style={{ marginTop: 16 }}>
						<Eye size={18} />
						<span className={styles.sliderLabel}>{t('What voters see')}</span>
					</div>
					<p className={styles.sliderDescription}>
						{t('Choose per app whether voters see both groups and originals, or only the groups.')}
					</p>
					{(['main', 'massConsensus', 'join'] as const).map((surface) => {
						const current = condensation.visibility[surface];
						const surfaceLabel =
							surface === 'main' ? t('Main app')
								: surface === 'massConsensus' ? t('Mass Consensus')
									: t('Join');

						return (
							<div
								key={surface}
								style={{
									display: 'flex',
									alignItems: 'center',
									padding: '8px 16px',
									gap: 12,
									fontSize: '0.875rem',
								}}
							>
								<span style={{ flex: 1 }}>{surfaceLabel}</span>
								<div
									role="radiogroup"
									aria-label={`${t('Visibility in')} ${surfaceLabel}`}
									style={{ display: 'flex', gap: 4 }}
								>
									{visibilityOrder.map((v) => {
										const active = current === v;

										return (
											<button
												key={v}
												type="button"
												role="radio"
												aria-checked={active}
												onClick={() => updateVisibility(surface, v)}
												style={{
													padding: '4px 10px',
													borderRadius: 6,
													border: active ? '2px solid var(--btn-primary)' : '1px solid var(--border-color, #ccc)',
													background: active ? 'var(--btn-primary)' : 'transparent',
													color: active ? 'var(--btn-primary-text, #fff)' : 'inherit',
													fontWeight: active ? 600 : 400,
													cursor: 'pointer',
													fontSize: '0.8rem',
												}}
											>
												{v === 'both' ? t('Both') : t('Groups only')}
											</button>
										);
									})}
								</div>
							</div>
						);
					})}

					<ToggleSwitch
						isChecked={condensation.allowDrillToOriginals}
						onChange={(checked) => update({ allowDrillToOriginals: checked })}
						label={t('Allow drill-down to originals')}
						description={t(
							'When showing groups only, voters can click to view the original suggestions a group represents.',
						)}
						icon={Eye}
					/>

					{/* Run now + Undo + Review */}
					<div style={{ display: 'flex', gap: 12, padding: '12px 16px', flexWrap: 'wrap' }}>
						<button
							type="button"
							onClick={runNow}
							disabled={runState === 'running'}
							style={{
								padding: '8px 16px',
								borderRadius: 8,
								border: '1px solid var(--btn-primary)',
								background: runState === 'running' ? 'var(--card-default, #eee)' : 'var(--btn-primary)',
								color: 'var(--btn-primary-text, #fff)',
								cursor: runState === 'running' ? 'wait' : 'pointer',
								fontWeight: 600,
							}}
						>
							{runState === 'running' ? t('Grouping…') : t('Group now')}
						</button>
						<button
							type="button"
							onClick={previewGroups}
							disabled={previewState === 'running'}
							style={{
								padding: '8px 16px',
								borderRadius: 8,
								border: '1px solid var(--btn-primary)',
								background: 'transparent',
								color: 'var(--btn-primary)',
								cursor: previewState === 'running' ? 'wait' : 'pointer',
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								fontWeight: 600,
							}}
						>
							<Search size={16} />
							{previewState === 'running' ? t('Previewing…') : t('Preview groups')}
						</button>
						<button
							type="button"
							onClick={() => navigate(`/statement/${statement.statementId}/groups`)}
							style={{
								padding: '8px 16px',
								borderRadius: 8,
								border: '1px solid var(--border-color, #ccc)',
								background: 'transparent',
								color: 'inherit',
								cursor: 'pointer',
								display: 'flex',
								alignItems: 'center',
								gap: 6,
							}}
						>
							<ListChecks size={16} />
							{t('Review groups')}
						</button>
						<button
							type="button"
							onClick={restoreLast}
							style={{
								padding: '8px 16px',
								borderRadius: 8,
								border: '1px solid var(--border-color, #ccc)',
								background: 'transparent',
								color: 'inherit',
								cursor: 'pointer',
								display: 'flex',
								alignItems: 'center',
								gap: 6,
							}}
						>
							<RotateCcw size={16} />
							{t('Undo last run')}
						</button>
					</div>
					{runState === 'done' && (
						<p
							style={{
								padding: '0 16px 8px',
								fontSize: '0.8rem',
								color: 'var(--success, #2d8659)',
							}}
						>
							{t('Grouping started. Results will appear shortly.')}
						</p>
					)}
					{runState === 'error' && (
						<p
							style={{
								padding: '0 16px 8px',
								fontSize: '0.8rem',
								color: 'var(--error, #d04848)',
							}}
						>
							{t('Grouping failed. Please try again.')}
						</p>
					)}

					{/* Status line */}
					{statement.condensationStatus?.lastRunAt && (
						<p
							style={{
								padding: '0 16px 12px',
								fontSize: '0.75rem',
								color: 'var(--text-secondary, #777)',
							}}
						>
							{t('Last run')}: {new Date(statement.condensationStatus.lastRunAt).toLocaleString()}
							{' · '}
							{statement.condensationStatus.producedGroupCount ?? 0} {t('groups from')}{' '}
							{statement.condensationStatus.inputCount ?? 0} {t('suggestions')}
						</p>
					)}

					{previewState === 'error' && (
						<p
							style={{
								padding: '0 16px 8px',
								fontSize: '0.8rem',
								color: 'var(--error, #d04848)',
							}}
						>
							{t('Preview failed. Please try again.')}
						</p>
					)}
				</div>
			)}

			{/* Preview modal — dry-run results, Apply actually runs the pipeline */}
			{previewPayload && (
				<PreviewModal
					payload={previewPayload}
					applying={applying}
					onApply={applyPreview}
					onClose={closePreview}
				/>
			)}
		</>
	);
};

interface PreviewModalProps {
	payload: PreviewPayload;
	applying: boolean;
	onApply: () => void;
	onClose: () => void;
}

const PreviewModal: FC<PreviewModalProps> = ({ payload, applying, onApply, onClose }) => {
	const { t } = useTranslation();
	const { preview, created, updated, orphanedClusters } = payload;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={t('Preview proposed groups')}
			onClick={onClose}
			style={{
				position: 'fixed',
				inset: 0,
				background: 'rgba(15, 22, 41, 0.45)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding: 16,
				zIndex: 1000,
			}}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					background: 'var(--card-default, #fff)',
					borderRadius: 12,
					maxWidth: 680,
					width: '100%',
					maxHeight: '85vh',
					display: 'flex',
					flexDirection: 'column',
					boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
				}}
			>
				<div
					style={{
						padding: '16px 20px',
						borderBottom: '1px solid var(--border-light)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
					}}
				>
					<div>
						<h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-title)' }}>
							{t('Preview: proposed groups')}
						</h3>
						<p
							style={{
								margin: '4px 0 0',
								fontSize: '0.85rem',
								color: 'var(--text-secondary, #777)',
							}}
						>
							{preview.length === 0
								? t('No groups would be created with the current settings.')
								: t('{created} new · {updated} updated · {orphans} unchanged')
										.replace('{created}', String(created))
										.replace('{updated}', String(updated))
										.replace('{orphans}', String(orphanedClusters.length))}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label={t('Close')}
						style={{
							background: 'transparent',
							border: 'none',
							cursor: 'pointer',
							padding: 6,
							color: 'var(--text-secondary, #777)',
						}}
					>
						<X size={18} />
					</button>
				</div>

				<div style={{ overflowY: 'auto', padding: 16, flex: 1 }}>
					{preview.length === 0 && (
						<p style={{ textAlign: 'center', color: 'var(--text-secondary, #777)' }}>
							{t('Try lowering the grouping level or relaxing the eligibility filters.')}
						</p>
					)}
					{preview.map((group, i) => (
						<div
							key={i}
							style={{
								padding: 12,
								marginBottom: 10,
								border: '1px solid var(--border-light)',
								borderLeft: `4px solid ${
									group.kind === 'create' ? 'var(--btn-primary)' : 'var(--agree, #2d8659)'
								}`,
								borderRadius: 6,
								background: 'var(--bg-subtle, rgba(0,0,0,0.02))',
							}}
						>
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 8,
									marginBottom: 4,
								}}
							>
								<span
									style={{
										fontSize: '0.7rem',
										fontWeight: 600,
										textTransform: 'uppercase',
										letterSpacing: '0.04em',
										color:
											group.kind === 'create'
												? 'var(--btn-primary)'
												: 'var(--agree, #2d8659)',
									}}
								>
									{group.kind === 'create' ? t('New') : t('Update')}
								</span>
								<span
									style={{
										fontSize: '0.75rem',
										color: 'var(--text-secondary, #777)',
									}}
								>
									{group.memberIds.length} {t('members')}
								</span>
							</div>
							<h4 style={{ margin: '4px 0', color: 'var(--text-title)', fontSize: '1rem' }}>
								{group.suggestedTitle}
							</h4>
							{group.kind === 'update' && group.existingTitle && (
								<p
									style={{
										margin: 0,
										fontSize: '0.75rem',
										color: 'var(--text-secondary, #777)',
										fontStyle: 'italic',
									}}
								>
									{t('Was')}: {group.existingTitle}
								</p>
							)}
							{group.suggestedDescription && (
								<p
									style={{
										margin: '4px 0',
										fontSize: '0.85rem',
										color: 'var(--text-body)',
									}}
								>
									{group.suggestedDescription}
								</p>
							)}
							<details style={{ marginTop: 6 }}>
								<summary
									style={{
										fontSize: '0.8rem',
										color: 'var(--btn-primary)',
										cursor: 'pointer',
									}}
								>
									{t('Show {count} originals').replace(
										'{count}',
										String(group.memberIds.length),
									)}
								</summary>
								<ul
									style={{
										margin: '6px 0 0',
										paddingInlineStart: 18,
										fontSize: '0.85rem',
										color: 'var(--text-body)',
									}}
								>
									{group.memberTexts.map((txt, j) => (
										<li key={j} style={{ marginBottom: 2 }}>
											{txt}
										</li>
									))}
								</ul>
							</details>
						</div>
					))}
				</div>

				<div
					style={{
						padding: '12px 20px',
						borderTop: '1px solid var(--border-light)',
						display: 'flex',
						gap: 8,
						justifyContent: 'flex-end',
					}}
				>
					<button
						type="button"
						onClick={onClose}
						disabled={applying}
						style={{
							padding: '8px 16px',
							borderRadius: 8,
							border: '1px solid var(--border-color, #ccc)',
							background: 'transparent',
							color: 'inherit',
							cursor: applying ? 'wait' : 'pointer',
						}}
					>
						{t('Cancel')}
					</button>
					<button
						type="button"
						onClick={onApply}
						disabled={applying || preview.length === 0}
						style={{
							padding: '8px 16px',
							borderRadius: 8,
							border: '1px solid var(--btn-primary)',
							background: applying || preview.length === 0 ? 'var(--card-default, #eee)' : 'var(--btn-primary)',
							color: 'var(--btn-primary-text, #fff)',
							cursor: applying ? 'wait' : preview.length === 0 ? 'not-allowed' : 'pointer',
							fontWeight: 600,
							display: 'flex',
							alignItems: 'center',
							gap: 6,
						}}
					>
						<Check size={16} />
						{applying ? t('Applying…') : t('Apply these groups')}
					</button>
				</div>
			</div>
		</div>
	);
};

export default GroupingSettings;
