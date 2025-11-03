// Add map drag/edit event handlers (modularized from app.js)
export function wireMapEditEvents(map, overlayIndex, overlayToName, setOverlayPxBounds, getOverlayPxBounds, snapOverlayToNeighbors, stashCurrentLayout) {
  let dragState = null;
  map.on('mousedown', (e) => {
    if (!map._container.classList.contains('editing') || !e.originalEvent) return;
    const target = e.originalEvent.target;
    const overlay = findOverlayByTarget(overlayIndex, target);
    if (!overlay) return;
    map.dragging.disable();
    dragState = {
      overlay,
      startLatLng: e.latlng,
      startBounds: overlay.getBounds(),
    };
  });

  map.on('mousemove', (e) => {
    if (!dragState) return;
    const dx = e.latlng.lng - dragState.startLatLng.lng;
    const dy = e.latlng.lat - dragState.startLatLng.lat;
    const b = dragState.startBounds;
    const x = b.getWest() + dx;
    const y = b.getSouth() + dy;
    const w = b.getEast() - b.getWest();
    const h = b.getNorth() - b.getSouth();
    setOverlayPxBounds(dragState.overlay, x, y, w, h);
    // Move label marker with overlay while dragging
    const name = overlayToName.get(dragState.overlay);
    if (name) {
      const obj = overlayIndex.get(name);
      if (obj && obj.label) {
        obj.label.setLatLng([y + h/2, x + w/2]);
      }
    }
  });

  map.on('mouseup', () => {
    if (!dragState) return;
    // Snap corners on release
    snapOverlayToNeighbors(dragState.overlay, overlayIndex, getOverlayPxBounds, setOverlayPxBounds, 10);
    // Persist after snapping so leaving the view keeps positions
    stashCurrentLayout({ overlayIndex, mutableAtlas: map._mutableAtlas, currentType, mapsByName });
    dragState = null;
    map.dragging.enable();
  });
}
// --- Overlay, marker, and navigation logic from app.js ---
import { safeImageUrl } from './utils.js';
import { mapsByName, currentType } from './state.js';

export let overlaysGroup, markersLayer, overlayIndex, overlayToName, dragState;

// Setup map overlay and marker groups, and initialize drag/edit state
export function setupMap(map, manifest, worldAtlas, worldMaps, interiorMaps, mutableAtlasRef, toggleLabels, toggleIncludeInteriors) {
  overlaysGroup = L.layerGroup().addTo(map);
  markersLayer = L.layerGroup().addTo(map);
  overlayIndex = new Map();
  overlayToName = new Map();
  dragState = null;
  // Optionally store mutableAtlas reference for later use
  if (mutableAtlasRef) map._mutableAtlas = mutableAtlasRef;
  // Add more setup logic as needed
}

// Show world view with stitched maps (exteriors only)
export function showWorldView({
  map,
  manifest,
  worldAtlas,
  worldMaps,
  interiorMaps,
  mutableAtlas,
  toggleLabels,
  toggleIncludeInteriors,
  overlayIndex,
  overlayToName,
  overlaysGroup,
  markersLayer,
  setBreadcrumb,
  setMapInfo,
  backBtn
}) {
  // Clear overlays and markers
  overlaysGroup.clearLayers();
  markersLayer.clearLayers();
  overlayIndex.clear();
  overlayToName.clear();

  // UI updates
  setBreadcrumb('🗺️ World Map');
  setMapInfo(worldAtlas && Array.isArray(worldAtlas.maps)
    ? `Using precomputed atlas layout for ${worldAtlas.maps.length} maps`
    : `Viewing ${worldMaps.length} world maps (grid layout)`);
  if (backBtn) backBtn.style.display = 'none';

  // Use mutableAtlas if present, else worldAtlas if present, else grid fallback
  const atlasToUse = (mutableAtlas && Array.isArray(mutableAtlas.maps) && mutableAtlas.maps.length)
    ? mutableAtlas
    : (worldAtlas && Array.isArray(worldAtlas.maps) && worldAtlas.maps.length ? worldAtlas : null);

  if (atlasToUse) {
    // Use atlas positions
    let maxX = 0, maxY = 0;
    atlasToUse.maps.forEach(entry => {
      const w = entry.width, h = entry.height;
      const bounds = [[entry.y, entry.x], [entry.y + h, entry.x + w]];
      const overlay = L.imageOverlay(safeImageUrl(entry.image), bounds, { opacity: 0.95, interactive: true });
      overlaysGroup.addLayer(overlay);
      overlayIndex.set(entry.name, { entry, overlay });
      overlayToName.set(overlay, entry.name);
      if (!toggleLabels || toggleLabels.checked) {
        const marker = L.marker([entry.y + h/2, entry.x + w/2], {
          icon: L.divIcon({ className: 'map-label', html: `<div class=\"map-label-text\">${entry.name}</div>`, iconSize: [200, 40] })
        });
        // Try to map atlas entry back to manifest map by name
        const manifestMatch = mapsByName[entry.name] || (manifest.maps ? manifest.maps.find(m => m.name === entry.name) : null);
        marker.on('click', () => {
          // TODO: stashCurrentLayout();
          // TODO: showSingleMap(manifestMatch);
        });
        markersLayer.addLayer(marker);
        const idxObj = overlayIndex.get(entry.name);
        if (idxObj) idxObj.label = marker;
      }
      maxX = Math.max(maxX, entry.x + w);
      maxY = Math.max(maxY, entry.y + h);
    });
    // Append missing WORLD maps (not in atlas) below the existing atlas area
    const paddingMissing = 50;
    let mOffX = 0;
    let mOffY = maxY + paddingMissing;
    let mRowMaxH = 0;
    const perRowMissing = 4;
    const missingWorlds = worldMaps.filter(m => !overlayIndex.has(m.name));
    missingWorlds.forEach((m, idx) => {
      const w = m.width || 640;
      const h = m.height || 640;
      if (idx > 0 && idx % perRowMissing === 0) {
        mOffY += mRowMaxH + paddingMissing;
        mOffX = 0;
        mRowMaxH = 0;
      }
      const boundsM = [[mOffY, mOffX], [mOffY + h, mOffX + w]];
      const ovM = L.imageOverlay(safeImageUrl(m.image), boundsM, { opacity: 0.9, interactive: true });
      overlaysGroup.addLayer(ovM);
      overlayIndex.set(m.name, { entry: { name: m.name, image: m.image, width: w, height: h, x: mOffX, y: mOffY }, overlay: ovM });
      overlayToName.set(ovM, m.name);
      if (!toggleLabels || toggleLabels.checked) {
        const marker = L.marker([mOffY + h/2, mOffX + w/2], {
          icon: L.divIcon({ className: 'map-label', html: `<div class=\"map-label-text\">${m.name}</div>`, iconSize: [200, 40] })
        });
        markersLayer.addLayer(marker);
        const idxObj = overlayIndex.get(m.name);
        if (idxObj) idxObj.label = marker;
      }
      mOffX += w + paddingMissing;
      mRowMaxH = Math.max(mRowMaxH, h);
      maxX = Math.max(maxX, mOffX);
    });
    // Optionally append interior maps to the right side for visibility
    if (toggleIncludeInteriors && toggleIncludeInteriors.checked) {
      const padding = 50;
      let offsetX = maxX + padding;
      let offsetY = 0;
      let maxColWidth = 0;
      let colHeight = 0;
      const perCol = 6;
      const toAdd = interiorMaps.filter(m => !overlayIndex.has(m.name));
      toAdd.forEach((m, idx) => {
        const w = m.width || 320;
        const h = m.height || 320;
        if (idx > 0 && idx % perCol === 0) {
          // next column
          offsetX += (maxColWidth || 320) + padding;
          offsetY = 0;
          maxColWidth = 0;
          colHeight = 0;
        }
        const boundsI = [[offsetY, offsetX], [offsetY + h, offsetX + w]];
        const ovI = L.imageOverlay(safeImageUrl(m.image), boundsI, { opacity: 0.9, interactive: true });
        overlaysGroup.addLayer(ovI);
        overlayIndex.set(m.name, { entry: { name: m.name, image: m.image, width: w, height: h, x: offsetX, y: offsetY }, overlay: ovI });
        if (!toggleLabels || toggleLabels.checked) {
          const marker = L.marker([offsetY + h/2, offsetX + w/2], {
            icon: L.divIcon({ className: 'map-label', html: `<div class=\"map-label-text\">${m.name}</div>`, iconSize: [200, 40] })
          });
          markersLayer.addLayer(marker);
        }
        offsetY += h + padding;
        maxColWidth = Math.max(maxColWidth, w);
        colHeight = Math.max(colHeight, offsetY);
      });
      const fitMaxX = offsetX + maxColWidth;
      const fitMaxY = Math.max(maxY, colHeight);
      map.fitBounds([[0, 0], [fitMaxY, fitMaxX]]);
    } else {
      map.fitBounds([[0, 0], [maxY, maxX]]);
    }
  } else {
    // Simple grid layout for world maps
    let offsetX = 0;
    let offsetY = 0;
    let maxHeight = 0;
    const padding = 50;
    worldMaps.forEach((m, idx) => {
      const w = m.width || 640;
      const h = m.height || 640;
      if (idx > 0 && idx % 4 === 0) {
        offsetY += maxHeight + padding;
        offsetX = 0;
        maxHeight = 0;
      }
      const bounds = [[offsetY, offsetX], [offsetY + h, offsetX + w]];
      const overlay = L.imageOverlay(safeImageUrl(m.image), bounds, { opacity: 0.9, interactive: true });
      overlaysGroup.addLayer(overlay);
      overlayIndex.set(m.name, { entry: { name: m.name, image: m.image, width: w, height: h, x: offsetX, y: offsetY }, overlay });
      overlayToName.set(overlay, m.name);
      const centerY = offsetY + h / 2;
      const centerX = offsetX + w / 2;
      if (!toggleLabels || toggleLabels.checked) {
        const marker = L.marker([centerY, centerX], {
          icon: L.divIcon({ className: 'map-label', html: `<div class=\"map-label-text\">${m.name}</div>`, iconSize: [200, 40] })
        });
        marker.on('click', () => {
          // TODO: stashCurrentLayout();
          // TODO: showSingleMap(m);
        });
        markersLayer.addLayer(marker);
        const idxObj = overlayIndex.get(m.name);
        if (idxObj) idxObj.label = marker;
      }
      offsetX += w + padding;
      maxHeight = Math.max(maxHeight, h);
    });
    let finalMaxY = offsetY + maxHeight;
    let finalMaxX = offsetX;
    // Optionally append interior maps under the world grid
    if (toggleIncludeInteriors && toggleIncludeInteriors.checked) {
      const padding = 50;
      let iOffX = 0;
      let iOffY = finalMaxY + padding;
      let iRowMaxH = 0;
      const perRow = 4;
      interiorMaps.forEach((m, idx) => {
        const w = m.width || 320;
        const h = m.height || 320;
        if (idx > 0 && idx % perRow === 0) {
          iOffY += iRowMaxH + padding;
          iOffX = 0;
          iRowMaxH = 0;
        }
        const bI = [[iOffY, iOffX], [iOffY + h, iOffX + w]];
        const ovI = L.imageOverlay(safeImageUrl(m.image), bI, { opacity: 0.85, interactive: true });
        overlaysGroup.addLayer(ovI);
        overlayIndex.set(m.name, { entry: { name: m.name, image: m.image, width: w, height: h, x: iOffX, y: iOffY }, overlay: ovI });
        if (!toggleLabels || toggleLabels.checked) {
          const marker = L.marker([iOffY + h/2, iOffX + w/2], {
            icon: L.divIcon({ className: 'map-label', html: `<div class=\"map-label-text\">${m.name}</div>`, iconSize: [200, 40] })
          });
          markersLayer.addLayer(marker);
          const idxObj = overlayIndex.get(m.name);
          if (idxObj) idxObj.label = marker;
        }
        iOffX += w + padding;
        iRowMaxH = Math.max(iRowMaxH, h);
        finalMaxX = Math.max(finalMaxX, iOffX);
      });
      finalMaxY = iOffY + iRowMaxH;
    }
    map.fitBounds([[0, 0], [finalMaxY, finalMaxX]]);
  }
}

export function showSingleMap({
  map,
  mapData,
  overlaysGroup,
  markersLayer,
  setBreadcrumb,
  setMapInfo,
  backBtn,
  renderInteriorMarkers
}) {
  // Remove any lingering tooltips
  document.querySelectorAll('.interior-tooltip').forEach(el => el.remove());
  // Set view state
  overlaysGroup.clearLayers();
  markersLayer.clearLayers();
  setBreadcrumb(`<strong>${mapData.name}</strong>`);
  setMapInfo(`${mapData.width}×${mapData.height}px`);
  if (backBtn) backBtn.style.display = 'none';
  const w = mapData.width;
  const h = mapData.height;
  const bounds = [[0, 0], [h, w]];
  const overlay = L.imageOverlay(safeImageUrl(mapData.image), bounds);
  overlaysGroup.addLayer(overlay);
  map.fitBounds(bounds);
  // Show interior markers for this map (handled by renderInteriorMarkers)
  if (typeof renderInteriorMarkers === 'function') renderInteriorMarkers();
}

export function renderInteriorMarkers({
  map,
  manifest,
  worldAtlas,
  interiorPlacements,
  interiorGroups,
  currentView,
  currentMapData,
  showInteriorsToggle,
  showSingleMap
}) {
  // Remove all existing interior markers
  if (!map._interiorMarkersLayer) map._interiorMarkersLayer = L.layerGroup().addTo(map);
  map._interiorMarkersLayer.clearLayers();
  if (!showInteriorsToggle || !showInteriorsToggle.checked) return;
  // Show markers for current view (world or single map)
  let parent = null;
  if (currentView === 'single' && currentMapData) {
    parent = currentMapData.name;
  }
  for (const placement of interiorPlacements) {
    let show = false;
    let markerX = placement.x;
    let markerY = placement.y;
    if (parent === null) {
      // World view: show only world-placed markers
      show = !placement.parent;
    } else {
      // Single map view
      if (placement.parent === parent) {
        // Marker placed in this interior, use local coordinates
        show = true;
      } else if (!placement.parent && worldAtlas && Array.isArray(worldAtlas.maps)) {
        // Marker placed in world, check if it's inside this map's atlas bounds
        const atlasEntry = worldAtlas.maps.find(e => e.name === parent);
        if (atlasEntry) {
          if (
            placement.x >= atlasEntry.x && placement.x <= atlasEntry.x + atlasEntry.width &&
            placement.y >= atlasEntry.y && placement.y <= atlasEntry.y + atlasEntry.height
          ) {
            show = true;
            // Transform world coords to local map coords
            markerX = placement.x - atlasEntry.x;
            markerY = placement.y - atlasEntry.y;
          }
        }
      }
    }
    if (show) {
      const m = manifest.maps.find(x => x.name === placement.name);
      if (!m) continue;
      const group = interiorGroups.find(g => g.members.includes(placement.name));
      // Choose icon
      let iconHtml = '';
      switch (placement.icon) {
        case 'cave': iconHtml = '⛰️'; break;
        case 'stairs': iconHtml = '⬆️'; break;
        case 'dive': iconHtml = '🌊'; break;
        case 'generic': iconHtml = '⭐'; break;
        default: iconHtml = '🚪';
      }
      const marker = L.marker([markerY, markerX], {
        icon: L.divIcon({ className: 'interior-marker', html: `<div class="interior-marker-icon">${iconHtml}</div>`, iconSize: [32, 32] })
      });
      marker.on('click', () => {
        if (typeof showSingleMap === 'function') showSingleMap(m);
      });
      marker.on('mouseover', (e) => {
        const tooltip = document.createElement('div');
        tooltip.className = 'interior-tooltip';
        tooltip.textContent = group ? `${placement.name} (Group: ${group.name})` : placement.name;
        document.body.appendChild(tooltip);
        function moveTooltip(ev) {
          tooltip.style.left = (ev.originalEvent.pageX + 12) + 'px';
          tooltip.style.top = (ev.originalEvent.pageY - 8) + 'px';
        }
        moveTooltip(e);
        marker.on('mousemove', moveTooltip);
        marker.on('mouseout', () => {
          tooltip.remove();
          marker.off('mousemove', moveTooltip);
        });
      });
      map._interiorMarkersLayer.addLayer(marker);
    }
  }
}

export function setEditEnabled(map, enabled) {
  if (enabled) {
    map._container.classList.add('editing');
  } else {
    map._container.classList.remove('editing');
    if (map._dragState) map._dragState = null;
  }
}

export function stashCurrentLayout({ overlayIndex, mutableAtlas, currentType, mapsByName }) {
  if (!overlayIndex.size) return;
  const maps = [];
  for (const [name, obj] of overlayIndex.entries()) {
    // Do not stash interior overlays added by the "Include interiors" toggle
    if (typeof currentType === 'function' && currentType(name) === 'interior') continue;
    const b = obj.overlay.getBounds();
    const w = b.getEast() - b.getWest();
    const h = b.getNorth() - b.getSouth();
    maps.push({
      name,
      image: obj.entry.image || (mapsByName[name] ? mapsByName[name].image : obj.entry.image),
      width: Math.round(w),
      height: Math.round(h),
      x: Math.round(b.getWest()),
      y: Math.round(b.getSouth()),
    });
  }
  mutableAtlas.maps = maps;
}

export function findOverlayByTarget(overlayIndex, target) {
  for (const { overlay } of overlayIndex.values()) {
    if (overlay._image === target) return overlay;
  }
  return null;
}

// Already implemented above

// Already implemented above

export function refreshLabelsOnly({ overlayIndex, markersLayer, toggleLabels, mapsByName, manifest, stashCurrentLayout, showSingleMap, findRelatedInteriors, showMapWithInteriors }) {
  if (!toggleLabels) return;
  const shouldShow = toggleLabels.checked;
  for (const [name, obj] of overlayIndex.entries()) {
    const hasLabel = !!obj.label;
    if (shouldShow && !hasLabel) {
      // Add label
      const b = obj.overlay.getBounds();
      const cx = (b.getWest() + b.getEast()) / 2;
      const cy = (b.getSouth() + b.getNorth()) / 2;
      const marker = L.marker([cy, cx], {
        icon: L.divIcon({ className: 'map-label', html: `<div class="map-label-text">${name}</div>`, iconSize: [200, 40] })
      });
      // Click to open map view if known
      const manifestMatch = mapsByName[name] || (manifest.maps ? manifest.maps.find(m => m.name === name) : null);
      if (manifestMatch) {
        marker.on('click', () => {
          if (typeof stashCurrentLayout === 'function') stashCurrentLayout();
          if (typeof showSingleMap === 'function') showSingleMap(manifestMatch);
        });
      }
      markersLayer.addLayer(marker);
      obj.label = marker;
    } else if (!shouldShow && hasLabel) {
      // Remove label
      markersLayer.removeLayer(obj.label);
      delete obj.label;
    } else if (shouldShow && hasLabel) {
      // Ensure label stays synced to overlay center
      const b = obj.overlay.getBounds();
      const cx = (b.getWest() + b.getEast()) / 2;
      const cy = (b.getSouth() + b.getNorth()) / 2;
      obj.label.setLatLng([cy, cx]);
    }
  }
}

export function snapOverlayToNeighbors(movedOverlay, overlayIndex, getOverlayPxBounds, setOverlayPxBounds, EDIT_SNAP) {
  const moved = getOverlayPxBounds(movedOverlay);
  const cornersMoved = [
    { x: moved.x, y: moved.y }, // SW
    { x: moved.x + moved.w, y: moved.y }, // SE
    { x: moved.x, y: moved.y + moved.h }, // NW
    { x: moved.x + moved.w, y: moved.y + moved.h }, // NE
  ];
  for (const { overlay } of overlayIndex.values()) {
    if (overlay === movedOverlay) continue;
    const b = getOverlayPxBounds(overlay);
    const cornersB = [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y },
      { x: b.x, y: b.y + b.h },
      { x: b.x + b.w, y: b.y + b.h },
    ];
    for (const cM of cornersMoved) {
      for (const cB of cornersB) {
        const dx = cB.x - cM.x;
        const dy = cB.y - cM.y;
        if (Math.abs(dx) <= EDIT_SNAP && Math.abs(dy) <= EDIT_SNAP) {
          // Apply snap by shifting overlay
          setOverlayPxBounds(movedOverlay, moved.x + dx, moved.y + dy, moved.w, moved.h);
          return; // single snap is enough
        }
      }
    }
  }
}

// Add event handlers for map drag, mouse, etc. as needed
// Map rendering and Leaflet logic
import { manifest, worldAtlas, mutableAtlas } from './state.js';

// Create and return a Leaflet map instance
export function createMap(container) {
  const map = L.map(container, {
    crs: L.CRS.Simple,
    minZoom: -5,
    maxZoom: 3,
    zoomSnap: 0.25,
  });
  // Layer groups for overlays and markers
  map._overlaysGroup = L.layerGroup().addTo(map);
  map._markersLayer = L.layerGroup().addTo(map);
  map._interiorMarkersLayer = L.layerGroup().addTo(map);
  // Indexes for overlays
  map._overlayIndex = new Map(); // name -> {entry, overlay}
  map._overlayToName = new Map(); // overlay -> name
  map._dragState = null; // {overlay, startLatLng, startBounds}
  return map;
}

// Render interior markers on the map
export function renderInteriorMarkers(map, placements) {
  // Remove existing markers if any
  if (map._interiorMarkersLayer) {
    map.removeLayer(map._interiorMarkersLayer);
  }
  const layer = L.layerGroup();
  if (Array.isArray(placements)) {
    placements.forEach(placement => {
      // Example: use a marker icon for each interior
      const marker = L.marker([placement.y, placement.x], {
        title: placement.name,
        icon: L.divIcon({
          className: 'interior-marker',
          html: `<span class="interior-marker-icon">🏠</span><span class="interior-marker-label">${placement.name}</span>`
        })
      });
      marker.addTo(layer);
    });
  }
  layer.addTo(map);
  map._interiorMarkersLayer = layer;
}

// Utility: get pixel bounds from overlay
export function getOverlayPxBounds(overlay) {
  // Implement as in app.js
  if (!overlay) return null;
  const bounds = overlay.getBounds();
  return {
    x: bounds.getWest(),
    y: bounds.getSouth(),
    w: bounds.getEast() - bounds.getWest(),
    h: bounds.getNorth() - bounds.getSouth(),
  };
}

// Utility: set overlay by px
export function setOverlayPxBounds(overlay, x, y, w, h) {
  if (!overlay) return;
  const southWest = L.latLng(y, x);
  const northEast = L.latLng(y + h, x + w);
  overlay.setBounds(L.latLngBounds(southWest, northEast));
}

// Add more map-related functions (render overlays, groups, drag, etc.) as needed
