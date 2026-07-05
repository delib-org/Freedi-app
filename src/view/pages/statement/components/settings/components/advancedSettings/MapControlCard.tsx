import { FC } from 'react';
import { setDoc } from 'firebase/firestore';
import {
	Statement,
	StatementSettings,
	StatementType,
	MapSettings,
	MapSynthVisibility,
} from '@freedi/shared-types';
import { Eye, Sparkles } from 'lucide-react';
import { createStatementRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import ToggleSwitch from './ToggleSwitch';
import styles from './EnhancedAdvancedSettings.module.scss';

interface MapControlCardProps {
	statement: Statement;
	settings: StatementSettings;
}

// Mirror the ClusterBoard defaults so the panel shows what the map renders.
const CARD_FONT_DEFAULT = 0.9;
const CLUSTER_FONT_DEFAULT = 1;
const FONT_MIN = 0.6;
const FONT_MAX = 2.2;
const FONT_STEP = 0.05;

const visibilityOrder: MapSynthVisibility[] = ['all', 'clusters-only', 'originals-only'];

const MapControlCard: FC<MapControlCardProps> = ({ statement, settings }) => {
	const { t } = useTranslation();

	// The cluster map is a question-level view, so these controls only apply to
	// questions (same gating as GroupingSettings).
	if (statement.statementType !== StatementType.question) {
		return null;
	}

	const map: MapSettings = settings.map ?? {};
	const cardFont = map.cardFontRem ?? CARD_FONT_DEFAULT;
	const clusterFont = map.clusterFontRem ?? CLUSTER_FONT_DEFAULT;
	const synthVisibility: MapSynthVisibility = map.synthVisibility ?? 'all';
	const showProvenance = map.showProvenance ?? true;
	const minResponseWords = settings.minResponseWords ?? 0;

	function update(patch: Partial<MapSettings>): void {
		void setDoc(
			createStatementRef(statement.statementId),
			{ statementSettings: { map: patch } },
			{ merge: true },
		).catch((error) => {
			logError(error, {
				operation: 'mapControlCard.update',
				statementId: statement.statementId,
			});
		});
	}

	function updateSettings(patch: Partial<StatementSettings>): void {
		void setDoc(
			createStatementRef(statement.statementId),
			{ statementSettings: patch },
			{ merge: true },
		).catch((error) => {
			logError(error, {
				operation: 'mapControlCard.updateSettings',
				statementId: statement.statementId,
			});
		});
	}

	const visibilityLabel = (v: MapSynthVisibility): string =>
		v === 'all'
			? t('Clusters + originals')
			: v === 'clusters-only'
				? t('Clusters only')
				: t('Originals only');

	return (
		<div className={styles.sliderSection}>
			{/* Typography */}
			<div className={styles.sliderHeader}>
				<span className={styles.sliderLabel}>{t('Map text size')}</span>
			</div>
			<p className={styles.sliderDescription}>
				{t('Set how large the cluster titles and the response cards appear on the map.')}
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
				<span style={{ flex: 1 }}>{t('Cluster title size')}</span>
				<input
					type="range"
					min={FONT_MIN}
					max={FONT_MAX}
					step={FONT_STEP}
					value={clusterFont}
					onChange={(e) => update({ clusterFontRem: Number(e.target.value) })}
					style={{ flex: 1 }}
				/>
				<span style={{ width: 48, textAlign: 'end' }}>{clusterFont.toFixed(2)}</span>
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
				<span style={{ flex: 1 }}>{t('Response card size')}</span>
				<input
					type="range"
					min={FONT_MIN}
					max={FONT_MAX}
					step={FONT_STEP}
					value={cardFont}
					onChange={(e) => update({ cardFontRem: Number(e.target.value) })}
					style={{ flex: 1 }}
				/>
				<span style={{ width: 48, textAlign: 'end' }}>{cardFont.toFixed(2)}</span>
			</label>

			{/* What the map shows */}
			<div className={styles.sliderHeader} style={{ marginTop: 16 }}>
				<Eye size={18} />
				<span className={styles.sliderLabel}>{t('What the map shows')}</span>
			</div>
			<p className={styles.sliderDescription}>
				{t(
					'Choose whether the map groups responses into clusters, or shows every response on its own.',
				)}
			</p>
			<div
				role="radiogroup"
				aria-label={t('What the map shows')}
				style={{ display: 'flex', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}
			>
				{visibilityOrder.map((v) => {
					const active = synthVisibility === v;

					return (
						<button
							key={v}
							type="button"
							role="radio"
							aria-checked={active}
							onClick={() => update({ synthVisibility: v })}
							style={{
								flex: 1,
								minWidth: 120,
								padding: '8px 12px',
								borderRadius: 8,
								border: active
									? '2px solid var(--btn-primary)'
									: '1px solid var(--border-color, #ccc)',
								background: active ? 'var(--btn-primary)' : 'transparent',
								color: active ? 'var(--btn-primary-text, #fff)' : 'inherit',
								fontWeight: active ? 600 : 400,
								cursor: 'pointer',
							}}
						>
							{visibilityLabel(v)}
						</button>
					);
				})}
			</div>

			{/* Provenance */}
			<ToggleSwitch
				isChecked={showProvenance}
				onChange={(checked) => update({ showProvenance: checked })}
				label={t('Show what each cluster was made from')}
				description={t(
					'Display a "made from N responses" line on each cluster so people see how it was formed.',
				)}
				icon={Sparkles}
			/>

			{/* Minimum words per response */}
			<div className={styles.sliderHeader} style={{ marginTop: 16 }}>
				<span className={styles.sliderLabel}>{t('Minimum words per response')}</span>
			</div>
			<p className={styles.sliderDescription}>
				{t(
					'Require each response to have at least this many words. Set to 0 to allow responses of any length.',
				)}
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
				<span style={{ flex: 1 }}>{t('Minimum words')}</span>
				<input
					type="number"
					min={0}
					max={100}
					step={1}
					value={minResponseWords}
					onChange={(e) => {
						const next = Math.max(0, Math.floor(Number(e.target.value) || 0));
						updateSettings({ minResponseWords: next });
					}}
					style={{ width: 80, textAlign: 'end' }}
				/>
			</label>
		</div>
	);
};

export default MapControlCard;
