import { Statement } from '@freedi/shared-types';
import { isLiveResultsOn } from '../liveResults';

const withSetting = (showEvaluation?: boolean) =>
	({ statementSettings: { showEvaluation } }) as Statement;

describe('isLiveResultsOn', () => {
	it('is on only when a host turned it on', () => {
		expect(isLiveResultsOn(withSetting(true))).toBe(true);
		expect(isLiveResultsOn(withSetting(false))).toBe(false);
	});

	it('defaults to off when nothing is set', () => {
		expect(isLiveResultsOn(withSetting())).toBe(false);
		expect(isLiveResultsOn({} as Statement)).toBe(false);
		expect(isLiveResultsOn(undefined)).toBe(false);
		expect(isLiveResultsOn(null)).toBe(false);
	});
});
