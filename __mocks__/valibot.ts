/**
 * Manual mock for valibot
 * Placed in __mocks__ at root level for automatic mocking by Jest
 */

const createMockSchema = () => ({
	type: 'mock',
	_parse: (value: unknown) => ({ success: true, output: value }),
});

export const string = jest.fn(() => createMockSchema());
export const number = jest.fn(() => createMockSchema());
export const boolean = jest.fn(() => createMockSchema());
export const object = jest.fn((shape?: Record<string, unknown>) => ({
	...createMockSchema(),
	shape,
}));
export const array = jest.fn((itemSchema?: unknown) => ({
	...createMockSchema(),
	itemSchema,
}));
export const optional = jest.fn((schema?: unknown) => schema ?? createMockSchema());
export const nullable = jest.fn((schema?: unknown) => schema ?? createMockSchema());
export const union = jest.fn((schemas?: unknown[]) => ({
	...createMockSchema(),
	schemas,
}));
export const literal = jest.fn((value?: unknown) => ({
	...createMockSchema(),
	value,
}));
export const enum_ = jest.fn((values?: unknown) => ({
	...createMockSchema(),
	values,
}));
export const picklist = jest.fn((values?: unknown[]) => ({
	...createMockSchema(),
	values,
}));
export const record = jest.fn((keySchema?: unknown, valueSchema?: unknown) => ({
	...createMockSchema(),
	keySchema,
	valueSchema,
}));
export const tuple = jest.fn((schemas?: unknown[]) => ({
	...createMockSchema(),
	schemas,
}));
export const any = jest.fn(() => createMockSchema());
export const unknown = jest.fn(() => createMockSchema());
export const never = jest.fn(() => createMockSchema());
export const void_ = jest.fn(() => createMockSchema());
export const null_ = jest.fn(() => createMockSchema());
export const undefined_ = jest.fn(() => createMockSchema());

// Schema modifiers
export const pipe = jest.fn((schema: unknown) => schema);
export const transform = jest.fn((schema: unknown) => schema);
export const lazy = jest.fn((fn: () => unknown) => fn());
export const recursive = jest.fn((fn: () => unknown) => fn());
export const brand = jest.fn((schema: unknown) => schema);

// Validators
export const minLength = jest.fn(() => ({}));
export const maxLength = jest.fn(() => ({}));
export const length = jest.fn(() => ({}));
export const email = jest.fn(() => ({}));
export const url = jest.fn(() => ({}));
export const regex = jest.fn(() => ({}));
export const uuid = jest.fn(() => ({}));
export const cuid2 = jest.fn(() => ({}));
export const ulid = jest.fn(() => ({}));
export const isoDate = jest.fn(() => ({}));
export const isoTime = jest.fn(() => ({}));
export const isoDateTime = jest.fn(() => ({}));
export const isoTimestamp = jest.fn(() => ({}));
export const ipv4 = jest.fn(() => ({}));
export const ipv6 = jest.fn(() => ({}));
export const ip = jest.fn(() => ({}));
export const nonEmpty = jest.fn(() => ({}));
export const trim = jest.fn(() => ({}));
export const toLowerCase = jest.fn(() => ({}));
export const toUpperCase = jest.fn(() => ({}));
export const minValue = jest.fn(() => ({}));
export const maxValue = jest.fn(() => ({}));
export const value = jest.fn(() => ({}));
export const integer = jest.fn(() => ({}));
export const finite = jest.fn(() => ({}));
export const safeInteger = jest.fn(() => ({}));
export const multipleOf = jest.fn(() => ({}));

// Parse functions
export const parse = jest.fn((schema: unknown, data: unknown) => data);
export const safeParse = jest.fn((schema: unknown, data: unknown) => ({
	success: true,
	output: data,
}));
export const parseAsync = jest.fn(async (schema: unknown, data: unknown) => data);
export const safeParseAsync = jest.fn(async (schema: unknown, data: unknown) => ({
	success: true,
	output: data,
}));
export const is = jest.fn(() => true);
export const assert = jest.fn(() => undefined);

// Type inference helpers (type-only)
export type InferOutput<T> = T extends { _output: infer O } ? O : never;
export type InferInput<T> = T extends { _input: infer I } ? I : never;
