// --- Group logic ---
// Only allow interiors in groups
export function getInteriors(manifest, currentType) {
	if (!manifest || !manifest.maps) return [];
	return manifest.maps.filter(m => currentType(m.name) === 'interior');
}

// Get group by name
export function getGroupByName(groups, name) {
	return groups.find(g => g.name === name);
}

// Get group for a map name
export function getGroupForMap(groups, mapName) {
	return groups.find(g => g.members.includes(mapName));
}

// Get all maps in a group
export function getMapsInGroup(groups, groupName) {
	const group = getGroupByName(groups, groupName);
	return group ? group.members : [];
}

// Check if a map is in any group
export function isMapGrouped(groups, mapName) {
	return !!getGroupForMap(groups, mapName);
}
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

// Mark a map as a specific type (interior/exterior) and trigger re-classification if needed
export function markMapType(map, toType) {
	if (!map || !map.name) return;
	if (toType !== 'exterior' && toType !== 'interior') return;
	typeOverrides[map.name] = toType;
	// Optionally, trigger re-classification or UI update in app.js after calling this
}

export function isExterior(map) {
	if (!map) return false;
	return currentType(map.name) === 'exterior';
}
