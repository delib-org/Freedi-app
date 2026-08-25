// Compatibility shim — ShareHub now lives in the atomic molecules layer.
// Existing pages import the default; new code should import
// `{ ShareHub } from '@/components/atomic/molecules/ShareHub'`.
export { ShareHub as default } from '@/components/atomic/molecules/ShareHub';
export type { ShareHubProps } from '@/components/atomic/molecules/ShareHub';
