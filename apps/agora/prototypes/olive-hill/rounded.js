import * as THREE from './vendor/three.module.js';

/**
 * Rounded signs and boards. The app's overlays share one soft corner; the
 * world's signs, boards and papers wear the same one, as geometry — so the
 * corner holds whatever the canvas paints, with no alpha and no extra draw.
 */
function roundedShape(w, h, r) {
	const x = -w / 2, y = -h / 2, rr = Math.min(r, w / 2, h / 2);
	const shape = new THREE.Shape();
	shape.moveTo(x + rr, y);
	shape.lineTo(x + w - rr, y); shape.quadraticCurveTo(x + w, y, x + w, y + rr);
	shape.lineTo(x + w, y + h - rr); shape.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
	shape.lineTo(x + rr, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - rr);
	shape.lineTo(x, y + rr); shape.quadraticCurveTo(x, y, x + rr, y);

	return shape;
}

/** A flat w×h panel with rounded corners, centred, facing +Z, UVs 0..1 like PlaneGeometry. */
export function roundedPlane(w, h, r, segments = 5) {
	const geo = new THREE.ShapeGeometry(roundedShape(w, h, r), segments);
	const pos = geo.attributes.position, uv = geo.attributes.uv;
	for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + .5, pos.getY(i) / h + .5);
	uv.needsUpdate = true;

	return geo;
}

/** A w×h×d board with rounded corners (seen face-on), centred like BoxGeometry. */
export function roundedSlab(w, h, d, r, segments = 4) {
	const geo = new THREE.ExtrudeGeometry(roundedShape(w, h, r), { depth: d, bevelEnabled: false, curveSegments: segments });
	geo.translate(0, 0, -d / 2);

	return geo;
}
