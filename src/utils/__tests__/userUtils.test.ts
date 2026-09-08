import type { User } from 'firebase/auth';
import { convertFirebaseUserToCreator } from '../userUtils';
import { getAnonymousName } from '../temporalNameGenerator';

const asUser = (partial: Partial<User>): User =>
	({ uid: 'uid-1', displayName: null, photoURL: null, email: null, isAnonymous: false, ...partial }) as User;

describe('convertFirebaseUserToCreator', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('keeps the real name and photo of a signed-in provider account', () => {
		const creator = convertFirebaseUserToCreator(
			asUser({
				displayName: 'Tal Yaron',
				photoURL: 'https://lh3.googleusercontent.com/a/photo',
				email: 'tal.yaron@gmail.com',
			}),
		);

		expect(creator.displayName).toBe('Tal Yaron');
		expect(creator.photoURL).toBe('https://lh3.googleusercontent.com/a/photo');
		expect(creator.email).toBe('tal.yaron@gmail.com');
		expect(creator.isAnonymous).toBe(false);
	});

	it('does not let a locally typed name override a provider name', () => {
		localStorage.setItem('displayName', 'Typed Name');

		const creator = convertFirebaseUserToCreator(asUser({ displayName: 'Tal Yaron' }));

		expect(creator.displayName).toBe('Tal Yaron');
	});

	it('prefers the name an anonymous visitor typed over their generated pseudonym', () => {
		localStorage.setItem('displayName', 'Typed Name');

		const creator = convertFirebaseUserToCreator(
			asUser({ isAnonymous: true, displayName: getAnonymousName('uid-1') }),
		);

		expect(creator.displayName).toBe('Typed Name');
	});

	it('falls back to a stable uid-derived pseudonym when there is no name at all', () => {
		const creator = convertFirebaseUserToCreator(asUser({ isAnonymous: true }));

		expect(creator.displayName).toBe(getAnonymousName('uid-1'));
		expect(convertFirebaseUserToCreator(asUser({ isAnonymous: true })).displayName).toBe(
			creator.displayName,
		);
	});

	it('treats a blank provider name as no name', () => {
		const creator = convertFirebaseUserToCreator(asUser({ displayName: '   ' }));

		expect(creator.displayName).toBe(getAnonymousName('uid-1'));
	});
});
