import React from 'react';
import { MessageCircle } from 'lucide-react';
import { Translate } from './ThinkingSpace';
import styles from './ConversationWelcome.module.scss';

export default function ConversationWelcome({
	t,
	compact = false,
}: {
	t: Translate;
	compact?: boolean;
}) {
	return (
		<div className={`${styles.welcome} ${compact ? styles['welcome--compact'] : ''}`}>
			<div>
				<span className={styles.welcome__eyebrow}>
					<MessageCircle size={13} />
					{t('A LITTLE CONVERSATION. A NEW POSSIBILITY.')}
				</span>
				<h2>
					{t('Better starts with')} <em>{t('together.')}</em>
				</h2>
				<p>{t('Share a thought. Explore a different view. Find a way forward.')}</p>
			</div>
			<div className={styles.welcome__art} aria-hidden="true">
				<svg className={styles.welcome__botanical} viewBox="0 0 240 170" fill="none">
					<g className={styles.welcome__buddyLeft}>
						<path
							d="M19 48 Q13 23 40 20 L106 15 Q132 16 133 43 L137 91 Q137 116 112 117 L62 120 L38 139 L40 119 Q17 119 18 94 Z"
							fill="var(--space-yellow)"
						/>
						<path
							d="M52 60 L53 68 M89 57 L90 65 M62 79 Q76 94 91 77"
							stroke="currentColor"
							strokeWidth="3"
							strokeLinecap="round"
						/>
						<ellipse cx="46" cy="77" rx="7" ry="4" fill="var(--space-pink)" />
						<ellipse cx="103" cy="73" rx="7" ry="4" fill="var(--space-pink)" />
					</g>
					<g className={styles.welcome__buddyRight}>
						<path
							d="M115 80 Q113 58 137 58 L203 63 Q225 65 223 86 L218 128 Q216 149 194 146 L179 145 L192 160 L161 144 L132 143 Q111 140 112 121 Z"
							fill="var(--space-mint)"
						/>
						<path
							d="M139 95 Q145 86 151 96 M183 98 Q189 89 195 99 M155 110 Q168 126 183 113"
							stroke="currentColor"
							strokeWidth="3"
							strokeLinecap="round"
						/>
					</g>
					<path
						d="M178 10 L182 23 L196 25 L183 31 L179 44 L174 31 L162 27 L175 23 Z"
						fill="var(--space-pink)"
					/>
					<path
						d="M18 149 L27 155 M208 38 L217 31 M225 48 L235 48 M82 144 L79 153"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
					/>
				</svg>
			</div>
		</div>
	);
}
