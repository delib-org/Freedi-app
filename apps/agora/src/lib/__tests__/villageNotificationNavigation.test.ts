import { describe, it, expect, vi } from 'vitest';
import {
	registerPresentationNavigator,
	unregisterPresentationNavigator,
	registerThreadNavigator,
	unregisterThreadNavigator,
	registerTeacherNavigator,
	unregisterTeacherNavigator,
	requestFocus,
} from '../helpedFocus';

describe('shared notification destinations in the village', () => {
	it('opens the village thread without also navigating the classic screen', () => {
		const classic = vi.fn(),
			village = vi.fn(() => true);
		registerThreadNavigator(classic);
		registerPresentationNavigator(village);
		const target = { kind: 'thread' as const, proposalId: 'note-in-needs', helperUid: 'classmate' };
		requestFocus(target);
		expect(village).toHaveBeenCalledWith(target);
		expect(classic).not.toHaveBeenCalled();
		unregisterPresentationNavigator(village);
		requestFocus(target);
		expect(classic).toHaveBeenCalledWith('note-in-needs', 'classmate');
		unregisterThreadNavigator(classic);
	});
	it('preserves teacher messages and ignores stale unmounts', () => {
		const old = vi.fn(() => true),
			active = vi.fn(() => false),
			teacher = vi.fn();
		registerPresentationNavigator(old);
		registerPresentationNavigator(active);
		unregisterPresentationNavigator(old);
		registerTeacherNavigator(teacher);
		requestFocus({ kind: 'teacher' });
		expect(active).toHaveBeenCalled();
		expect(teacher).toHaveBeenCalledOnce();
		unregisterPresentationNavigator(active);
		unregisterTeacherNavigator(teacher);
	});
});
