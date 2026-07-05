import { focusEditField } from '../focusEditField';

interface FakeField {
	focus: jest.Mock;
	select: jest.Mock;
}

function makeField(): FakeField {
	return { focus: jest.fn(), select: jest.fn() };
}

function mockPointer(coarse: boolean | 'no-matchmedia'): void {
	// window.matchMedia is defined as writable in setupTests, so assign directly.
	if (coarse === 'no-matchmedia') {
		// Simulate an environment without matchMedia (older/embedded webviews).
		window.matchMedia = undefined as unknown as typeof window.matchMedia;

		return;
	}
	window.matchMedia = ((query: string) => ({
		matches: query.includes('coarse') ? coarse : false,
		media: query,
	})) as unknown as typeof window.matchMedia;
}

describe('focusEditField', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('does nothing when the element is null', () => {
		mockPointer(false);
		expect(() => focusEditField(null)).not.toThrow();
	});

	it('focuses and selects on pointer (fine) devices, without scrolling', () => {
		mockPointer(false);
		const field = makeField();
		focusEditField(field as unknown as HTMLTextAreaElement);
		expect(field.focus).toHaveBeenCalledWith({ preventScroll: true });
		expect(field.select).toHaveBeenCalledTimes(1);
	});

	it('does NOT focus on touch (coarse pointer) devices — avoids the viewport jump', () => {
		mockPointer(true);
		const field = makeField();
		focusEditField(field as unknown as HTMLTextAreaElement);
		expect(field.focus).not.toHaveBeenCalled();
		expect(field.select).not.toHaveBeenCalled();
	});

	it('falls back to focusing when matchMedia is unavailable', () => {
		mockPointer('no-matchmedia');
		const field = makeField();
		focusEditField(field as unknown as HTMLTextAreaElement);
		expect(field.focus).toHaveBeenCalledWith({ preventScroll: true });
	});
});
