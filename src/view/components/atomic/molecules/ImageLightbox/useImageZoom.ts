import {
	PointerEvent as ReactPointerEvent,
	RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';
import {
	IMAGE_ZOOM,
	Point,
	RESTING_TRANSFORM,
	Size,
	ZoomTransform,
	clampPan,
	distanceBetween,
	isResting,
	midpointOf,
	zoomTo,
} from './imageZoomMath';

interface DragGesture {
	kind: 'drag';
	origin: Point;
	start: ZoomTransform;
	moved: boolean;
	/** A tap that began on the picture zooms; one on the empty stage closes. */
	onImage: boolean;
}

interface PinchGesture {
	kind: 'pinch';
	startDistance: number;
	startMidpoint: Point;
	start: ZoomTransform;
}

interface Measurements {
	image: Size;
	stage: Size;
	centre: Point;
}

interface UseImageZoomOptions {
	/** Called when the user zooms out past the fitted size, or taps the empty stage. */
	onClose: () => void;
}

export interface UseImageZoomResult {
	stageRef: RefObject<HTMLDivElement>;
	imageRef: RefObject<HTMLImageElement>;
	transform: ZoomTransform;
	/** True while a finger or the mouse is moving the picture (no easing then). */
	isGesturing: boolean;
	canZoomIn: boolean;
	zoomIn: () => void;
	/** Steps back toward the fitted size; from the fitted size it closes. */
	zoomOut: () => void;
	reset: () => void;
	stageHandlers: {
		onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
		onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
		onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
		onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
	};
}

/**
 * Zoom and pan for one picture: wheel, pinch, drag, double tap and buttons.
 * Zooming out when the picture is already at its fitted size closes the viewer.
 */
export function useImageZoom({ onClose }: UseImageZoomOptions): UseImageZoomResult {
	const stageRef = useRef<HTMLDivElement>(null);
	const imageRef = useRef<HTMLImageElement>(null);
	const [transform, setTransform] = useState<ZoomTransform>(RESTING_TRANSFORM);
	const [isGesturing, setIsGesturing] = useState(false);

	// Handlers read the live values through refs so a burst of pointer or wheel
	// events never works from a stale render.
	const transformRef = useRef<ZoomTransform>(RESTING_TRANSFORM);
	const pointers = useRef(new Map<number, Point>());
	const gesture = useRef<DragGesture | PinchGesture | null>(null);
	const lastTap = useRef<{ time: number; point: Point } | null>(null);
	const lastWheelTime = useRef(Number.NEGATIVE_INFINITY);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	const apply = useCallback((next: ZoomTransform) => {
		transformRef.current = next;
		setTransform(next);
	}, []);

	const measure = useCallback((): Measurements | null => {
		const stage = stageRef.current;
		const image = imageRef.current;
		if (!stage || !image) return null;
		const rect = stage.getBoundingClientRect();

		return {
			// offset* ignore the transform: the picture's size at scale 1.
			image: { width: image.offsetWidth, height: image.offsetHeight },
			stage: { width: rect.width, height: rect.height },
			centre: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
		};
	}, []);

	const zoomBy = useCallback(
		(factor: number, clientPoint?: Point) => {
			const current = transformRef.current;
			if (factor < 1 && isResting(current)) {
				onCloseRef.current();

				return;
			}
			const measured = measure();
			if (!measured) return;
			const anchor = clientPoint
				? { x: clientPoint.x - measured.centre.x, y: clientPoint.y - measured.centre.y }
				: { x: 0, y: 0 };
			apply(zoomTo(current, current.scale * factor, anchor, measured.image, measured.stage));
		},
		[apply, measure],
	);

	const zoomIn = useCallback(() => zoomBy(IMAGE_ZOOM.BUTTON_STEP), [zoomBy]);
	const zoomOut = useCallback(() => zoomBy(1 / IMAGE_ZOOM.BUTTON_STEP), [zoomBy]);
	const reset = useCallback(() => apply(RESTING_TRANSFORM), [apply]);

	// React registers wheel listeners as passive, and a passive listener cannot
	// stop the page behind the viewer from scrolling or the browser from zooming.
	useEffect(() => {
		const stage = stageRef.current;
		if (!stage) return undefined;

		const handleWheel = (event: WheelEvent) => {
			event.preventDefault();
			const isContinuing =
				event.timeStamp - lastWheelTime.current < IMAGE_ZOOM.WHEEL_GESTURE_GAP_MS;
			lastWheelTime.current = event.timeStamp;
			const factor = Math.exp(-event.deltaY * IMAGE_ZOOM.WHEEL_SENSITIVITY);

			// One long scroll that brings the picture back to its fitted size
			// stops there; it takes a fresh scroll to leave the viewer.
			if (factor < 1 && isResting(transformRef.current) && isContinuing) return;

			zoomBy(factor, { x: event.clientX, y: event.clientY });
		};

		stage.addEventListener('wheel', handleWheel, { passive: false });

		return () => stage.removeEventListener('wheel', handleWheel);
	}, [zoomBy]);

	const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		// The viewer is portalled, but React still bubbles its events to the card
		// that opened it, and the card cancels pointerdown.
		event.stopPropagation();
		event.currentTarget.setPointerCapture?.(event.pointerId);
		pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

		const points = Array.from(pointers.current.values());
		if (points.length === 2) {
			gesture.current = {
				kind: 'pinch',
				startDistance: Math.max(distanceBetween(points[0], points[1]), 1),
				startMidpoint: midpointOf(points[0], points[1]),
				start: transformRef.current,
			};
			setIsGesturing(true);
		} else if (points.length === 1) {
			gesture.current = {
				kind: 'drag',
				origin: points[0],
				start: transformRef.current,
				moved: false,
				onImage: event.target === imageRef.current,
			};
		}
	}, []);

	const onPointerMove = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (!pointers.current.has(event.pointerId)) return;
			const point = { x: event.clientX, y: event.clientY };
			pointers.current.set(event.pointerId, point);

			const current = gesture.current;
			const measured = measure();
			if (!current || !measured) return;

			if (current.kind === 'pinch') {
				const [first, second] = Array.from(pointers.current.values());
				if (!second) return;
				const midpoint = midpointOf(first, second);
				const scale =
					(current.start.scale * distanceBetween(first, second)) / current.startDistance;
				const zoomed = zoomTo(
					current.start,
					scale,
					{
						x: current.startMidpoint.x - measured.centre.x,
						y: current.startMidpoint.y - measured.centre.y,
					},
					measured.image,
					measured.stage,
					IMAGE_ZOOM.PINCH_FLOOR,
				);
				// The fingers may also travel together: carry the picture along.
				apply(
					isResting(zoomed)
						? zoomed
						: clampPan(
								{
									scale: zoomed.scale,
									x: zoomed.x + midpoint.x - current.startMidpoint.x,
									y: zoomed.y + midpoint.y - current.startMidpoint.y,
								},
								measured.image,
								measured.stage,
							),
				);

				return;
			}

			const dx = point.x - current.origin.x;
			const dy = point.y - current.origin.y;
			if (!current.moved && Math.hypot(dx, dy) > IMAGE_ZOOM.TAP_SLOP_PX) {
				current.moved = true;
				setIsGesturing(true);
			}
			if (current.moved && !isResting(current.start)) {
				apply(
					clampPan(
						{ scale: current.start.scale, x: current.start.x + dx, y: current.start.y + dy },
						measured.image,
						measured.stage,
					),
				);
			}
		},
		[apply, measure],
	);

	const endPointer = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>, isCancelled: boolean) => {
			if (!pointers.current.delete(event.pointerId)) return;
			const ended = gesture.current;
			if (!ended) return;
			gesture.current = null;
			setIsGesturing(false);

			if (ended.kind === 'pinch') {
				const released = transformRef.current;
				if (released.scale < IMAGE_ZOOM.CLOSE_BELOW) {
					onCloseRef.current();
				} else if (released.scale < IMAGE_ZOOM.MIN_SCALE) {
					apply(RESTING_TRANSFORM);
				}

				return;
			}

			if (ended.moved || isCancelled) return;

			// A tap. On the empty stage it leaves the viewer.
			if (!ended.onImage) {
				onCloseRef.current();

				return;
			}

			const point = { x: event.clientX, y: event.clientY };
			const previous = lastTap.current;
			const isDoubleTap =
				previous !== null &&
				event.timeStamp - previous.time < IMAGE_ZOOM.DOUBLE_TAP_MS &&
				distanceBetween(previous.point, point) < IMAGE_ZOOM.DOUBLE_TAP_SLOP_PX;

			if (!isDoubleTap) {
				lastTap.current = { time: event.timeStamp, point };

				return;
			}

			lastTap.current = null;
			const measured = measure();
			const current = transformRef.current;
			if (!isResting(current) || !measured) {
				apply(RESTING_TRANSFORM);

				return;
			}
			apply(
				zoomTo(
					current,
					IMAGE_ZOOM.DOUBLE_TAP_SCALE,
					{ x: point.x - measured.centre.x, y: point.y - measured.centre.y },
					measured.image,
					measured.stage,
				),
			);
		},
		[apply, measure],
	);

	const onPointerUp = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => endPointer(event, false),
		[endPointer],
	);
	const onPointerCancel = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => endPointer(event, true),
		[endPointer],
	);

	return {
		stageRef,
		imageRef,
		transform,
		isGesturing,
		canZoomIn: transform.scale < IMAGE_ZOOM.MAX_SCALE,
		zoomIn,
		zoomOut,
		reset,
		stageHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
	};
}

export default useImageZoom;
