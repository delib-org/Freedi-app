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
import { Layers, Play, RotateCcw, Eye, ListChecks } from 'lucide-react';
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
});

const levelOrder: CondensationLevel[] = ['loose', 'balanced', 'tight'];
const visibilityOrder: CondensationSurfaceVisibility[] = ['both', 'clusters-only'];

const GroupingSettings: FC<GroupingSettingsProps> = ({ statement, settings }) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [runState, setRunState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

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
				</div>
			)}
		</>
	);
};

export default GroupingSettings;
