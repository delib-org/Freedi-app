import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Polyfill for TextEncoder/TextDecoder
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock import.meta for all files
const mockImportMeta = {
  env: {
    DEV: false,
    PROD: true,
    MODE: 'test',
    BASE_URL: '/'
  }
};

// Replace import.meta in source files during transformation
jest.mock('import.meta', () => mockImportMeta, { virtual: true });

// Also define it globally
Object.defineProperty(globalThis, 'import', {
  value: {
    meta: mockImportMeta
  },
  configurable: true,
  writable: true
});

// Mock matchMedia for responsive tests
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: jest.fn().mockImplementation(query => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: jest.fn(), // deprecated
		removeListener: jest.fn(), // deprecated
		addEventListener: jest.fn(),
		removeEventListener: jest.fn(),
		dispatchEvent: jest.fn(),
	})),
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
	observe: jest.fn(),
	unobserve: jest.fn(),
	disconnect: jest.fn(),
}));

// Mock Canvas API for chart tests
HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
	clearRect: jest.fn(),
	fillRect: jest.fn(),
	strokeRect: jest.fn(),
	beginPath: jest.fn(),
	moveTo: jest.fn(),
	lineTo: jest.fn(),
	arc: jest.fn(),
	fill: jest.fn(),
	stroke: jest.fn(),
	scale: jest.fn(),
	translate: jest.fn(),
	rotate: jest.fn(),
	save: jest.fn(),
	restore: jest.fn(),
	fillText: jest.fn(),
	measureText: jest.fn().mockReturnValue({ width: 100 }),
});

// Mock devicePixelRatio
Object.defineProperty(window, 'devicePixelRatio', {
	writable: true,
	value: 2,
});
