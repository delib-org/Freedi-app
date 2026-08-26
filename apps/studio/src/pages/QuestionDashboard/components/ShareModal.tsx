import { useMemo, type FC } from 'react';
import { ActivityType, getActivityDef } from '@freedi/shared-types';
import type { ActivityRunState, DerivedActivity } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { ShareHub } from '@/components/atomic/molecules/ShareHub';
import { activityUrlResolver, MAIN_APP_URL } from '@/config';
import ModalFrame from './ModalFrame';

/**
 * ShareModal — ShareHub with the top question itself (main-app link, and the
 * Join hub when there is a live session) ahead of the activities.
 *
 * ShareHub has no "shared" callback, so a click anywhere inside its QR panel
 * (Copy / Share / Enlarge) is what counts as sharing.
 */
export interface ShareModalProps {
	isOpen: boolean;
	qId: string;
	questionTitle: string;
	activities: DerivedActivity[];
	rollupState: ActivityRunState;
	hasJoin: boolean;
	onClose: () => void;
	onShared: () => void;
}

/** ShareHub only needs a title, an icon, a state and a participant link. */
function pseudoActivity(
	statementId: string,
	title: string,
	type: ActivityType,
	href: string,
	external: boolean,
	runState: ActivityRunState,
	order: number,
): DerivedActivity {
	return {
		statementId,
		title,
		order,
		type,
		def: getActivityDef(type),
		runState,
		participant: { href, external },
		admin: null,
	};
}

const ShareModal: FC<ShareModalProps> = ({
	isOpen,
	qId,
	questionTitle,
	activities,
	rollupState,
	hasJoin,
	onClose,
	onShared,
}) => {
	const { t } = useTranslation();

	const targets = useMemo(() => {
		const list: DerivedActivity[] = [
			pseudoActivity(
				qId,
				questionTitle || t('Untitled'),
				ActivityType.question,
				`${MAIN_APP_URL}/statement/${qId}`,
				false,
				rollupState,
				-2,
			),
		];
		const hub = hasJoin ? activityUrlResolver.getJoinHubLink(qId) : null;
		if (hub) {
			list.push(
				pseudoActivity(
					`${qId}:hub`,
					t('Live session hub'),
					ActivityType.join,
					hub.href,
					hub.external,
					rollupState,
					-1,
				),
			);
		}

		return [...list, ...activities];
	}, [qId, questionTitle, rollupState, hasJoin, activities, t]);

	return (
		<ModalFrame isOpen={isOpen} onClose={onClose} title={t('Share')} size="large">
			<div
				onClickCapture={(event) => {
					if ((event.target as HTMLElement).closest('.qr-panel')) onShared();
				}}
			>
				<ShareHub activities={targets} initialSelectedId={qId} embedded title="" />
			</div>
		</ModalFrame>
	);
};

export default ShareModal;
