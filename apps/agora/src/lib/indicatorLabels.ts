import type { IndicatorLabels } from '@freedi/shared-charts';
import { getLang, t } from './i18n';

/** The app's dictionary, handed to the indicator registry — it never owns one. */
export function agoraIndicatorLabels(): IndicatorLabels {
	return {
		t: (key, params) => t(key, params),
		locale: getLang(),
	};
}
