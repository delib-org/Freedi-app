/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />
/// <reference types="vite-plugin-pwa/client" />

// declare module '*.svg?react' {
// 	import * as React from 'react';

// 	const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
// 	export default ReactComponent;
// }

interface ImportMetaEnv {
	/** Origin of Agora, where "Back to the village" returns a guest (default agora.wizcol.com) */
	readonly VITE_AGORA_ORIGIN?: string;
}
