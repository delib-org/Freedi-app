import { calculateTargetSize } from '../imageDimensions';

describe('calculateTargetSize', () => {
	it('scales a 12MP landscape photo to 1600 on the long side', () => {
		expect(calculateTargetSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
	});

	it('scales a portrait photo by its height', () => {
		expect(calculateTargetSize(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
	});

	it('never upscales a small image', () => {
		expect(calculateTargetSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
	});

	it('leaves an image exactly at the cap untouched', () => {
		expect(calculateTargetSize(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
	});

	it('keeps at least one pixel on the short side of extreme panoramas', () => {
		expect(calculateTargetSize(32000, 10, 1600)).toEqual({ width: 1600, height: 1 });
	});

	it('returns the input for a non-positive cap or zero size', () => {
		expect(calculateTargetSize(100, 100, 0)).toEqual({ width: 100, height: 100 });
		expect(calculateTargetSize(0, 0, 1600)).toEqual({ width: 0, height: 0 });
	});
});
