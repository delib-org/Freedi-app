import {
	firebaseDownloadUrl,
	mainPointsAt,
	objectNameFromUrl,
	parseThumbSource,
	thumbIsWorthIt,
	thumbPathFor,
} from '../thumbnailPaths';

const BUCKET = 'wizcol-app.firebasestorage.app';

describe('thumbnailPaths', () => {
	it('accepts main-app and MC uploads', () => {
		expect(parseThumbSource('statements/abc/imgId-0.123')).toEqual({
			statementId: 'abc',
			fileName: 'imgId-0.123',
		});
		expect(parseThumbSource('statements/abc/card-1700-x1y2.jpg')).toEqual({
			statementId: 'abc',
			fileName: 'card-1700-x1y2.jpg',
		});
	});

	it('rejects thumbnails and unrelated objects', () => {
		expect(parseThumbSource('statements/abc/thumbs/imgId-0.1.webp')).toBeNull();
		expect(parseThumbSource('users/abc/avatar.png')).toBeNull();
		expect(parseThumbSource('statements/abc/document.pdf')).toBeNull();
		expect(parseThumbSource(undefined)).toBeNull();
	});

	it('puts the thumbnail in the statement thumbs folder', () => {
		expect(thumbPathFor({ statementId: 'abc', fileName: 'imgId-0.1' })).toBe(
			'statements/abc/thumbs/imgId-0.1.webp',
		);
	});

	it('matches encoded Firebase URLs and raw GCS URLs', () => {
		const firebase = firebaseDownloadUrl(BUCKET, 'statements/abc/imgId-0.1', 't');
		expect(mainPointsAt(firebase, 'statements/abc/imgId-0.1')).toBe(true);
		expect(mainPointsAt(firebase, 'statements/abc/imgId-0.2')).toBe(false);
		expect(
			mainPointsAt(
				`https://storage.googleapis.com/${BUCKET}/statements/abc/card-1.jpg`,
				'statements/abc/card-1.jpg',
			),
		).toBe(true);
		expect(mainPointsAt(undefined, 'statements/abc/imgId-0.1')).toBe(false);
	});

	it('reads the object name back from either URL form', () => {
		expect(
			objectNameFromUrl(firebaseDownloadUrl(BUCKET, 'statements/abc/imgId-0.1', 't'), BUCKET),
		).toBe('statements/abc/imgId-0.1');
		expect(
			objectNameFromUrl(
				`https://storage.googleapis.com/${BUCKET}/statements/abc/card-1.jpg`,
				BUCKET,
			),
		).toBe('statements/abc/card-1.jpg');
		expect(objectNameFromUrl('https://example.com/x.jpg', BUCKET)).toBeNull();
	});

	it('keeps a narrower copy, or a same-size copy that is much lighter', () => {
		expect(thumbIsWorthIt({ width: 480, bytes: 37_000 }, { width: 1244, bytes: 171_000 })).toBe(
			true,
		);
		expect(thumbIsWorthIt({ width: 476, bytes: 19_000 }, { width: 476, bytes: 292_000 })).toBe(
			true,
		);
		expect(thumbIsWorthIt({ width: 476, bytes: 90_000 }, { width: 476, bytes: 100_000 })).toBe(
			false,
		);
		expect(thumbIsWorthIt({ width: 0, bytes: 1 }, { width: 0, bytes: 1 })).toBe(false);
	});
});
