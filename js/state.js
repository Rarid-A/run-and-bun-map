// State management for interior placements, groups, and manifest
// Used by app.js and other modules
export let interiorPlacements = [];
export let selectedInteriorForPlacement = null;
export let interiorGroups = [];
export let manifest = null;
export let worldAtlas = null;
export let worldAtlasSource = 'none';
export let mutableAtlas = null;

export function setManifest(m) { manifest = m; }
export function setWorldAtlas(a, src = 'none') { worldAtlas = a; worldAtlasSource = src; }
export function setMutableAtlas(a) { mutableAtlas = a; }
export function setInteriorPlacements(p) { interiorPlacements = p; }
export function setInteriorGroups(g) { interiorGroups = g; }
export function setSelectedInteriorForPlacement(sel) { selectedInteriorForPlacement = sel; }

// --- Map classification and type override logic ---
export let mapsByName = {};
export let exteriorNames = new Set();
export let allExterior = false;
export let typeOverrides = {};

export function buildMapClassification(manifest, worldAtlas) {
	mapsByName = {};
	if (manifest && manifest.maps) {
		manifest.maps.forEach((m, idx) => {
			mapsByName[m.name] = m;
		});
	}
	exteriorNames = new Set();
	if (worldAtlas && Array.isArray(worldAtlas.maps) && worldAtlas.maps.length) {
		worldAtlas.maps.forEach(m => {
			if (m.name) exteriorNames.add(m.name);
		});
	}
	allExterior = !exteriorNames.size;
}

export function currentType(name) {
	if (typeOverrides[name]) return typeOverrides[name];
	if (allExterior) return 'exterior';
	return exteriorNames.has(name) ? 'exterior' : 'interior';
}

export function markMapType(map, toType) {
	if (!map || !map.name) return;
	typeOverrides[map.name] = toType;
}

export function isExterior(map) {
	if (!map) return false;
	return currentType(map.name) === 'exterior';
}
