// Enhanced interactive Pokemon map with world stitching and interior navigation
// Features:
// - Stitched world map from outdoor locations
// - Clickable building/cave markers that navigate to interior maps
// - Breadcrumb navigation to return to world view

async function init() {
  const mapContainer = document.getElementById('map');
  
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
  if (typeof window.__WORLD_ATLAS === 'object' && window.__WORLD_ATLAS) {
    worldAtlas = window.__WORLD_ATLAS;
  } else {
    try {
      const res = await fetch('data/world-atlas.json', { cache: 'no-cache' });
      if (res.ok) {
        worldAtlas = await res.json();
      }
    } catch (e) {
      // optional: not fatal
    }
  }

  // Categorize maps into world maps and interior maps
  const worldMaps = [];
  const interiorMaps = [];
  const mapsByName = {};
  
  manifest.maps.forEach((m, idx) => {
    m.index = idx;
    mapsByName[m.name] = m;
    
    // Classify as world or interior based on name patterns
    const name = m.name.toLowerCase();
    const isInterior = 
      name.includes('house') || name.includes('gym') || name.includes('center') ||
      name.includes('mart') || name.includes('cave') || name.includes('room') ||
      name.includes('tower') || name.includes('hideout') || name.includes('museum') ||
      name.includes('shop') || name.includes('lab') || name.includes('dept') ||
      name.includes('1f') || name.includes('2f') || name.includes('b1f') ||
      name.includes('interior') || name.includes('inside') || name.includes('lobby') ||
      name.includes('corridor') || name.includes('deck') || name.includes('entrance');
    
    if (isInterior) {
      interiorMaps.push(m);
    } else {
      worldMaps.push(m);
    }
  });

  console.log(`Found ${worldMaps.length} world maps and ${interiorMaps.length} interior maps`);

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

  // UI elements
  const breadcrumb = document.getElementById('breadcrumb');
  const mapInfo = document.getElementById('current-map-info');
  const backBtn = document.getElementById('back-to-world');
  const worldBtn = document.getElementById('show-world-view');
  const interiorsList = document.getElementById('interiors-list');

  // Show world view with stitched maps
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

    if (worldAtlas && Array.isArray(worldAtlas.maps) && worldAtlas.maps.length) {
      // Use atlas positions
      let maxX = 0, maxY = 0;
      worldAtlas.maps.forEach(entry => {
        const w = entry.width, h = entry.height;
        const bounds = [[entry.y, entry.x], [entry.y + h, entry.x + w]];
        const overlay = L.imageOverlay(safeImageUrl(entry.image), bounds, { opacity: 0.95 });
        overlaysGroup.addLayer(overlay);

        const marker = L.marker([entry.y + h/2, entry.x + w/2], {
          icon: L.divIcon({ className: 'map-label', html: `<div class="map-label-text">${entry.name}</div>`, iconSize: [200, 40] })
        });
        // Try to map atlas entry back to manifest map by name
        const manifestMatch = mapsByName[entry.name] || manifest.maps.find(m => m.name === entry.name);
        marker.on('click', () => {
          if (manifestMatch) {
            const related = findRelatedInteriors(manifestMatch.name);
            if (related.length > 0) showMapWithInteriors(manifestMatch, related); else showSingleMap(manifestMatch);
          }
        });
        markersLayer.addLayer(marker);
        maxX = Math.max(maxX, entry.x + w);
        maxY = Math.max(maxY, entry.y + h);
      });
      map.fitBounds([[0, 0], [maxY, maxX]]);
    } else {
      // Simple grid layout for world maps
      let offsetX = 0;
      let offsetY = 0;
      let maxHeight = 0;
      const padding = 50;

      worldMaps.forEach((m, idx) => {
        const w = m.width || 640;
        const h = m.height || 640;
        
        // Arrange in grid (4 per row)
        if (idx > 0 && idx % 4 === 0) {
          offsetY += maxHeight + padding;
          offsetX = 0;
          maxHeight = 0;
        }

        const bounds = [[offsetY, offsetX], [offsetY + h, offsetX + w]];
        const overlay = L.imageOverlay(safeImageUrl(m.image), bounds, { opacity: 0.9 });
        overlaysGroup.addLayer(overlay);

        // Add label
        const centerY = offsetY + h / 2;
        const centerX = offsetX + w / 2;
        const marker = L.marker([centerY, centerX], {
          icon: L.divIcon({ className: 'map-label', html: `<div class="map-label-text">${m.name}</div>`, iconSize: [200, 40] })
        });
        marker.on('click', () => {
          const related = findRelatedInteriors(m.name);
          if (related.length > 0) showMapWithInteriors(m, related); else showSingleMap(m);
        });
        markersLayer.addLayer(marker);

        offsetX += w + padding;
        maxHeight = Math.max(maxHeight, h);
      });

      // Fit to show all maps
      map.fitBounds([[0, 0], [offsetY + maxHeight, offsetX]]);
    }
  }

  // Find interior maps related to a world map
  function findRelatedInteriors(worldMapName) {
    const related = [];
    const baseName = worldMapName.split(/\s+(Route|City|Town)/)[0];
    
    interiorMaps.forEach(interior => {
      if (interior.name.includes(baseName)) {
        related.push(interior);
      }
    });
    
    return related;
  }

  // Show a single world map with clickable interior markers
  function showMapWithInteriors(worldMap, interiors) {
    currentView = 'map-with-interiors';
    currentMapData = worldMap;
    overlaysGroup.clearLayers();
    markersLayer.clearLayers();

    breadcrumb.innerHTML = `<a href="#" id="nav-world">World Map</a> &gt; <strong>${worldMap.name}</strong>`;
    mapInfo.textContent = `${interiors.length} interiors available`;
    backBtn.style.display = 'inline-block';

    const w = worldMap.width;
    const h = worldMap.height;
    const bounds = [[0, 0], [h, w]];
    
  const overlay = L.imageOverlay(safeImageUrl(worldMap.image), bounds);
    overlaysGroup.addLayer(overlay);
    map.fitBounds(bounds);

    // Add markers for each interior (evenly distributed)
    interiors.forEach((interior, idx) => {
      const markerX = w * 0.2 + (idx % 3) * (w * 0.3);
      const markerY = h * 0.2 + Math.floor(idx / 3) * (h * 0.3);
      
      const marker = L.marker([markerY, markerX], {
        icon: L.divIcon({
          className: 'interior-marker',
          html: '🏠',
          iconSize: [30, 30]
        })
      });
      
      const popupContent = `<strong>${interior.name}</strong><br><button onclick="window.navigateToInterior(${interior.index})">Enter</button>`;
      marker.bindPopup(popupContent);
      markersLayer.addLayer(marker);
    });

    document.getElementById('nav-world').addEventListener('click', (e) => {
      e.preventDefault();
      showWorldView();
    });
  }

  // Show a single map (world or interior)
  function showSingleMap(mapData) {
    currentView = 'single';
    currentMapData = mapData;
    overlaysGroup.clearLayers();
    markersLayer.clearLayers();

    const isInterior = interiorMaps.includes(mapData);
    breadcrumb.innerHTML = isInterior 
      ? `<a href="#" id="nav-world">World Map</a> &gt; <strong>${mapData.name}</strong>`
      : `<strong>${mapData.name}</strong>`;
    mapInfo.textContent = `${mapData.width}×${mapData.height}px`;
    backBtn.style.display = isInterior ? 'inline-block' : 'none';

    const w = mapData.width;
    const h = mapData.height;
    const bounds = [[0, 0], [h, w]];
    
  const overlay = L.imageOverlay(safeImageUrl(mapData.image), bounds);
    overlaysGroup.addLayer(overlay);
    map.fitBounds(bounds);

    if (isInterior) {
      const navWorld = document.getElementById('nav-world');
      if (navWorld) {
        navWorld.addEventListener('click', (e) => {
          e.preventDefault();
          showWorldView();
        });
      }
    }
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

  // Populate interiors list
  interiorsList.innerHTML = '';
  interiorMaps.slice(0, 50).forEach(m => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="#" data-map-idx="${m.index}">${m.name}</a>`;
    li.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      showSingleMap(m);
    });
    interiorsList.appendChild(li);
  });
  if (interiorMaps.length > 50) {
    const li = document.createElement('li');
    li.textContent = `... and ${interiorMaps.length - 50} more`;
    interiorsList.appendChild(li);
  }

  // Initialize with world view
  showWorldView();
}

window.addEventListener('load', init);
