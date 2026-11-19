// valibot is mocked in this package's jest setup, so only the plain logic is tested here.
import {
	CLASS_SIDE_PRIVATE_FIELDS,
	classSideId,
	mergeClassSide,
} from '../index';

describe('classSideId', () => {
	it('is the subscription id: {uid}--{mainId}', () => {
		expect(classSideId('main-1', 'u1')).toBe('u1--main-1');
	});
});

describe('mergeClassSide', () => {
	it('prefers the private doc field by field and fills gaps from the legacy subscription', () => {
		expect(mergeClassSide({ decisionSupport: 1 }, { side: 80, camp: 'b', decisionSupport: -1 })).toEqual({
			side: 80,
			camp: 'b',
			decisionSupport: 1,
		});
		expect(mergeClassSide({ side: 10, camp: 'a' }, { side: 80, camp: 'b' })).toEqual({
			side: 10,
			camp: 'a',
			decisionSupport: undefined,
		});
	});

	it('is empty when neither holds anything', () => {
		expect(mergeClassSide(undefined, undefined)).toEqual({
			side: undefined,
			camp: undefined,
			decisionSupport: undefined,
		});
	});
});

describe('CLASS_SIDE_PRIVATE_FIELDS', () => {
	it('names exactly the three private fields', () => {
		expect([...CLASS_SIDE_PRIVATE_FIELDS]).toEqual(['side', 'camp', 'decisionSupport']);
	});
});
