import { useTranslation } from '@freedi/shared-i18n/react';
import StudioPage from '../_shared/StudioPage';
import PersonalEvents from './PersonalEvents';

/**
 * `/personal` — the facilitator's own events, the ones that belong to no
 * organization.
 *
 * Its own workspace rather than a section under the organization picker: an
 * event here opens a different console and answers to nobody but its
 * facilitator, so listing it beneath a grid of organizations implied a
 * containment that does not exist.
 */
export default function Personal() {
	const { t } = useTranslation();

	return (
		<StudioPage breadcrumb={[{ label: t('Events') }]} title={t('Events')}>
			<PersonalEvents />
		</StudioPage>
	);
}
