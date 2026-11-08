import { useTranslation } from '@freedi/shared-i18n/react';
import type { AgoraSessionOutcome } from '@freedi/shared-types';
import { Tag } from '@/components/atomic/atoms';

/**
 * The three endings of a scored lesson, plus "unscored" for a lesson that
 * never reached a class score. Glyphs mirror the shared-charts legend.
 */
export default function OutcomeTag({ outcome }: { outcome?: AgoraSessionOutcome | string }) {
	const { t } = useTranslation();
	switch (outcome) {
		case 'success':
			return (
				<Tag status="open" glyph="✓">
					{t('Success')}
				</Tag>
			);
		case 'honestDisagreement':
			return (
				<Tag status="frozen" glyph="≈">
					{t('Honest disagreement')}
				</Tag>
			);
		case 'collapse':
			return (
				<Tag status="closed" glyph="✕">
					{t('No agreement')}
				</Tag>
			);
		default:
			return (
				<Tag status="queued" glyph="–">
					{t('Unscored')}
				</Tag>
			);
	}
}
