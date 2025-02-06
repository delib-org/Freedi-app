import { FC, SVGProps } from 'react';

declare module '*.module.css';
declare module '*.module.scss';

declare module '*.svg?react' {
	export const ReactComponent: FC<SVGProps<SVGSVGElement>>;
	const src: string;
	export default ReactComponent;
}
