import { setImageLocally } from '../uploadImageCont';
import { compressImage } from '../compressImage';
import { uploadImageToStorage } from '@/controllers/db/images/setImages';
import { updateStatementMainImage } from '@/controllers/db/statements/setStatements';
import { logError } from '@/utils/errorHandling';
import { Statement } from '@freedi/shared-types';

jest.mock('../compressImage');
jest.mock('@/controllers/db/images/setImages');
jest.mock('@/controllers/db/statements/setStatements');
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const statement = { statementId: 's1' } as Statement;
const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });

describe('setImageLocally', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		URL.createObjectURL = jest.fn().mockReturnValue('blob:preview');
		URL.revokeObjectURL = jest.fn();
	});

	it('logs, resets progress and calls onError when compression fails', async () => {
		(compressImage as jest.Mock).mockRejectedValue(new Error('boom'));
		const setProgress = jest.fn();
		const setImage = jest.fn();
		const onError = jest.fn();

		await setImageLocally(file, statement, setImage, setProgress, onError);

		expect(logError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ operation: 'uploadImage.uploadImageCont.setImageLocally' }),
		);
		expect(setProgress).toHaveBeenLastCalledWith(0);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(uploadImageToStorage).not.toHaveBeenCalled();
	});

	it('uploads the compressed file and finishes at 100', async () => {
		(compressImage as jest.Mock).mockResolvedValue(file);
		(uploadImageToStorage as jest.Mock).mockResolvedValue('https://img/url');
		(updateStatementMainImage as jest.Mock).mockResolvedValue(undefined);
		const setProgress = jest.fn();
		const setImage = jest.fn();
		const onError = jest.fn();

		await setImageLocally(file, statement, setImage, setProgress, onError);

		expect(setImage).toHaveBeenLastCalledWith('https://img/url');
		expect(setProgress).toHaveBeenLastCalledWith(100);
		expect(onError).not.toHaveBeenCalled();
	});

	it('reports upload failures too', async () => {
		(compressImage as jest.Mock).mockResolvedValue(file);
		(uploadImageToStorage as jest.Mock).mockRejectedValue(new Error('storage/unauthorized'));
		const onError = jest.fn();
		const setProgress = jest.fn();

		await setImageLocally(file, statement, jest.fn(), setProgress, onError);

		expect(onError).toHaveBeenCalledTimes(1);
		expect(setProgress).toHaveBeenLastCalledWith(0);
	});

	it('restores the previous image when the upload fails after the preview', async () => {
		(compressImage as jest.Mock).mockResolvedValue(file);
		(uploadImageToStorage as jest.Mock).mockRejectedValue(new Error('fail'));
		const setImage = jest.fn();

		await setImageLocally(file, statement, setImage, jest.fn(), jest.fn(), 'https://old/img');

		expect(setImage).toHaveBeenNthCalledWith(1, 'blob:preview');
		expect(setImage).toHaveBeenLastCalledWith('https://old/img');
	});

	it('restores an empty image when there was none and the DB write fails', async () => {
		(compressImage as jest.Mock).mockResolvedValue(file);
		(uploadImageToStorage as jest.Mock).mockResolvedValue('https://img/url');
		(updateStatementMainImage as jest.Mock).mockRejectedValue(new Error('db'));
		const setImage = jest.fn();

		await setImageLocally(file, statement, setImage, jest.fn(), jest.fn());

		expect(setImage).toHaveBeenLastCalledWith('');
	});
});
