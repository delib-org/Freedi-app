import { useState } from 'react';
import type { DerivedActivity } from '@freedi/event-core';
import QRCodePanel from './QRCodePanel';
import RunStatePill from './RunStatePill';
import styles from './ShareHub.module.css';

export default function ShareHub({ activities }: { activities: DerivedActivity[] }) {
	const shareable = activities.filter((a) => a.participant);
	const [selectedId, setSelectedId] = useState<string>(shareable[0]?.statementId ?? '');

	if (shareable.length === 0) {
		return (
			<aside className={styles.hub}>
				<h2 className={styles.title}>Share Hub</h2>
				<p className={styles.empty}>No shareable activities yet.</p>
			</aside>
		);
	}

	const selected = shareable.find((a) => a.statementId === selectedId) ?? shareable[0];

	return (
		<aside className={styles.hub}>
			<h2 className={styles.title}>Share Hub</h2>
			<ul className={styles.list}>
				{shareable.map((activity) => {
					const isSelected = activity.statementId === selected.statementId;

					return (
						<li key={activity.statementId}>
							<button
								type="button"
								className={`${styles.item} ${isSelected ? styles.selected : ''}`}
								onClick={() => setSelectedId(activity.statementId)}
							>
								<span aria-hidden="true">{activity.def.icon}</span>
								<span className={styles.itemTitle}>{activity.title || 'Untitled'}</span>
								<RunStatePill state={activity.runState} />
							</button>
						</li>
					);
				})}
			</ul>

			{selected.participant && (
				<div className={styles.qrWrap}>
					<QRCodePanel url={selected.participant.href} title={selected.title} />
				</div>
			)}
		</aside>
	);
}
