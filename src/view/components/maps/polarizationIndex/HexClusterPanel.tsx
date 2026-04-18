import React from 'react';
import Modal from '@/view/components/atomic/molecules/Modal/Modal';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './HexClusterPanel.module.scss';

interface ClusterPoint {
	statementId: string;
	statement: string;
	overallMean: number;
	overallMAD: number;
	overallN: number;
}

export interface HexClusterPanelProps {
	isOpen: boolean;
	points: ClusterPoint[];
	onClose: () => void;
	onPick: (statementId: string) => void;
}

function agreementPercent(mean: number): number {
	return Math.round(((mean + 1) / 2) * 100);
}

function getAgreementColor(mean: number): string {
	const m = Math.max(-1, Math.min(1, mean));
	if (m <= 0) {
		const t = m + 1;
		const r = Math.round(220 + (255 - 220) * t);
		const g = Math.round(53 + (193 - 53) * t);
		const b = Math.round(69 + (7 - 69) * t);

		return `rgb(${r}, ${g}, ${b})`;
	}
	const r = Math.round(255 + (40 - 255) * m);
	const g = Math.round(193 + (167 - 193) * m);
	const b = Math.round(7 + (69 - 7) * m);

	return `rgb(${r}, ${g}, ${b})`;
}

const HexClusterPanel: React.FC<HexClusterPanelProps> = ({ isOpen, points, onClose, onPick }) => {
	const { t } = useTranslation();
	const sorted = [...points].sort((a, b) => b.overallMean - a.overallMean);

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={`${points.length} ${t('solutions in this cluster')}`}
			layout="bottom-sheet"
			size="medium"
		>
			<ul className={styles.clusterList}>
				{sorted.map((p) => (
					<li key={p.statementId}>
						<button
							type="button"
							className={styles.clusterRow}
							onClick={() => onPick(p.statementId)}
						>
							<span
								className={styles.clusterRow__swatch}
								style={{ backgroundColor: getAgreementColor(p.overallMean) }}
								aria-hidden="true"
							/>
							<span className={styles.clusterRow__label}>{p.statement}</span>
							<span className={styles.clusterRow__pct}>
								{agreementPercent(p.overallMean)}%
							</span>
							<span className={styles.clusterRow__n}>({p.overallN})</span>
						</button>
					</li>
				))}
			</ul>
		</Modal>
	);
};

export default HexClusterPanel;
