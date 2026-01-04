/**
 * Jest setup file for shared-types package
 * Mocks valibot before any module loads
 */

// Mock all valibot functions
jest.mock('valibot', () => {
	// Helper function used by mock - defined inside factory
	const createMockSchema = () => ({
		type: 'mock',
		_parse: (value: unknown) => ({ success: true, output: value }),
	});

	return {
		// Schema creators
		string: jest.fn(() => createMockSchema()),
		number: jest.fn(() => createMockSchema()),
		boolean: jest.fn(() => createMockSchema()),
		object: jest.fn((shape?: Record<string, unknown>) => ({
			...createMockSchema(),
			shape,
		})),
		array: jest.fn((itemSchema?: unknown) => ({
			...createMockSchema(),
			itemSchema,
		})),
		optional: jest.fn((schema?: unknown) => schema ?? createMockSchema()),
		nullable: jest.fn((schema?: unknown) => schema ?? createMockSchema()),
		union: jest.fn((schemas?: unknown[]) => ({
			...createMockSchema(),
			schemas,
		})),
		literal: jest.fn((value?: unknown) => ({
			...createMockSchema(),
			value,
		})),
		enum_: jest.fn((values?: unknown) => ({
			...createMockSchema(),
			values,
		})),
		picklist: jest.fn((values?: unknown[]) => ({
			...createMockSchema(),
			values,
		})),
		record: jest.fn((keySchema?: unknown, valueSchema?: unknown) => ({
			...createMockSchema(),
			keySchema,
			valueSchema,
		})),
		tuple: jest.fn((schemas?: unknown[]) => ({
			...createMockSchema(),
			schemas,
		})),
		any: jest.fn(() => createMockSchema()),
		unknown: jest.fn(() => createMockSchema()),
		never: jest.fn(() => createMockSchema()),
		void_: jest.fn(() => createMockSchema()),
		null_: jest.fn(() => createMockSchema()),
		undefined_: jest.fn(() => createMockSchema()),

		// Schema modifiers
		pipe: jest.fn((schema: unknown) => schema),
		transform: jest.fn((schema: unknown) => schema),
		lazy: jest.fn((fn: () => unknown) => fn()),
		recursive: jest.fn((fn: () => unknown) => fn()),
		brand: jest.fn((schema: unknown) => schema),

		// Validators
		minLength: jest.fn(() => ({})),
		maxLength: jest.fn(() => ({})),
		length: jest.fn(() => ({})),
		email: jest.fn(() => ({})),
		url: jest.fn(() => ({})),
		regex: jest.fn(() => ({})),
		uuid: jest.fn(() => ({})),
		cuid2: jest.fn(() => ({})),
		ulid: jest.fn(() => ({})),
		isoDate: jest.fn(() => ({})),
		isoTime: jest.fn(() => ({})),
		isoDateTime: jest.fn(() => ({})),
		isoTimestamp: jest.fn(() => ({})),
		ipv4: jest.fn(() => ({})),
		ipv6: jest.fn(() => ({})),
		ip: jest.fn(() => ({})),
		nonEmpty: jest.fn(() => ({})),
		trim: jest.fn(() => ({})),
		toLowerCase: jest.fn(() => ({})),
		toUpperCase: jest.fn(() => ({})),
		minValue: jest.fn(() => ({})),
		maxValue: jest.fn(() => ({})),
		value: jest.fn(() => ({})),
		integer: jest.fn(() => ({})),
		finite: jest.fn(() => ({})),
		safeInteger: jest.fn(() => ({})),
		multipleOf: jest.fn(() => ({})),

		// Parse functions
		parse: jest.fn((schema: unknown, data: unknown) => data),
		safeParse: jest.fn((schema: unknown, data: unknown) => ({
			success: true,
			output: data,
		})),
		parseAsync: jest.fn(async (schema: unknown, data: unknown) => data),
		safeParseAsync: jest.fn(async (schema: unknown, data: unknown) => ({
			success: true,
			output: data,
		})),
		is: jest.fn(() => true),
		assert: jest.fn(() => undefined),

		// Type inference helpers (these are type-only in actual valibot)
		InferOutput: undefined,
		InferInput: undefined,
	};
});
