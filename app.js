
// ---
// Interior Placement & Grouping Data Structure (for manual placement and grouping of interiors)
//
// Add this to world-atlas.json or a new file (e.g., interior-placements.json):
//
// {
//   "unit": "px",
//   "maps": [...], // existing exteriors
//   "interiorPlacements": [
//     {
//       "name": "Petalburg Gym", // map name (must match manifest)
//       "x": 1234,                // x position on world map
//       "y": 567,                 // y position on world map
//       "group": "Gyms"          // (optional) group name
//     },
//     {
//       "name": "Underwater 1",
//       "x": 2000,
//       "y": 800,
//       "group": "Underwater"
//     }
//     // ...
//   ],
//   "groups": [
//     {
//       "name": "Underwater",
//       "members": ["Underwater 1", "Underwater 2", ...]
//     },
//     {
//       "name": "Mt. Pyre",
//       "members": ["Mt. Pyre 1F", "Mt. Pyre 2F", ...]
//     }
//   ]
// }
//
// - Each interior placement has a name (matching the map), x/y position, and optional group.
// - Groups are named collections of interiors for joint placement or highlighting.
// ---
// Enhanced interactive Pokemon map with world stitching and interior navigation
// Features:
// - Stitched world map from outdoor locations
// - Clickable building/cave markers that navigate to interior maps
// - Breadcrumb navigation to return to world view

async function init() {
  // --- Group Management UI Logic ---
  function renderGroupList() {
    groupListDiv.innerHTML = '';
    // List all groups
    interiorGroups.forEach((group, idx) => {
      const groupDiv = document.createElement('div');
      groupDiv.style.marginBottom = '0.5em';
      groupDiv.innerHTML = `<strong>${group.name}</strong> <button data-idx="${idx}" class="remove-group">Remove</button>`;
      // List members
      const members = document.createElement('ul');
      group.members.forEach((m, mIdx) => {
        const li = document.createElement('li');
        li.textContent = m;
        const rmBtn = document.createElement('button');
        rmBtn.textContent = 'Remove';
        rmBtn.onclick = () => {
          group.members.splice(mIdx, 1);
          renderGroupList();
        };
        li.appendChild(rmBtn);
        members.appendChild(li);
      });
      groupDiv.appendChild(members);
      // Add member dropdown
      const addDiv = document.createElement('div');
      const select = document.createElement('select');
      select.innerHTML = '<option value="">Add interior...</option>' +
        interiorMaps.filter(im => !group.members.includes(im.name)).map(im => `<option value="${im.name}">${im.name}</option>`).join('');
      addDiv.appendChild(select);
      const addBtn = document.createElement('button');
      addBtn.textContent = 'Add';
      addBtn.onclick = () => {
        if (select.value) {
          group.members.push(select.value);
          renderGroupList();
        }
      };
      addDiv.appendChild(addBtn);
      groupDiv.appendChild(addDiv);
      groupListDiv.appendChild(groupDiv);
    });
    // Add new group
    const newDiv = document.createElement('div');
    const nameInput = document.createElement('input');
    nameInput.placeholder = 'New group name';
    newDiv.appendChild(nameInput);
    const createBtn = document.createElement('button');
    createBtn.textContent = 'Create Group';
    createBtn.onclick = () => {
      const name = nameInput.value.trim();
      if (name && !interiorGroups.some(g => g.name === name)) {
        interiorGroups.push({ name, members: [] });
        renderGroupList();
      }
    };
    newDiv.appendChild(createBtn);
    groupListDiv.appendChild(newDiv);
    // Remove group buttons
    groupListDiv.querySelectorAll('.remove-group').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (!isNaN(idx)) {
          interiorGroups.splice(idx, 1);
          renderGroupList();
        }
      };
    });
  }

  // --- Interior Placement State ---
  // Holds placements before saving
  // Each placement: { name, x, y, parent, icon } where parent is the map name (null for world)
  // Multiple placements per interior/parent allowed
  let interiorPlacements = [];
  let selectedInteriorForPlacement = null;
  let interiorGroups = [];

  // Checkbox to include world maps in search list
  const searchAllImages = document.getElementById('search-all-images');

  // Add search bar support for interiors/world maps (must be declared before use)
  const interiorSearch = document.getElementById('interior-search');

  // Use the existing #interiors-list element for search results/list of maps
  const searchList = document.getElementById('interiors-list');

  // New UI controls for interiors
  const editInteriorsToggle = document.getElementById('edit-interiors');
  const showInteriorsToggle = document.getElementById('show-interiors');
  const manageGroupsBtn = document.getElementById('manage-groups');
  const groupModal = document.getElementById('group-modal');
  const closeGroupModalBtn = document.getElementById('close-group-modal');
  const groupListDiv = document.getElementById('group-list');

  // Show group modal: render group list (moved here after DOM assignments)
  if (manageGroupsBtn && groupModal) {
    manageGroupsBtn.addEventListener('click', () => {
      renderGroupList();
    });
  }

  // Wire up group modal open/close
  if (manageGroupsBtn && groupModal) {
    manageGroupsBtn.addEventListener('click', () => {
      groupModal.style.display = 'block';
    });
  }
  if (closeGroupModalBtn && groupModal) {
    closeGroupModalBtn.addEventListener('click', () => {
      groupModal.style.display = 'none';
    });
  }

  // Wire up edit/show interiors toggles (logic to be implemented in next steps)
  if (editInteriorsToggle) {
    editInteriorsToggle.addEventListener('change', () => {
      // Re-render search list to show/hide 'Place' buttons
      renderSearchList(interiorSearch ? interiorSearch.value : '');
      // Optionally, visually indicate edit mode
      if (editInteriorsToggle.checked) {
        map._container.classList.add('editing-interiors');
      } else {
        map._container.classList.remove('editing-interiors');
        selectedInteriorForPlacement = null;
      }
    });
  }
  if (showInteriorsToggle) {
    showInteriorsToggle.addEventListener('change', () => {
      renderInteriorMarkers();
    });
  }


    // Load interior placements/groups from worldAtlas if present
    function loadInteriorPlacementsAndGroups() {
      if (worldAtlas && Array.isArray(worldAtlas.interiorPlacements)) {
        interiorPlacements = JSON.parse(JSON.stringify(worldAtlas.interiorPlacements));
      } else {
        interiorPlacements = [];
      }
      if (worldAtlas && Array.isArray(worldAtlas.groups)) {
        interiorGroups = JSON.parse(JSON.stringify(worldAtlas.groups));
      } else {
        interiorGroups = [];
      }
    }

  function renderSearchList(query) {
    const q = (query || '').trim().toLowerCase();
    // Show both interiors and exteriors for placement
    let items = manifest.maps;
    if (q) {
      // Support search by #number (e.g., #519)
      const numberMatch = q.match(/^#?(\d{3})$/);
      if (numberMatch) {
        const num = numberMatch[1];
        // Only allow numbers between 001 and 519
        if (parseInt(num, 10) >= 1 && parseInt(num, 10) <= 519) {
          items = items.filter(m => {
            // Match number in image filename (e.g., exports/#001 Petalburg City.png)
            if (m.image && m.image.match(new RegExp(`#${num}(\\D|$)`))) return true;
            return false;
          });
        } else {
          items = [];
        }
      } else {
        items = items.filter(m => m.name.toLowerCase().includes(q));
      }
    }
    searchList.innerHTML = '';
    items.forEach(m => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.marginBottom = '2px';
      const type = currentType(m.name);
      const btn = document.createElement('button');
      btn.textContent = type === 'exterior' ? 'Mark as Interior' : 'Mark as Exterior';
      btn.style.marginLeft = '8px';
      btn.onclick = () => markMapType(m, type === 'exterior' ? 'interior' : 'exterior');
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = m.name;
      link.onclick = (e) => { e.preventDefault(); showSingleMap(m); };
      li.appendChild(link);
      li.appendChild(btn);
      // Add icon picker and 'Place' button in Edit Interiors mode for both interiors and exteriors
      if (editInteriorsToggle && editInteriorsToggle.checked) {
        const iconPicker = document.createElement('select');
        iconPicker.style.marginLeft = '8px';
        const icons = [
          { value: 'door', label: '🚪' },
          { value: 'cave', label: '⛰️' },
          { value: 'stairs', label: '⬆️' },
          { value: 'dive', label: '🌊' },
          { value: 'generic', label: '⭐' }
        ];
        icons.forEach(ic => {
          const opt = document.createElement('option');
          opt.value = ic.value;
          opt.textContent = ic.label;
          iconPicker.appendChild(opt);
        });
        li.appendChild(iconPicker);
        const placeBtn = document.createElement('button');
        placeBtn.textContent = 'Place';
        placeBtn.style.marginLeft = '4px';
        placeBtn.onclick = (e) => {
          selectedInteriorForPlacement = { ...m, icon: iconPicker.value };
        };
        li.appendChild(placeBtn);
      }
      searchList.appendChild(li);
    });
    if (!items.length) {
      const li = document.createElement('li');
      li.textContent = 'No maps found.';
      searchList.appendChild(li);
    }
  }

  // Wire up the 'Include world maps' checkbox to re-render the list
  if (searchAllImages) {
    searchAllImages.addEventListener('change', () => {
      renderSearchList(interiorSearch ? interiorSearch.value : '');
    });
  }
  // Initial render: show only interiors by default (must be after manifest is loaded)
  // ...existing code...

  // Helper: filter overlays and labels by search
  function filterOverlaysBySearch(query) {
    const q = (query || '').trim().toLowerCase();
    // Show all if empty
    if (!q) {
      for (const [name, obj] of overlayIndex.entries()) {
        if (obj.overlay && overlaysGroup.hasLayer(obj.overlay)) obj.overlay.setOpacity(0.95);
        if (obj.label && markersLayer.hasLayer(obj.label)) obj.label._icon.style.opacity = 1;
      }
      renderSearchList('');
      return;
    }
      // Save interior placements/groups to worldAtlas
      worldAtlas.interiorPlacements = JSON.parse(JSON.stringify(interiorPlacements));
      worldAtlas.groups = JSON.parse(JSON.stringify(interiorGroups));
    for (const [name, obj] of overlayIndex.entries()) {
      const match = name.toLowerCase().includes(q);
      if (obj.overlay && overlaysGroup.hasLayer(obj.overlay)) obj.overlay.setOpacity(match ? 0.95 : 0.15);
      if (obj.label && markersLayer.hasLayer(obj.label)) obj.label._icon.style.opacity = match ? 1 : 0.2;
    }
    renderSearchList(q);
  }
  // Wire up search bar
  if (interiorSearch) {
    interiorSearch.addEventListener('input', (e) => {
      filterOverlaysBySearch(e.target.value);
    });
  }
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

  // Load interior placements and groups from worldAtlas (after it is loaded)
  loadInteriorPlacementsAndGroups();



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

  // Track type overrides for marking maps as interior/exterior
  const typeOverrides = {};
  function currentType(name) {
    if (typeOverrides[name]) return typeOverrides[name];
    if (allExterior) return 'exterior';
    return exteriorNames.has(name) ? 'exterior' : 'interior';
  }
  function markMapType(map, toType) {
    if (!map || (toType !== 'exterior' && toType !== 'interior')) return;
    const fromType = currentType(map.name);
    if (fromType === toType) return;
    typeOverrides[map.name] = toType;
    showWorldView();
  }

  function isExterior(map) {
    if (allExterior) return true;
    return exteriorNames.has(map.name);
  }

  // For convenience, use currentType (with overrides)
  const worldMaps = manifest.maps.filter(m => currentType(m.name) === 'exterior');
  const interiorMaps = manifest.maps.filter(m => currentType(m.name) === 'interior');

  console.log(`Found ${worldMaps.length} exterior maps and ${interiorMaps.length} interior maps (by atlas)`);

  // Now that all dependencies are defined, render the search list
  renderSearchList('');

  // Create Leaflet map
  const map = L.map(mapContainer, {
    crs: L.CRS.Simple,
    minZoom: -5,
    maxZoom: 3,
    zoomSnap: 0.25,
  });

  // Layer group for interior markers
  let interiorMarkersLayer = L.layerGroup().addTo(map);

  // Handle placing an interior on the world map
  map.on('click', (e) => {
    if (editInteriorsToggle && editInteriorsToggle.checked && selectedInteriorForPlacement) {
      let parent = null;
      let markerX = e.latlng.lng;
      let markerY = e.latlng.lat;
      let storeAsWorld = false;
      if (currentView === 'single' && currentMapData) {
        parent = currentMapData.name;
        // If this map is in the world atlas, convert to world coordinates and store as world marker
        if (worldAtlas && Array.isArray(worldAtlas.maps)) {
          const atlasEntry = worldAtlas.maps.find(e => e.name === currentMapData.name);
          if (atlasEntry) {
            markerX = e.latlng.lng + atlasEntry.x;
            markerY = e.latlng.lat + atlasEntry.y;
            parent = null;
            storeAsWorld = true;
          }
        }
      }
      const m = selectedInteriorForPlacement;
      interiorPlacements.push({
        name: m.name,
        x: markerX,
        y: markerY,
        parent: parent, // null for world, map name for interiors
        icon: m.icon || 'door'
      });
      selectedInteriorForPlacement = null;
      renderInteriorMarkers();
    }
  });

  // Render interior markers (to be implemented in next step)
  function renderInteriorMarkers() {
    // Remove all existing interior markers
    interiorMarkersLayer.clearLayers();
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
        interiorMarkersLayer.addLayer(marker);
      }
    }

    // Helper: for a world marker, find the exterior map name it should show up in
    function placementOnExteriorName(placement, manifest, worldAtlas) {
      // If the marker is placed on the world map (parent: null), find the exterior map whose bounds contain the marker
      if (!worldAtlas || !Array.isArray(worldAtlas.maps)) return null;
      for (const entry of worldAtlas.maps) {
        const x = placement.x, y = placement.y;
        if (x >= entry.x && x <= entry.x + entry.width && y >= entry.y && y <= entry.y + entry.height) {
          return entry.name;
        }
      }
      return null;
    }
  }

  let currentView = 'world';
  let currentMapData = null;
  let overlaysGroup = L.layerGroup().addTo(map);
  let markersLayer = L.layerGroup().addTo(map);
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


  // Show world view with stitched maps (exteriors only)
  function showWorldView() {
    // If search bar is present, clear it and reset overlays and list
    if (interiorSearch) {
      interiorSearch.value = '';
      filterOverlaysBySearch('');
      renderSearchList('');
    }
    currentView = 'world';
    currentMapData = null;
    overlaysGroup.clearLayers();
    markersLayer.clearLayers();

  // Render interior markers
  renderInteriorMarkers();

    breadcrumb.innerHTML = '<strong>World Map</strong>';
    mapInfo.textContent = worldAtlas && Array.isArray(worldAtlas.maps)
      ? `Using precomputed atlas layout for ${worldAtlas.maps.length} maps`
      : `Viewing ${worldMaps.length} world maps (grid layout)`;
    backBtn.style.display = 'none';

    overlayIndex.clear();

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
  });

  map.on('mouseup', () => {
    if (!dragState) return;
    // Snap corners on release
    snapOverlayToNeighbors(dragState.overlay);
    // Persist after snapping so leaving the view keeps positions
    stashCurrentLayout();
    dragState = null;
    map.dragging.enable();
  });

  // Draw connection lines between world map centers using connections data

  // Show a single map (exterior or interior, but no interior navigation)
  function showSingleMap(mapData) {
  // Remove any lingering tooltips
  document.querySelectorAll('.interior-tooltip').forEach(el => el.remove());
  // Remove any lingering tooltips
  document.querySelectorAll('.interior-tooltip').forEach(el => el.remove());
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

    // Show interior markers for this map (handled by renderInteriorMarkers)
    renderInteriorMarkers();
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


  // Initial render
  showWorldView();
}

window.addEventListener('load', init);
