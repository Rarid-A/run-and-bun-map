// Enhanced interactive Pokemon map with world stitching and interior navigation
// Features:
// - Stitched world map from outdoor locations
// - Clickable building/cave markers that navigate to interior maps
// - Breadcrumb navigation to return to world view

async function init() {
  const mapContainer = document.getElementById('map');
  const EDIT_SNAP = 8; // px corner snap tolerance
  
  // Helper: encode filename part so URLs with #, spaces, etc. load correctly
  function safeImageUrl(url) {
    try {
      const parts = url.split('/');
      const file = parts.pop();
      // Encode only the filename; keep directory slashes intact
      parts.push(encodeURIComponent(file));
      return parts.join('/');
    } catch (e) {
      return url;
    }
  }

  // Load manifest
  let manifest = null;
  if (typeof window.__MAPS_MANIFEST === 'object' && window.__MAPS_MANIFEST) {
    manifest = window.__MAPS_MANIFEST;
  } else {
    try {
      const res = await fetch('data/maps.json', { cache: 'no-cache' });
      if (res.ok) manifest = await res.json();
    } catch (e) {
      console.error('Could not load maps manifest', e);
    }
  }

  if (!manifest || !manifest.maps || !manifest.maps.length) {
    document.getElementById('info').innerHTML = '<p>No map data found. Please run the extraction pipeline.</p>';
    return;
  }

  // Optionally load precomputed world atlas layout (positions for stitched view)
  let worldAtlas = null;
  let worldAtlasSource = 'none'; // 'custom' if world-atlas (1).json, 'default' if world-atlas.json
  // Mutable copy of atlas used for live editing across view changes
  let mutableAtlas = null; // { unit, maps: [{name,image,width,height,x,y}] }
  try {
    // Always prefer user's custom file if present
    let res = await fetch('data/world-atlas (1).json', { cache: 'no-cache' });
    if (res.ok) {
      worldAtlas = await res.json();
      worldAtlasSource = 'custom';
    } else {
      res = await fetch('data/world-atlas.json', { cache: 'no-cache' });
      if (res.ok) {
        worldAtlas = await res.json();
        worldAtlasSource = 'default';
      }
    }
  } catch (e) {
    // optional: not fatal
  }
  if (!worldAtlas && typeof window.__WORLD_ATLAS === 'object' && window.__WORLD_ATLAS) {
    worldAtlas = window.__WORLD_ATLAS;
    worldAtlasSource = 'embedded';
  }


  // New classification: exterior if in worldAtlas, otherwise interior. If atlas is empty, all are exterior.
  const mapsByName = {};
  manifest.maps.forEach((m, idx) => {
    m.index = idx;
    mapsByName[m.name] = m;
  });

  // Build set of exterior map names from worldAtlas
  let exteriorNames = new Set();
  if (worldAtlas && Array.isArray(worldAtlas.maps) && worldAtlas.maps.length) {
    worldAtlas.maps.forEach(e => exteriorNames.add(e.name));
  }

  // If atlas is empty, treat all as exterior
  const allExterior = !exteriorNames.size;

  function isExterior(map) {
    if (allExterior) return true;
    return exteriorNames.has(map.name);
  }

  // For convenience
  const worldMaps = manifest.maps.filter(m => isExterior(m));
  const interiorMaps = manifest.maps.filter(m => !isExterior(m));

  console.log(`Found ${worldMaps.length} exterior maps and ${interiorMaps.length} interior maps (by atlas)`);

  // Create Leaflet map
  const map = L.map(mapContainer, {
    crs: L.CRS.Simple,
    minZoom: -5,
    maxZoom: 3,
    zoomSnap: 0.25,
  });

  let currentView = 'world';
  let currentMapData = null;
  let overlaysGroup = L.layerGroup().addTo(map);
  let markersLayer = L.layerGroup().addTo(map);
  let connectionLayer = L.layerGroup().addTo(map);
  let editEnabled = false;
  let dragState = null; // {overlay, startLatLng, startBounds}
  // Keep an index of overlays for edit/save/connect
  const overlayIndex = new Map(); // name -> {entry, overlay}
  const overlayToName = new Map(); // overlay -> name



  // UI elements
  const breadcrumb = document.getElementById('breadcrumb');
  const mapInfo = document.getElementById('current-map-info');
  const backBtn = document.getElementById('back-to-world');
  const worldBtn = document.getElementById('show-world-view');
  const toggleEdit = document.getElementById('toggle-edit');
  const toggleLines = document.getElementById('toggle-lines');
  const toggleLabels = document.getElementById('toggle-labels');
  const toggleIncludeInteriors = document.getElementById('toggle-include-interiors');
  const saveLayoutBtn = document.getElementById('save-layout');
  const howtoSection = document.getElementById('howto');
  const howtoToggle = document.getElementById('toggle-howto');

  // Try to load optional connections data
  let connectionsData = null;
  try {
    const res = await fetch('data/map-connections.json', { cache: 'no-cache' });
    if (res.ok) connectionsData = await res.json();
  } catch (_) {}

  // Show world view with stitched maps (exteriors only)
  function showWorldView() {
    currentView = 'world';
    currentMapData = null;
    overlaysGroup.clearLayers();
    markersLayer.clearLayers();

    breadcrumb.innerHTML = '<strong>World Map</strong>';
    mapInfo.textContent = worldAtlas && Array.isArray(worldAtlas.maps)
      ? `Using precomputed atlas layout for ${worldAtlas.maps.length} maps`
      : `Viewing ${worldMaps.length} world maps (grid layout)`;
    backBtn.style.display = 'none';

    overlayIndex.clear();
    connectionLayer.clearLayers();

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
          const manifestMatch = mapsByName[entry.name] || manifest.maps.find(m => m.name === entry.name);
          marker.on('click', () => {
            if (manifestMatch) {
              stashCurrentLayout();
              showSingleMap(manifestMatch);
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
            stashCurrentLayout();
            showSingleMap(m);
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
    if (toggleLines && toggleLines.checked) {
      drawConnections();
    }
  }

  // No-op: interior placement removed
  function handleOverlayClick(overlay, overlayName, e) {
    // No interior placement
  }

  // Enable/disable edit mode
  function setEditEnabled(enabled) {
    editEnabled = enabled;
    if (enabled) {
      map._container.classList.add('editing');
    } else {
      map._container.classList.remove('editing');
      dragState = null;
    }
  }

  // Persist current overlay positions into mutableAtlas (without downloading)
  function stashCurrentLayout() {
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
    mutableAtlas = { unit: 'px', maps };
  }

  // Hit-test overlays via DOM target
  function findOverlayByTarget(target) {
    for (const { overlay } of overlayIndex.values()) {
      if (overlay._image === target) return overlay;
    }
    return null;
  }

  // Utility: get pixel bounds from overlay
  function getOverlayPxBounds(overlay) {
    const b = overlay.getBounds();
    return { x: b.getWest(), y: b.getSouth(), w: b.getEast() - b.getWest(), h: b.getNorth() - b.getSouth() };
  }

  // Utility: set overlay by px
  function setOverlayPxBounds(overlay, x, y, w, h) {
    const southWest = L.latLng(y, x);
    const northEast = L.latLng(y + h, x + w);
    overlay.setBounds(L.latLngBounds(southWest, northEast));
  }

  // Refresh labels only based on current overlays and toggle state, preserving view
  function refreshLabelsOnly() {
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
        const manifestMatch = mapsByName[name] || manifest.maps.find(m => m.name === name);
        if (manifestMatch) {
          marker.on('click', () => {
            stashCurrentLayout();
            const related = findRelatedInteriors(manifestMatch.name);
            if (related.length > 0) showMapWithInteriors(manifestMatch, related); else showSingleMap(manifestMatch);
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

  // Snap moved overlay corners to neighbors within tolerance
  function snapOverlayToNeighbors(movedOverlay) {
    const moved = getOverlayPxBounds(movedOverlay);
    const cornersMoved = [
      { x: moved.x, y: moved.y }, // SW (leaflet CRS: y increases south)
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

  // Drag interactions over image overlays in edit mode
  map.on('mousedown', (e) => {
    if (!editEnabled || !e.originalEvent) return;
    const target = e.originalEvent.target;
    const overlay = findOverlayByTarget(target);
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
    const dx = e.latlng.lng - dragState.startLatLng.lng; // CRS Simple: lng = x, lat = y
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
    if (toggleLines && toggleLines.checked) drawConnections();
  });

  map.on('mouseup', () => {
    if (!dragState) return;
    // Snap corners on release
    snapOverlayToNeighbors(dragState.overlay);
    // Persist after snapping so leaving the view keeps positions
    stashCurrentLayout();
    dragState = null;
    map.dragging.enable();
    if (toggleLines && toggleLines.checked) drawConnections();
  });

  // Draw connection lines between world map centers using connections data
  function drawConnections() {
    connectionLayer.clearLayers();
    if (!connectionsData || !connectionsData.worldLayout || !Array.isArray(connectionsData.worldLayout.maps)) return;

    // Build center map by name from current overlays
    const centers = new Map();
    for (const [name, obj] of overlayIndex.entries()) {
      const b = obj.overlay.getBounds();
      const cx = (b.getWest() + b.getEast()) / 2;
      const cy = (b.getSouth() + b.getNorth()) / 2;
      centers.set(name, [cy, cx]);
    }

    // connectionsData.worldLayout.maps can be an array of strings or objects;
    // support common shapes: { name, connections: [ ... ] } or { name, neighbors: [ ... ] }
    connectionsData.worldLayout.maps.forEach(m => {
      const srcName = (m && (m.name || m.worldMap)) || m;
      if (!srcName) return;

      const srcCenter = centers.get(srcName);
      if (!srcCenter) return;

      // Determine target list with multiple possible field names
      let targets = null;
      if (m && Array.isArray(m.connections)) targets = m.connections;
      else if (m && Array.isArray(m.neighbors)) targets = m.neighbors;
      else if (m && Array.isArray(m.links)) targets = m.links;
      else if (m && Array.isArray(m.targets)) targets = m.targets;
      else if (m && m.to) targets = Array.isArray(m.to) ? m.to : [m.to];

      if (!targets) return;

      targets.forEach(t => {
        const dstName = (t && (t.name || t.worldMap)) || t;
        if (!dstName) return;
        const dstCenter = centers.get(dstName);
        if (!dstCenter) return;
        // Draw simple polyline between centers
        L.polyline([srcCenter, dstCenter], { color: '#0077cc', weight: 2, opacity: 0.7, interactive: false }).addTo(connectionLayer);
      });
    });
  }

  // Show a single map (exterior or interior, but no interior navigation)
  function showSingleMap(mapData) {
    currentView = 'single';
    currentMapData = mapData;
    overlaysGroup.clearLayers();
    markersLayer.clearLayers();
    breadcrumb.innerHTML = `<strong>${mapData.name}</strong>`;
    mapInfo.textContent = `${mapData.width}×${mapData.height}px`;
    backBtn.style.display = 'none';
    const w = mapData.width;
    const h = mapData.height;
    const bounds = [[0, 0], [h, w]];
    const overlay = L.imageOverlay(safeImageUrl(mapData.image), bounds);
    overlaysGroup.addLayer(overlay);
    map.fitBounds(bounds);
  }

  // Global navigation function
  window.navigateToInterior = function(mapIndex) {
    const mapData = manifest.maps[mapIndex];
    if (mapData) {
      showSingleMap(mapData);
    }
  };

  // Back button
  backBtn.addEventListener('click', () => {
    showWorldView();
  });

  // World view button
  worldBtn.addEventListener('click', () => {
    showWorldView();
  });



  // Save layout: downloads world-atlas.json and a PNG mosaic (if possible)
  async function saveLayout() {
    if (!worldAtlas) worldAtlas = { unit: 'px', maps: [] };
    worldAtlas.maps = [];
    // Read current overlay positions into atlas (all overlays are exteriors)
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
    // Download JSON
    const blob = new Blob([JSON.stringify(worldAtlas, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (worldAtlasSource === 'custom') ? 'world-atlas (1).json' : 'world-atlas.json';
    a.click();
    URL.revokeObjectURL(a.href);
    // Try to export mosaic PNG
    try {
      const { canvas, url } = await renderMosaicCanvas(worldAtlas.maps);
      const a2 = document.createElement('a');
      a2.href = url;
      a2.download = 'world_atlas_debug.png';
      a2.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('PNG export failed (likely due to CORS when using file://). JSON still saved.', e);
    }
  }

  async function renderMosaicCanvas(entries) {
    // Compute canvas size
    let maxX = 0, maxY = 0;
    for (const e of entries) {
      maxX = Math.max(maxX, e.x + e.width);
      maxY = Math.max(maxY, e.y + e.height);
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, maxX);
    canvas.height = Math.max(1, maxY);
    const ctx = canvas.getContext('2d');
    // Draw each image
    for (const e of entries) {
      const img = await loadImage(safeImageUrl(e.image));
      ctx.drawImage(img, e.x, e.y);
    }
    const url = canvas.toDataURL('image/png');
    return { canvas, url };
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Wire toggles/buttons
  if (toggleEdit) toggleEdit.addEventListener('change', () => setEditEnabled(toggleEdit.checked));
  if (toggleLines) toggleLines.addEventListener('change', () => {
    if (toggleLines.checked) drawConnections(); else connectionLayer.clearLayers();
  });
  if (toggleLabels) toggleLabels.addEventListener('change', () => {
    // Toggle labels without resetting view or re-rendering overlays
    refreshLabelsOnly();
  });
  if (toggleIncludeInteriors) toggleIncludeInteriors.addEventListener('change', () => {
    showWorldView();
  });
  if (saveLayoutBtn) saveLayoutBtn.addEventListener('click', saveLayout);

  // How-to toggle wiring with persistence
  function updateHowtoToggle() {
    if (!howtoSection || !howtoToggle) return;
    const collapsed = howtoSection.classList.contains('collapsed');
    howtoToggle.textContent = collapsed ? '▸' : '▾';
  }
  if (howtoSection && howtoToggle) {
    // Restore persisted state
    try {
      const persisted = localStorage.getItem('howtoCollapsed');
      if (persisted === '1') howtoSection.classList.add('collapsed');
    } catch (_) {}
    updateHowtoToggle();
    howtoToggle.addEventListener('click', () => {
      howtoSection.classList.toggle('collapsed');
      updateHowtoToggle();
      try { localStorage.setItem('howtoCollapsed', howtoSection.classList.contains('collapsed') ? '1' : '0'); } catch (_) {}
    });
  }

  // Initial render
  showWorldView();
}

window.addEventListener('load', init);
