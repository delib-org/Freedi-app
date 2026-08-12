/** Types for preflight.mjs — kept as plain JS so .mjs scripts can import it too. */
export type PreflightCheck = 'firestore' | 'auth' | 'functions' | 'vite';

export interface PreflightOptions {
	needs?: PreflightCheck[];
	autoSeed?: boolean;
	quiet?: boolean;
}

export function preflight(options?: PreflightOptions): Promise<void>;

export const APP_ROOT: string;
export const PROJECT_ID: string;
export const REGION: string;
export const AUTH_HOST: string;
export const FIRESTORE_HOST: string;
export const FUNCTIONS_HOST: string;
export const VITE_HOST: string;
export const FIRESTORE_REST: string;
export const FUNCTIONS_BASE: string;
export const TOPIC_PACKAGE_ID: string;
