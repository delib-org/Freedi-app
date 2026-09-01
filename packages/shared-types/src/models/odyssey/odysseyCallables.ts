/**
 * Wire contract of the `odysseyMintAgoraHandoff` callable.
 *
 * Declared once, imported by both the Odyssey client
 * (`apps/odyssey/src/lib/callables.ts`) and the function
 * (`functions/src/odyssey/fn_odysseyMintAgoraHandoff.ts`), so a drift between
 * the two sides is a compile error rather than a runtime surprise.
 *
 * Field names are the wire format. Do not rename them.
 */
export interface MintAgoraHandoffResponse {
	token: string;
	uid: string;
}
