import { FC, useState } from 'react';
import { Combine } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import ActionRow from '@/view/pages/statement/components/settings/components/advancedSettings/ActionRow';
import settingsStyles from '@/view/pages/statement/components/settings/components/ClusteringAdmin/ClusteringAdmin.module.scss';
import SynthesizeIdeasModal from './SynthesizeIdeasModal';

interface SynthesizeIdeasActionProps {
	parentStatementId: string;
	disabled?: boolean;
}

/**
 * Standalone "Synthesize ideas" trigger. Wraps the ActionRow + status message
 * + modal so it can sit next to "Live synthesis" inside the AI Settings panel
 * without dragging the whole ClusteringAdmin block along.
 */
const SynthesizeIdeasAction: FC<SynthesizeIdeasActionProps> = ({
	parentStatementId,
	disabled = false,
}) => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);

	return (
		<>
			<ActionRow
				icon={Combine}
				label={t('Synthesize ideas')}
				description={t(
					'Find proposals that say the same thing in different words and merge them. Embeddings find candidates; an AI judge confirms each pair before merging (catches "raise" vs "lower" and similar false positives).',
				)}
				buttonLabel={t('Open')}
				disabled={disabled}
				onClick={() => {
					setStatusMessage(null);
					setIsOpen(true);
				}}
				badge="new"
				variant="primary"
			/>
			{statusMessage && <div className={settingsStyles.status}>{statusMessage}</div>}
			{isOpen && (
				<SynthesizeIdeasModal
					parentStatementId={parentStatementId}
					onClose={() => setIsOpen(false)}
					onSuccess={(createdCount) => {
						setIsOpen(false);
						setStatusMessage(
							t('Synthesis created {n} merged statements').replace('{n}', String(createdCount)),
						);
					}}
				/>
			)}
		</>
	);
};

export default SynthesizeIdeasAction;
