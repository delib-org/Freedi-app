import { Statement } from '@freedi/shared-types';
import { statementImageAttrs } from '../statementImageAttrs';

const MAIN = 'https://example.com/main.jpg';
const THUMB = 'https://example.com/thumb.webp';

function statementWith(imagesURL: Statement['imagesURL']): Statement {
	return { statementId: 's1', imagesURL } as Statement;
}

const withThumb = statementWith({
	main: MAIN,
	thumb: THUMB,
	thumbOf: MAIN,
	thumbWidth: 480,
	mainWidth: 1244,
});

describe('statementImageAttrs', () => {
	it('offers the thumb for the saved main image', () => {
		expect(statementImageAttrs(withThumb, MAIN, '120px')).toEqual({
			src: MAIN,
			srcSet: `${THUMB} 480w, ${MAIN} 1244w`,
			sizes: '120px',
		});
	});

	it('shows a local preview as it is', () => {
		expect(statementImageAttrs(withThumb, 'blob:preview', '120px')).toEqual({
			src: 'blob:preview',
		});
	});

	it('needs sizes to offer a srcset', () => {
		expect(statementImageAttrs(withThumb, MAIN, undefined)).toEqual({ src: MAIN });
	});

	it('falls back to the main image without a current thumb', () => {
		expect(statementImageAttrs(statementWith({ main: MAIN }), MAIN, '120px')).toEqual({
			src: MAIN,
		});
		expect(statementImageAttrs(undefined, MAIN, '120px')).toEqual({ src: MAIN });
	});

	it('loads a same-size, lighter thumb directly', () => {
		const sameSize = statementWith({
			main: MAIN,
			thumb: THUMB,
			thumbOf: MAIN,
			thumbWidth: 476,
			mainWidth: 476,
		});
		expect(statementImageAttrs(sameSize, MAIN, '120px')).toEqual({ src: THUMB });
	});
});
