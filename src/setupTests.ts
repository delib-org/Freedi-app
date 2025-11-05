import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Polyfill for TextEncoder/TextDecoder
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Set up test Firebase environment variables
process.env.VITE_FIREBASE_API_KEY = 'test-api-key';
process.env.VITE_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
process.env.VITE_FIREBASE_DATABASE_URL = 'https://test.firebaseio.com';
process.env.VITE_FIREBASE_PROJECT_ID = 'test-project';
process.env.VITE_FIREBASE_STORAGE_BUCKET = 'test.appspot.com';
process.env.VITE_FIREBASE_MESSAGING_SENDER_ID = '123456789';
process.env.VITE_FIREBASE_APP_ID = '1:123456789:web:abcdef';
process.env.VITE_FIREBASE_MEASUREMENT_ID = 'G-ABCDEF';
process.env.VITE_FIREBASE_VAPID_KEY = 'test-vapid-key';

// Mock import.meta.env for Jest tests
// This needs to be defined before any modules that use import.meta.env are loaded
const importMetaEnv = {
  VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_DATABASE_URL: process.env.VITE_FIREBASE_DATABASE_URL,
  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID,
  VITE_FIREBASE_MEASUREMENT_ID: process.env.VITE_FIREBASE_MEASUREMENT_ID,
  VITE_FIREBASE_VAPID_KEY: process.env.VITE_FIREBASE_VAPID_KEY,
  DEV: false,
  PROD: true,
  MODE: 'test',
  BASE_URL: '/',
};

// Define import.meta globally for Jest
(globalThis as any).import = {
  meta: {
    env: importMetaEnv
  }
};

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

// Mock localStorage
const localStorageMock = (() => {
	let store: Record<string, string> = {};

	return {
		getItem: (key: string) => store[key] || null,
		setItem: (key: string, value: string) => {
			store[key] = value.toString();
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		},
	};
})();

Object.defineProperty(window, 'localStorage', {
	value: localStorageMock,
});

Object.defineProperty(window, 'sessionStorage', {
	value: localStorageMock,
});
