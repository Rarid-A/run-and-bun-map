// --- Overlay Drag/Edit/Snap Logic ---
// Sets up drag/edit/snap handlers for overlays on the map
export function setupOverlayEditHandlers({
  map,
  overlayIndex,
  overlayToName,
  setOverlayPxBounds,
  getOverlayPxBounds,
  snapOverlayToNeighbors,
  stashCurrentLayout
}) {
  let dragState = null;

  function onDocumentMouseUp() {
    if (dragState) {
      dragState = null;
      map.dragging.enable();
      if (typeof stashCurrentLayout === 'function') stashCurrentLayout();
    }
    document.removeEventListener('mouseup', onDocumentMouseUp);
  }

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
    // Ensure mouseup even if the pointer leaves the map
    document.addEventListener('mouseup', onDocumentMouseUp);
  });

  map.on('mousemove', (e) => {
    if (!dragState) return;
    const { overlay, startLatLng, startBounds } = dragState;
    const dx = e.latlng.lng - startLatLng.lng;
    const dy = e.latlng.lat - startLatLng.lat;
    const newBounds = L.latLngBounds(
      [startBounds.getSouth() + dy, startBounds.getWest() + dx],
      [startBounds.getNorth() + dy, startBounds.getEast() + dx]
    );
    overlay.setBounds(newBounds);
    if (typeof snapOverlayToNeighbors === 'function') {
      snapOverlayToNeighbors(overlay, overlayIndex, getOverlayPxBounds, setOverlayPxBounds, 8);
    }
  });
} // close setupOverlayEditHandlers

// End of setupOverlayEditHandlers

// --- Group Layout Drag/Edit Logic ---
// Sets up drag handlers for editing group layouts
function setupGroupEditHandlers(map, group) {
  let dragState = null;

  function onDocumentMouseUp() {
    if (dragState) {
      dragState = null;
      map.dragging.enable();
    }
    document.removeEventListener('mouseup', onDocumentMouseUp);
  }

  // Remove old handlers if they exist
  if (map._groupEditHandlers) {
    map.off('mousedown', map._groupEditHandlers.mousedown);
    map.off('mousemove', map._groupEditHandlers.mousemove);
  }

  const mousedownHandler = (e) => {
    if (!map._container.classList.contains('editing') || !e.originalEvent) return;
    const target = e.originalEvent.target;
    
    // Find which overlay was clicked
    let clickedOverlay = null;
    map._overlaysGroup.eachLayer((layer) => {
      if (layer instanceof L.ImageOverlay && layer.getElement() === target) {
        clickedOverlay = layer;
      }
    });
    
    if (!clickedOverlay || !clickedOverlay._mapData || !clickedOverlay._groupName) return;
    
    map.dragging.disable();
    dragState = {
      overlay: clickedOverlay,
      mapData: clickedOverlay._mapData,
      groupName: clickedOverlay._groupName,
      startLatLng: e.latlng,
      startBounds: clickedOverlay.getBounds(),
    };
    document.addEventListener('mouseup', onDocumentMouseUp);
  };

  const mousemoveHandler = (e) => {
    if (!dragState) return;
    const { overlay, mapData, groupName, startLatLng, startBounds } = dragState;
    const dx = e.latlng.lng - startLatLng.lng;
    const dy = e.latlng.lat - startLatLng.lat;
    const newBounds = L.latLngBounds(
      [startBounds.getSouth() + dy, startBounds.getWest() + dx],
      [startBounds.getNorth() + dy, startBounds.getEast() + dx]
    );
    overlay.setBounds(newBounds);
    
    // Update stored layout
    if (map._groupLayouts && map._groupLayouts[groupName]) {
      map._groupLayouts[groupName][mapData.name] = {
        offsetX: newBounds.getWest(),
        offsetY: newBounds.getSouth()
      };
    }
  };

  map.on('mousedown', mousedownHandler);
  map.on('mousemove', mousemoveHandler);
  
  // Store handlers for cleanup
  map._groupEditHandlers = {
    mousedown: mousedownHandler,
    mousemove: mousemoveHandler
  };
}

// Exports a function to save the current atlas layout as JSON and PNG
export async function saveLayout({
  worldAtlas,
  worldAtlasSource,
  overlayIndex,
  mapsByName,
  map
}) {
  if (!worldAtlas) worldAtlas = { unit: 'px', maps: [] };
  worldAtlas.maps = [];
  for (const [name, obj] of overlayIndex.entries()) {
    const b = obj.overlay.getBounds();
    const w = b.getEast() - b.getWest();
    const h = b.getNorth() - b.getSouth();
    worldAtlas.maps.push({
      name,
      image: obj.entry.image || (mapsByName[name] ? mapsByName[name].image : obj.entry.image),
      width: Math.round(w),
      height: Math.round(h),
      x: Math.round(b.getWest()),
      y: Math.round(b.getSouth()),
    });
  }
  
  // Save group layouts if they exist
  if (map && map._groupLayouts) {
    worldAtlas.groupLayouts = map._groupLayouts;
  }
  
  // Download JSON
  const blob = new Blob([JSON.stringify(worldAtlas, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (worldAtlasSource === 'custom') ? 'world-atlas (1).json' : 'world-atlas.json';
  a.click();
  URL.revokeObjectURL(a.href);
}


// --- Interior Marker Placement and Rendering ---
// Renders interior markers on the map and handles placement
export function renderInteriorMarkers({
  map,
  interiorPlacements,
  showInteriorsToggle,
  currentView,
  currentMapData,
  worldAtlas,
  manifest,
  interiorGroups,
  showSingleMap,
  currentGroup
}) {
  // Remove all existing interior markers
  if (!map._interiorMarkersLayer) return;
  map._interiorMarkersLayer.clearLayers();
  if (!showInteriorsToggle || !showInteriorsToggle.checked) return;

  for (const placement of interiorPlacements) {
    let show = false;
    let markerX = placement.x;
    let markerY = placement.y;

    if (currentView === 'world') {
      // World view: show only world-placed markers
      show = !placement.parent;
    } else if (currentView === 'single' && currentMapData) {
      // Single map view: show only markers for this map
      if (placement.parent === currentMapData.name) {
        show = true;
        // Use local coordinates as-is
        markerX = placement.x;
        markerY = placement.y;
      } else if (!placement.parent && worldAtlas && Array.isArray(worldAtlas.maps)) {
        // World marker: check if it falls within this map's atlas bounds
        const atlasEntry = worldAtlas.maps.find(e => e.name === currentMapData.name);
        if (atlasEntry) {
          // Only show if the marker is within the bounds of this map in the world atlas
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
    } else if (currentView === 'group' && currentGroup) {
      // Group view: only show markers that lead to maps OUTSIDE the group
      // Check if the marker's parent is in the group
      if (placement.parent && currentGroup.members.includes(placement.parent)) {
        // Marker's parent map is in the group - check if the target is also in the group
        const targetMap = manifest.maps.find(m => m.name === placement.name);
        if (targetMap) {
          const targetGroup = interiorGroups.find(g => g.members.includes(targetMap.name));
          // Only show if target is NOT in the same group
          if (!targetGroup || targetGroup.name !== currentGroup.name) {
            show = true;
            // Adjust coordinates to parent map's position in group layout
            if (map._groupLayouts && map._groupLayouts[currentGroup.name] && map._groupLayouts[currentGroup.name][placement.parent]) {
              const parentLayout = map._groupLayouts[currentGroup.name][placement.parent];
              markerX = parentLayout.offsetX + placement.x;
              markerY = parentLayout.offsetY + placement.y;
            }
          }
        }
      }
      // Don't show exterior markers (no parent) in group view
    }

    if (!show) continue;
    // Only show markers for the current map
    const m = manifest.maps.find(x => x.name === placement.name);
    if (!m) continue;
    const group = interiorGroups.find(g => g.members.includes(placement.name));
    let iconHtml = '';
    switch (placement.icon) {
      case 'cave': iconHtml = '⛰️'; break;
      case 'stairs': iconHtml = '⬆️'; break;
      case 'dive': iconHtml = '🌊'; break;
      case 'generic': iconHtml = '⭐'; break;
      default: iconHtml = '🚪';
    }
    // Defensive: only add marker if coordinates are within the map bounds
    if (currentView === 'single' && currentMapData) {
      if (
        markerX < 0 || markerY < 0 ||
        markerX > currentMapData.width || markerY > currentMapData.height
      ) {
        continue;
      }
    }
    const marker = L.marker([markerY, markerX], {
      icon: L.divIcon({ className: 'interior-marker', html: `<div class=\"interior-marker-icon\">${iconHtml}</div>`, iconSize: [32, 32] })
    });
    marker.on('click', () => {
      showSingleMap(m);
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

// Setup map click handler for placing interiors
export function setupInteriorPlacement({
  map,
  editInteriorsToggle,
  selectedInteriorForPlacement,
  currentView,
  currentMapData,
  worldAtlas,
  interiorPlacements,
  renderInteriorMarkers
}) {
  map.on('click', (e) => {
    if (editInteriorsToggle && editInteriorsToggle.checked && selectedInteriorForPlacement.value) {
      let parent = null;
      let markerX = e.latlng.lng;
      let markerY = e.latlng.lat;
      if (currentView.value === 'single' && currentMapData.value) {
        parent = currentMapData.value.name;
        if (worldAtlas && Array.isArray(worldAtlas.maps)) {
          const atlasEntry = worldAtlas.maps.find(entry => entry.name === currentMapData.value.name);
          if (atlasEntry) {
            markerX = e.latlng.lng + atlasEntry.x;
            markerY = e.latlng.lat + atlasEntry.y;
            parent = null;
          }
        }
      }
      const m = selectedInteriorForPlacement.value;
      interiorPlacements.push({
        name: m.name,
        x: markerX,
        y: markerY,
        parent: parent,
        icon: m.icon || 'door'
      });
      selectedInteriorForPlacement.value = null;
      renderInteriorMarkers();
    }
  });
}
// Add map drag/edit event handlers (modularized from app.js)
function wireMapEditEvents(map, overlayIndex, overlayToName, setOverlayPxBounds, getOverlayPxBounds, snapOverlayToNeighbors, stashCurrentLayout) {
  let dragState = null;
  map.on('mousedown', (e) => {
    if (!map._container.classList.contains('editing') || !e.originalEvent) return;
    const target = e.originalEvent.target;
    const overlay = findOverlayByTarget(overlayIndex, target);
    if (!overlay) return;
    map.dragging.disable();
    dragState = {
      // dragState fields here
    };
  });
}

// Use global access for getGroupForMap, getGroupByName (attached to window.state)
// ...existing code...
// --- Overlay, marker, and navigation logic from app.js ---
import { safeImageUrl } from './utils.js';
import { mapsByName, currentType } from './state.js';

let overlaysGroup, markersLayer, overlayIndex, overlayToName;

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
  backBtn,
  showSingleMap
}) {

  // Use the map's own overlay groups and indexes
  overlaysGroup = map._overlaysGroup;
  markersLayer = map._markersLayer;
  overlayIndex = map._overlayIndex;
  overlayToName = map._overlayToName;
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
        // Label click navigates to correct map and stashes layout (old logic)
        const manifestObj = manifest.maps.find(m => m.name === entry.name);
        marker.on('click', () => {
          if (manifestObj && typeof showSingleMap === 'function') {
            showSingleMap(manifestObj);
          }
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
        marker.on('click', () => {
          if (typeof showSingleMap === 'function') {
            // Update current view and map data before showing the single map
            currentView.value = 'single';
            currentMapData.value = m;
            console.log('Switching to single map view:', currentMapData.value);
            showSingleMap(m);
          }
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
          marker.on('click', () => {
            if (typeof showSingleMap === 'function') showSingleMap(m);
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
          if (typeof showSingleMap === 'function') showSingleMap(m);
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
          marker.on('click', () => {
            if (typeof showSingleMap === 'function') showSingleMap(m);
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

export function showGroupView({
  map,
  group,
  manifest,
  overlaysGroup,
  markersLayer,
  setBreadcrumb,
  setMapInfo,
  backBtn,
  renderInteriorMarkers,
  showSingleMap,
  worldAtlas
}) {
  // Use map's attached layer groups if not provided
  overlaysGroup = overlaysGroup || map._overlaysGroup;
  markersLayer = markersLayer || map._markersLayer;
  // Remove any lingering tooltips
  document.querySelectorAll('.interior-tooltip').forEach(el => el.remove());
  // Set view state
  overlaysGroup.clearLayers();
  markersLayer.clearLayers();
  if (map._interiorMarkersLayer) map._interiorMarkersLayer.clearLayers();
  
  setBreadcrumb(`<strong>Group: ${group.name}</strong>`);
  setMapInfo(`${group.members.length} maps in group`);
  if (backBtn) backBtn.style.display = 'none';
  
  // Layout maps in a grid
  const maps = group.members.map(name => manifest.maps.find(m => m.name === name)).filter(Boolean);
  if (maps.length === 0) return;
  
  // Calculate grid layout (try to make it roughly square)
  const cols = Math.ceil(Math.sqrt(maps.length));
  const rows = Math.ceil(maps.length / cols);
  
  // Find the maximum dimensions for consistent sizing
  const maxW = Math.max(...maps.map(m => m.width));
  const maxH = Math.max(...maps.map(m => m.height));
  const padding = 0; // pixels between maps (0 for border-to-border)
  
  // Store group layout metadata on the map for editing
  if (!map._groupLayouts) map._groupLayouts = {};
  
  // Load saved layout from worldAtlas if available
  if (worldAtlas && worldAtlas.groupLayouts && worldAtlas.groupLayouts[group.name]) {
    map._groupLayouts[group.name] = JSON.parse(JSON.stringify(worldAtlas.groupLayouts[group.name]));
  } else if (!map._groupLayouts[group.name]) {
    // Initialize default layout
    map._groupLayouts[group.name] = {};
    maps.forEach((mapData, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      map._groupLayouts[group.name][mapData.name] = {
        offsetX: col * (maxW + padding),
        offsetY: row * (maxH + padding)
      };
    });
  }
  
  let allBounds = [];
  maps.forEach((mapData, idx) => {
    const layout = map._groupLayouts[group.name][mapData.name];
    
    // If layout is missing, generate a default grid position
    let offsetX, offsetY;
    if (layout) {
      offsetX = layout.offsetX;
      offsetY = layout.offsetY;
    } else {
      // Fallback: generate grid position
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      offsetX = col * (maxW + padding);
      offsetY = row * (maxH + padding);
      
      // Store the generated layout
      map._groupLayouts[group.name][mapData.name] = { offsetX, offsetY };
    }
    
    const w = mapData.width;
    const h = mapData.height;
    const bounds = [[offsetY, offsetX], [offsetY + h, offsetX + w]];
    allBounds.push(bounds);
    
    const overlay = L.imageOverlay(safeImageUrl(mapData.image), bounds, {
      interactive: true
    });
    
    // Store reference for drag editing
    overlay._mapData = mapData;
    overlay._groupName = group.name;
    
    overlaysGroup.addLayer(overlay);
  });
  
  // Fit bounds to show all maps
  if (allBounds.length > 0) {
    const minLat = Math.min(...allBounds.map(b => b[0][0]));
    const minLng = Math.min(...allBounds.map(b => b[0][1]));
    const maxLat = Math.max(...allBounds.map(b => b[1][0]));
    const maxLng = Math.max(...allBounds.map(b => b[1][1]));
    map.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [50, 50] });
  }
  
  // Show interior markers for this group (handled by renderInteriorMarkers)
  if (typeof renderInteriorMarkers === 'function') renderInteriorMarkers();
  
  // Setup drag handlers for group editing
  setupGroupEditHandlers(map, group);
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
  // Use map's attached layer groups if not provided
  overlaysGroup = overlaysGroup || map._overlaysGroup;
  markersLayer = markersLayer || map._markersLayer;
  // Remove any lingering tooltips
  document.querySelectorAll('.interior-tooltip').forEach(el => el.remove());
  // Set view state
  overlaysGroup.clearLayers();
  markersLayer.clearLayers();
  if (map._interiorMarkersLayer) map._interiorMarkersLayer.clearLayers();
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

// ...existing code...

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
// ...existing code...

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
