import React, { FC, useState } from 'react';
import { MemberReviewData } from '../MemberValidation';
import styles from './MemberReviewCard.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

interface Props {
	member: MemberReviewData;
	isSelected: boolean;
	onSelect: (userId: string, selected: boolean) => void;
	onApprove: () => void;
	onFlag: () => void;
	onBan: () => void;
}

const MemberReviewCard: FC<Props> = ({
	member,
	isSelected,
	onSelect,
	onApprove,
	onFlag,
	onBan
}) => {
	const { t } = useUserConfig();
	const [expanded, setExpanded] = useState(false);

	const getStatusBadge = () => {
		switch (member.status) {
			case 'approved':
				return <span className={`${styles.badge} ${styles.approved}`}>✓ {t('Approved')}</span>;
			case 'flagged':
				return <span className={`${styles.badge} ${styles.flagged}`}>⚠ {t('Flagged')}</span>;
			case 'banned':
				return <span className={`${styles.badge} ${styles.banned}`}>🚫 {t('Banned')}</span>;
			default:
				return <span className={`${styles.badge} ${styles.pending}`}>⏳ {t('Pending')}</span>;
		}
	};

	const detectSuspiciousPatterns = () => {
		const flags: string[] = [];

		// Check for very short answers
		const shortAnswers = member.responses.filter(r =>
			typeof r.answer === 'string' && r.answer.length < 3
		);
		if (shortAnswers.length > 0) {
			flags.push(t('Very short answers'));
		}

		// Check for all identical answers
		const answers = member.responses.map(r => r.answer);
		const uniqueAnswers = new Set(answers.map(a =>
			typeof a === 'string' ? a : JSON.stringify(a)
		));
		if (uniqueAnswers.size === 1 && member.responses.length > 1) {
			flags.push(t('Identical answers'));
		}

		// Check for missing required fields
		const emptyAnswers = member.responses.filter(r =>
			!r.answer || (typeof r.answer === 'string' && r.answer.trim() === '')
		);
		if (emptyAnswers.length > 0) {
			flags.push(t('Missing answers'));
		}

		return flags;
	};

	const suspiciousFlags = detectSuspiciousPatterns();

	return (
		<div className={`${styles.memberCard} ${member.status === 'banned' ? styles.banned : ''}`}>
			<div className={styles.header}>
				<div className={styles.selectionAndInfo}>
					<input
						type="checkbox"
						checked={isSelected}
						onChange={(e) => onSelect(member.userId, e.target.checked)}
						disabled={member.status === 'banned'}
					/>
					<div className={styles.userInfo}>
						<div className={styles.nameRow}>
							<h4>{member.user.displayName || t('Anonymous')}</h4>
							{getStatusBadge()}
						</div>
						{member.user.email && (
							<span className={styles.email}>{member.user.email}</span>
						)}
					</div>
				</div>

				{suspiciousFlags.length > 0 && (
					<div className={styles.warnings}>
						{suspiciousFlags.map((flag, idx) => (
							<span key={idx} className={styles.warningBadge}>
								⚠️ {flag}
							</span>
						))}
					</div>
				)}

				<button
					className={styles.expandBtn}
					onClick={() => setExpanded(!expanded)}
				>
					{expanded ? '▼' : '▶'}
				</button>
			</div>

			{expanded && (
				<div className={styles.content}>
					<div className={styles.responses}>
						<h5>{t('Survey Responses')}:</h5>
						{member.responses.map((response, idx) => (
							<div key={idx} className={styles.response}>
								<div className={styles.question}>{response.question}</div>
								<div className={styles.answer}>
									{Array.isArray(response.answer)
										? response.answer.join(', ')
										: response.answer || t('No answer')
									}
								</div>
							</div>
						))}
					</div>

					{member.status !== 'banned' && (
						<div className={styles.actions}>
							{member.status !== 'approved' && (
								<button
									className="btn btn--small btn--primary"
									onClick={onApprove}
								>
									✓ {t('Approve')}
								</button>
							)}
							{member.status !== 'flagged' && (
								<button
									className="btn btn--small btn--secondary"
									onClick={onFlag}
								>
									🔍 {t('Flag for Review')}
								</button>
							)}
							<button
								className="btn btn--small btn--error"
								onClick={onBan}
							>
								🚫 {t('Remove/Ban')}
							</button>
						</div>
					)}

					{member.status === 'banned' && (
						<div className={styles.bannedNotice}>
							{t('This member has been banned from this discussion')}
							<br />
							<small>{t('Note: Their votes have been removed')}</small>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default MemberReviewCard;