import { FC } from 'react';
import { RoomParticipant } from '@freedi/shared-types';
import styles from '../RoomAssignment.module.scss';

interface ParticipantChipProps {
	participant: RoomParticipant;
}

const ParticipantChip: FC<ParticipantChipProps> = ({ participant }) => {
	return (
		<div className={styles.participantChip}>
			<span className={styles.participantChip__name}>{participant.userName}</span>
			{participant.demographicTags.length > 0 && (
				<div className={styles.participantChip__tags}>
					{participant.demographicTags.map((tag, index) => (
						<span
							key={`${tag.questionId}-${index}`}
							className={styles.participantChip__tag}
							style={{
								backgroundColor: tag.color || '#e0e0e0',
								color: getContrastColor(tag.color || '#e0e0e0'),
							}}
							title={tag.questionText}
						>
							{tag.answer}
						</span>
					))}
				</div>
			)}
		</div>
	);
};

/**
 * Get contrasting text color (black or white) based on background color
 */
function getContrastColor(hexColor: string): string {
	// Remove # if present
	const hex = hexColor.replace('#', '');

	// Convert to RGB
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);

	// Calculate luminance
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

	// Return black for light colors, white for dark colors
	return luminance > 0.5 ? '#000000' : '#ffffff';
}

export default ParticipantChip;
