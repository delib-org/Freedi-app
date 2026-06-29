import {
	MutableRefObject,
	PointerEvent as ReactPointerEvent,
	RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';

/** Current pan/zoom transform applied to the map content. */
export interface PanZoomTransform {
	scale: number;
	/** Content translation in viewport pixels (transform-origin: 0 0). */
	x: number;
	y: number;
}

interface UsePanZoomOptions {
	/** Natural (unscaled) size of the content being panned/zoomed. */
	contentWidth: number;
	contentHeight: number;
	minScale?: number;
	maxScale?: number;
	/** Empty space (px) to keep around the content when fitting to view. */
	fitPadding?: number;
}

interface UsePanZoomResult {
	/** Attach to the viewport (the clipping container). */
	viewportRef: RefObject<HTMLDivElement>;
	transform: PanZoomTransform;
	/** Live scale, readable inside render-time callbacks (e.g. FLIP math). */
	scaleRef: MutableRefObject<number>;
	/** True while the user holds Space (pan-ready). */
	spaceHeld: boolean;
	/** True while actively dragging to pan. */
	isPanning: boolean;
	zoomIn: () => void;
	zoomOut: () => void;
	/** Fit the whole content within the viewport, centered. */
	fit: () => void;
	/** React pointer-down handler for drag-to-pan (mouse/pen). */
	onPointerDown: (e: ReactPointerEvent) => void;
}

const DEFAULT_MIN_SCALE = 0.2;
const DEFAULT_MAX_SCALE = 2.5;
const FIT_PADDING = 48;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const BUTTON_ZOOM_STEP = 1.25;

/** Is the target an element the user expects to interact with (so we don't pan)? */
function isInteractive(target: EventTarget | null): boolean {
	if (!(target instanceof Element)) return false;

	return !!target.closest(
		'button, a, input, textarea, select, [contenteditable="true"], [data-flip-id], [data-no-pan]',
	);
}

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;

	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Pan & zoom for an absolutely-positioned map canvas (cluster board, mind map).
 * Applies a `translate(x, y) scale(s)` transform (origin 0 0) to the content.
 *
 * Navigation:
 * - Desktop: mouse wheel zooms toward the cursor; drag empty space, hold Space
 *   and drag, or middle-mouse drag to pan. Cards/buttons stay interactive.
 * - Mobile: pinch to zoom, one-finger drag on empty space to pan.
 * - Buttons: zoom in/out around the center, fit-to-view.
 */
export function usePanZoom({
	contentWidth,
	contentHeight,
	minScale = DEFAULT_MIN_SCALE,
	maxScale = DEFAULT_MAX_SCALE,
	fitPadding = FIT_PADDING,
}: UsePanZoomOptions): UsePanZoomResult {
	const viewportRef = useRef<HTMLDivElement>(null);
	const [transform, setTransform] = useState<PanZoomTransform>({ scale: 1, x: 0, y: 0 });
	const transformRef = useRef(transform);
	transformRef.current = transform;
	const scaleRef = useRef(1);
	scaleRef.current = transform.scale;

	const [spaceHeld, setSpaceHeld] = useState(false);
	const spaceHeldRef = useRef(false);
	const [isPanning, setIsPanning] = useState(false);

	const clampScale = useCallback(
		(s: number) => Math.min(maxScale, Math.max(minScale, s)),
		[minScale, maxScale],
	);

	/** Zoom keeping the content point under (px, py) — viewport coords — fixed. */
	const zoomAt = useCallback(
		(rawScale: number, px: number, py: number) => {
			setTransform((prev) => {
				const scale = Math.min(maxScale, Math.max(minScale, rawScale));
				if (scale === prev.scale) return prev;
				const contentX = (px - prev.x) / prev.scale;
				const contentY = (py - prev.y) / prev.scale;

				return { scale, x: px - contentX * scale, y: py - contentY * scale };
			});
		},
		[minScale, maxScale],
	);

	const zoomByFactor = useCallback(
		(factor: number) => {
			const vp = viewportRef.current;
			if (!vp) return;
			const rect = vp.getBoundingClientRect();
			zoomAt(transformRef.current.scale * factor, rect.width / 2, rect.height / 2);
		},
		[zoomAt],
	);

	const zoomIn = useCallback(() => zoomByFactor(BUTTON_ZOOM_STEP), [zoomByFactor]);
	const zoomOut = useCallback(() => zoomByFactor(1 / BUTTON_ZOOM_STEP), [zoomByFactor]);

	const fit = useCallback(() => {
		const vp = viewportRef.current;
		if (!vp || !contentWidth || !contentHeight) return;
		const { width, height } = vp.getBoundingClientRect();
		if (!width || !height) return;
		const scale = clampScale(
			Math.min((width - fitPadding * 2) / contentWidth, (height - fitPadding * 2) / contentHeight),
		);

		setTransform({
			scale,
			x: (width - contentWidth * scale) / 2,
			y: (height - contentHeight * scale) / 2,
		});
	}, [contentWidth, contentHeight, clampScale, fitPadding]);

	// Fit once when the viewport and content are first ready.
	const didFitRef = useRef(false);
	useEffect(() => {
		if (didFitRef.current) return;
		if (!viewportRef.current || !contentWidth || !contentHeight) return;
		const { width, height } = viewportRef.current.getBoundingClientRect();
		if (!width || !height) return;
		didFitRef.current = true;
		fit();
	}, [contentWidth, contentHeight, fit]);

	// Track the Space key to enable pan-anywhere (ignored while typing).
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.code !== 'Space' || e.repeat) return;
			if (isEditableTarget(e.target)) return;
			e.preventDefault();
			spaceHeldRef.current = true;
			setSpaceHeld(true);
		};
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.code !== 'Space') return;
			spaceHeldRef.current = false;
			setSpaceHeld(false);
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);

		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, []);

	// Drag-to-pan (mouse / pen). Touch is handled by the native listeners below.
	const panRef = useRef<{
		pointerId: number;
		startX: number;
		startY: number;
		originX: number;
		originY: number;
	} | null>(null);

	const onPointerDown = useCallback((e: ReactPointerEvent) => {
		if (e.pointerType === 'touch') return;
		const panAnywhere = spaceHeldRef.current || e.button === 1;
		if (!panAnywhere && (e.button !== 0 || isInteractive(e.target))) return;
		e.preventDefault();
		const t = transformRef.current;
		panRef.current = {
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			originX: t.x,
			originY: t.y,
		};
		setIsPanning(true);
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}, []);

	useEffect(() => {
		const onMove = (e: PointerEvent) => {
			const pan = panRef.current;
			if (!pan || e.pointerId !== pan.pointerId) return;
			setTransform((prev) => ({
				...prev,
				x: pan.originX + (e.clientX - pan.startX),
				y: pan.originY + (e.clientY - pan.startY),
			}));
		};
		const onUp = (e: PointerEvent) => {
			if (!panRef.current || e.pointerId !== panRef.current.pointerId) return;
			panRef.current = null;
			setIsPanning(false);
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);

		return () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
		};
	}, []);

	// Native wheel (zoom) + touch (pinch/pan) listeners — registered non-passive
	// so we can preventDefault the browser's own scroll/zoom.
	useEffect(() => {
		const vp = viewportRef.current;
		if (!vp) return;

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const rect = vp.getBoundingClientRect();
			const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
			zoomAt(transformRef.current.scale * factor, e.clientX - rect.left, e.clientY - rect.top);
		};

		// Touch: 1 finger on empty space = pan, 2 fingers = pinch-zoom + pan.
		let touchPan: { x: number; y: number; originX: number; originY: number } | null = null;
		let pinch: { dist: number; cx: number; cy: number } | null = null;

		const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

		const onTouchStart = (e: TouchEvent) => {
			const rect = vp.getBoundingClientRect();
			if (e.touches.length === 2) {
				const [a, b] = [e.touches[0], e.touches[1]];
				pinch = {
					dist: dist(a, b),
					cx: (a.clientX + b.clientX) / 2 - rect.left,
					cy: (a.clientY + b.clientY) / 2 - rect.top,
				};
				touchPan = null;
				e.preventDefault();
			} else if (e.touches.length === 1 && !isInteractive(e.target)) {
				const t = transformRef.current;
				touchPan = {
					x: e.touches[0].clientX,
					y: e.touches[0].clientY,
					originX: t.x,
					originY: t.y,
				};
			}
		};

		const onTouchMove = (e: TouchEvent) => {
			const rect = vp.getBoundingClientRect();
			if (e.touches.length === 2 && pinch) {
				e.preventDefault();
				const [a, b] = [e.touches[0], e.touches[1]];
				const newDist = dist(a, b);
				const cx = (a.clientX + b.clientX) / 2 - rect.left;
				const cy = (a.clientY + b.clientY) / 2 - rect.top;
				const ratio = newDist / (pinch.dist || newDist);
				zoomAt(transformRef.current.scale * ratio, cx, cy);
				pinch = { dist: newDist, cx, cy };
			} else if (e.touches.length === 1 && touchPan) {
				e.preventDefault();
				// Snapshot the origin before setTransform: React may invoke the
				// updater during a later render, by which point onTouchEnd could
				// have nulled `touchPan` (the "Cannot read properties of null
				// (reading 'originX')" crash on mobile).
				const { x: startX, y: startY, originX, originY } = touchPan;
				const dx = e.touches[0].clientX - startX;
				const dy = e.touches[0].clientY - startY;
				setTransform((prev) => ({ ...prev, x: originX + dx, y: originY + dy }));
			}
		};

		const onTouchEnd = (e: TouchEvent) => {
			if (e.touches.length < 2) pinch = null;
			if (e.touches.length === 0) touchPan = null;
		};

		vp.addEventListener('wheel', onWheel, { passive: false });
		vp.addEventListener('touchstart', onTouchStart, { passive: false });
		vp.addEventListener('touchmove', onTouchMove, { passive: false });
		vp.addEventListener('touchend', onTouchEnd);
		vp.addEventListener('touchcancel', onTouchEnd);

		return () => {
			vp.removeEventListener('wheel', onWheel);
			vp.removeEventListener('touchstart', onTouchStart);
			vp.removeEventListener('touchmove', onTouchMove);
			vp.removeEventListener('touchend', onTouchEnd);
			vp.removeEventListener('touchcancel', onTouchEnd);
		};
	}, [zoomAt]);

	return {
		viewportRef,
		transform,
		scaleRef,
		spaceHeld,
		isPanning,
		zoomIn,
		zoomOut,
		fit,
		onPointerDown,
	};
}
