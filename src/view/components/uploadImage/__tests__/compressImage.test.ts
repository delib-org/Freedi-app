import { compressImage } from '../compressImage';
import { IMAGE_UPLOAD } from '@/constants/common';

jest.mock('@/utils/errorHandling', () => {
	class ValidationError extends Error {
		constructor(message: string) {
			super(message);
			this.name = 'ValidationError';
		}
	}

	return { ValidationError, logError: jest.fn() };
});

const KB = IMAGE_UPLOAD.BYTES_PER_KB;

interface CanvasSetup {
	drawImage: jest.Mock;
	toBlob: jest.Mock;
}

function mockCanvas(sizesBytes: number[], type = 'image/jpeg'): CanvasSetup {
	const drawImage = jest.fn();
	let call = 0;
	const toBlob = jest.fn((cb: BlobCallback) => {
		const size = sizesBytes[Math.min(call, sizesBytes.length - 1)];
		call++;
		cb(new Blob([new Uint8Array(size)], { type }));
	});

	jest
		.spyOn(HTMLCanvasElement.prototype, 'getContext')
		.mockReturnValue({ drawImage, clearRect: jest.fn() } as unknown as CanvasRenderingContext2D);
	HTMLCanvasElement.prototype.toBlob = toBlob as unknown as HTMLCanvasElement['toBlob'];

	return { drawImage, toBlob };
}

function mockDecode(width: number, height: number): jest.Mock {
	const close = jest.fn();
	(globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = jest
		.fn()
		.mockResolvedValue({ width, height, close });

	return close;
}

const makeFile = (type = 'image/jpeg'): File => new File(['x'], 'photo.jpg', { type });

describe('compressImage', () => {
	beforeEach(() => {
		jest.restoreAllMocks();
	});

	it('draws a 12MP photo at 1600px on the long side and releases the bitmap', async () => {
		const close = mockDecode(4000, 3000);
		const { drawImage } = mockCanvas([100 * KB]);
		const setProgress = jest.fn();

		const result = await compressImage(makeFile(), 200, setProgress);

		expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
		expect(result.size).toBe(100 * KB);
		expect(close).toHaveBeenCalledTimes(1);
		expect(setProgress).toHaveBeenLastCalledWith(100);
	});

	it('does not upscale a small photo', async () => {
		mockDecode(800, 600);
		const { drawImage } = mockCanvas([50 * KB]);

		await compressImage(makeFile(), 200, jest.fn());

		expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 600);
	});

	it('uploads the best result when the target is unreachable but under the storage limit', async () => {
		mockDecode(4000, 3000);
		mockCanvas([900 * KB, 800 * KB, 700 * KB, 750 * KB]);

		const result = await compressImage(makeFile(), 200, jest.fn());

		expect(result.size).toBe(700 * KB);
	});

	it('rejects when the best result is still at the storage limit', async () => {
		const close = mockDecode(4000, 3000);
		mockCanvas([IMAGE_UPLOAD.STORAGE_LIMIT_BYTES]);

		await expect(compressImage(makeFile(), 200, jest.fn())).rejects.toThrow(/too large/);
		expect(close).toHaveBeenCalledTimes(1);
	});

	it('rejects when the browser cannot decode the file', async () => {
		(globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = jest
			.fn()
			.mockRejectedValue(new Error('unsupported'));
		URL.createObjectURL = jest.fn().mockReturnValue('blob:x');
		URL.revokeObjectURL = jest.fn();
		jest.spyOn(window, 'Image').mockImplementation(() => {
			const img = {} as HTMLImageElement;
			Object.defineProperty(img, 'src', {
				set: () => {
					setTimeout(() => img.onerror?.(new Event('error')), 0);
				},
			});

			return img;
		});

		await expect(compressImage(makeFile('image/heic'), 200, jest.fn())).rejects.toThrow(
			/could not be decoded/,
		);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
	});

	it('falls back to the <img> path when createImageBitmap throws', async () => {
		(globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = jest
			.fn()
			.mockRejectedValue(new Error('unsupported'));
		URL.createObjectURL = jest.fn().mockReturnValue('blob:y');
		URL.revokeObjectURL = jest.fn();
		jest.spyOn(window, 'Image').mockImplementation(() => {
			const img = { naturalWidth: 3000, naturalHeight: 2000 } as HTMLImageElement;
			Object.defineProperty(img, 'src', {
				set: () => {
					setTimeout(() => img.onload?.(new Event('load')), 0);
				},
			});

			return img;
		});
		const { drawImage } = mockCanvas([80 * KB]);

		const result = await compressImage(makeFile(), 200, jest.fn());

		expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1067);
		expect(result.size).toBe(80 * KB);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:y');
	});

	it('rejects when the canvas cannot encode', async () => {
		mockDecode(100, 100);
		jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
			drawImage: jest.fn(),
			clearRect: jest.fn(),
		} as unknown as CanvasRenderingContext2D);
		HTMLCanvasElement.prototype.toBlob = ((cb: BlobCallback) =>
			cb(null)) as unknown as HTMLCanvasElement['toBlob'];

		await expect(compressImage(makeFile(), 200, jest.fn())).rejects.toThrow(/could not be encoded/);
	});

	it('takes the output type from what the canvas produced', async () => {
		mockDecode(100, 100);
		mockCanvas([10 * KB], 'image/png');

		const result = await compressImage(makeFile('image/heic'), 200, jest.fn());

		expect(result.type).toBe('image/png');
	});
});
