import { getImageSources } from '../models/statement/imageSources';

const MAIN = 'https://example.com/main.jpg';
const THUMB = 'https://example.com/thumb.webp';

describe('getImageSources', () => {
	it('returns undefined without a main image', () => {
		expect(getImageSources(undefined)).toBeUndefined();
		expect(getImageSources({})).toBeUndefined();
	});

	it('returns only the main image when there is no thumb', () => {
		expect(getImageSources({ main: MAIN })).toEqual({ src: MAIN });
	});

	it('adds a srcset when the thumb was made from the current main', () => {
		expect(
			getImageSources({
				main: MAIN,
				thumb: THUMB,
				thumbOf: MAIN,
				thumbWidth: 640,
				mainWidth: 1600,
			}),
		).toEqual({ src: MAIN, srcSet: `${THUMB} 640w, ${MAIN} 1600w` });
	});

	it('ignores a thumb left over from a replaced image', () => {
		expect(
			getImageSources({
				main: MAIN,
				thumb: THUMB,
				thumbOf: 'https://example.com/old.jpg',
				thumbWidth: 640,
				mainWidth: 1600,
			}),
		).toEqual({ src: MAIN });
	});

	it('ignores a thumb that is not smaller than the main image', () => {
		expect(
			getImageSources({ main: MAIN, thumb: THUMB, thumbOf: MAIN, thumbWidth: 640, mainWidth: 640 }),
		).toEqual({ src: MAIN });
	});
});
