// Modular orchestrator for interactive Pokemon map
import * as state from './js/state.js';
import * as mapmod from './js/map.js';
import * as ui from './js/ui.js';
import { safeImageUrl } from './js/utils.js';

async function init() {
  // --- Load manifest and world atlas ---
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
  let worldAtlas = null;
  let worldAtlasSource = 'none';
  try {
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
  } catch (e) {}
  if (!worldAtlas && typeof window.__WORLD_ATLAS === 'object' && window.__WORLD_ATLAS) {
    worldAtlas = window.__WORLD_ATLAS;
    worldAtlasSource = 'embedded';
  }

  // Load interior placements and groups from worldAtlas if present
  if (worldAtlas && Array.isArray(worldAtlas.interiorPlacements)) {
    state.setInteriorPlacements(JSON.parse(JSON.stringify(worldAtlas.interiorPlacements)));
  }
  if (worldAtlas && Array.isArray(worldAtlas.groups)) {
    state.setInteriorGroups(JSON.parse(JSON.stringify(worldAtlas.groups)));
  }

  state.setManifest(manifest);
  state.setWorldAtlas(worldAtlas, worldAtlasSource);
  state.buildMapClassification(manifest, worldAtlas);

  // --- Expose to window for access in UI components ---
  window.state = state;
  window.manifest = manifest;

  // --- State for UI and navigation ---
  let currentView = { value: 'world' };
  let currentMapData = { value: null };
  let selectedInteriorForPlacement = { value: null };
  // Attach to window for global access (used by map.js label click marker rendering)
  window.currentView = currentView;
  window.currentMapData = currentMapData;
  window.showSingleMap = null;

  // --- Map and UI setup ---
  const mapContainer = document.getElementById('map');
  const map = mapmod.createMap(mapContainer);
  // Attach currentView and currentMapData for use in map.js label click
  map._currentView = currentView;
  map._currentMapData = currentMapData;
  const worldMaps = manifest.maps.filter(m => state.currentType(m.name) === 'exterior');
  const interiorMaps = manifest.maps.filter(m => state.currentType(m.name) === 'interior');

  // --- Overlay edit/drag handlers ---
  mapmod.setupOverlayEditHandlers({
    map,
    overlayIndex: map._overlayIndex,
    overlayToName: map._overlayToName,
    setOverlayPxBounds: mapmod.setOverlayPxBounds,
    getOverlayPxBounds: mapmod.getOverlayPxBounds,
    snapOverlayToNeighbors: mapmod.snapOverlayToNeighbors,
    stashCurrentLayout: () => mapmod.stashCurrentLayout({
      overlayIndex: map._overlayIndex,
      mutableAtlas: state.mutableAtlas,
      currentType: state.currentType,
      mapsByName: state.mapsByName
    })
  });

  // --- Interior placement click handler ---
  mapmod.setupInteriorPlacement({
    map,
    editInteriorsToggle: document.getElementById('edit-interiors'),
    selectedInteriorForPlacement,
    currentView,
    currentMapData,
    worldAtlas,
    interiorPlacements: state.interiorPlacements,
    renderInteriorMarkers: () => {
      // Determine current group if in group view
      let currentGroup = null;
      if (currentView.value === 'group' && currentMapData.value) {
        currentGroup = state.interiorGroups.find(g => g.members.includes(currentMapData.value.name));
      }
      
      mapmod.renderInteriorMarkers({
        map,
        interiorPlacements: state.interiorPlacements,
        showInteriorsToggle: document.getElementById('show-interiors'),
        currentView: currentView.value,
        currentMapData: currentMapData.value,
        worldAtlas,
        manifest,
        interiorGroups: state.interiorGroups,
        showSingleMap,
        currentGroup: currentGroup
      });
    }
  });

  // --- Group modal wiring ---
  ui.wireGroupModal({
    manageGroupsBtn: document.getElementById('manage-groups'),
    groupModal: document.getElementById('group-modal'),
    closeGroupModalBtn: document.getElementById('close-group-modal'),
    interiorGroups: state.interiorGroups,
    interiorMaps: interiorMaps,
    onOpen: () => ui.renderGroupList({
      interiorGroups: state.interiorGroups,
      interiorMaps,
      groupListDiv: document.getElementById('group-list')
    })
  });

  // --- Search and placement UI ---
  const searchList = document.getElementById('interiors-list');
  const editInteriorsToggle = document.getElementById('edit-interiors');
  const showInteriorsToggle = document.getElementById('show-interiors');
  const searchAllImages = document.getElementById('search-all-images');
  const interiorSearch = document.getElementById('interior-search');
  const toggleLabels = document.getElementById('toggle-labels');
  const toggleEdit = document.getElementById('toggle-edit');
  const toggleIncludeInteriors = document.getElementById('toggle-include-interiors');

  function rerenderSearchList() {
    ui.renderSearchList({
      query: interiorSearch ? interiorSearch.value : '',
      manifest,
      currentType: state.currentType,
      markMapType: (m, t) => {
        state.markMapType(m, t);
        state.buildMapClassification(manifest, worldAtlas);
        showWorldView();
      },
      showSingleMap,
      editInteriorsToggle,
      selectedInteriorForPlacement,
      searchList,
      interiorMaps
    });
  }

  // Initial render
  rerenderSearchList();

  // --- Event wiring for UI controls ---
  if (interiorSearch) {
    interiorSearch.addEventListener('input', rerenderSearchList);
  }
  if (searchAllImages) {
    searchAllImages.addEventListener('change', rerenderSearchList);
  }
  if (editInteriorsToggle) {
    editInteriorsToggle.addEventListener('change', () => {
      rerenderSearchList();
      document.body.classList.toggle('editing-interiors', editInteriorsToggle.checked);
    });
  }
  if (showInteriorsToggle) {
    showInteriorsToggle.addEventListener('change', () => {
      mapmod.renderInteriorMarkers({
        map,
        interiorPlacements: state.interiorPlacements,
        showInteriorsToggle,
        currentView: currentView.value,
        currentMapData: currentMapData.value,
        worldAtlas,
        manifest,
        interiorGroups: state.interiorGroups,
        showSingleMap,
        currentGroup: null
      });
    });
  }
  if (toggleLabels) {
    toggleLabels.addEventListener('change', () => {
      // Only re-render world view if we're in world view
      if (currentView.value === 'world') {
        showWorldView();
      }
    });
  }
  if (toggleEdit) {
    toggleEdit.addEventListener('change', () => {
      map._container.classList.toggle('editing', toggleEdit.checked);
    });
  }
  if (toggleIncludeInteriors) {
    toggleIncludeInteriors.addEventListener('change', () => {
      // Only re-render world view if we're in world view
      if (currentView.value === 'world') {
        showWorldView();
      }
    });
  }


  // --- Navigation and view switching ---
  function showWorldView() {
    currentView.value = 'world';
    currentMapData.value = null;
    mapmod.showWorldView({
      map,
      manifest,
      worldAtlas,
      worldMaps: manifest.maps.filter(m => state.currentType(m.name) === 'exterior'),
      interiorMaps: manifest.maps.filter(m => state.currentType(m.name) === 'interior'),
      mutableAtlas: state.mutableAtlas,
      toggleLabels: ui.toggleLabels,
      toggleIncludeInteriors: ui.toggleIncludeInteriors,
      setBreadcrumb: ui.setBreadcrumb,
      setMapInfo: ui.setMapInfo,
      backBtn: ui.backBtn,
      showSingleMap
    });
    mapmod.renderInteriorMarkers({
      map,
      interiorPlacements: state.interiorPlacements,
      showInteriorsToggle: document.getElementById('show-interiors'),
      currentView: currentView.value,
      currentMapData: currentMapData.value,
      worldAtlas,
      manifest,
      interiorGroups: state.interiorGroups,
      showSingleMap,
      currentGroup: null
    });
    ui.renderSearchList({
      query: '',
      manifest,
      currentType: state.currentType,
      markMapType: (m, t) => {
        state.markMapType(m, t);
        state.buildMapClassification(manifest, worldAtlas);
        showWorldView();
      },
      showSingleMap,
      editInteriorsToggle,
      selectedInteriorForPlacement,
      searchList,
      interiorMaps
    });
  }

  function showSingleMap(m) {
    // Check if this map is part of a group
    const group = state.interiorGroups.find(g => g.members.includes(m.name));
    
    if (group) {
      // Show group view
      currentView.value = 'group';
      currentMapData.value = m;
      mapmod.showGroupView({
        map,
        group,
        manifest,
        overlaysGroup: map._overlaysGroup,
        markersLayer: map._markersLayer,
        setBreadcrumb: ui.setBreadcrumb,
        setMapInfo: ui.setMapInfo,
        backBtn: ui.backBtn,
        worldAtlas,
        showSingleMap: (mapData) => {
          // Recursion-safe: directly show single map without group check
          currentView.value = 'single';
          currentMapData.value = mapData;
          mapmod.showSingleMap({
            map,
            mapData,
            overlaysGroup: map._overlaysGroup,
            markersLayer: map._markersLayer,
            setBreadcrumb: ui.setBreadcrumb,
            setMapInfo: ui.setMapInfo,
            backBtn: ui.backBtn,
            renderInteriorMarkers: () => mapmod.renderInteriorMarkers({
              map,
              interiorPlacements: state.interiorPlacements,
              showInteriorsToggle: document.getElementById('show-interiors'),
              currentView: 'single',
              currentMapData: mapData,
              worldAtlas,
              manifest,
              interiorGroups: state.interiorGroups,
              showSingleMap,
              currentGroup: null
            })
          });
        },
        renderInteriorMarkers: () => mapmod.renderInteriorMarkers({
          map,
          interiorPlacements: state.interiorPlacements,
          showInteriorsToggle: document.getElementById('show-interiors'),
          currentView: 'group',
          currentMapData: currentMapData.value,
          worldAtlas,
          manifest,
          interiorGroups: state.interiorGroups,
          showSingleMap,
          currentGroup: group
        })
      });
    } else {
      // Show single map view
      currentView.value = 'single';
      currentMapData.value = m;
      mapmod.showSingleMap({
        map,
        mapData: m,
        overlaysGroup: map._overlaysGroup,
        markersLayer: map._markersLayer,
        setBreadcrumb: ui.setBreadcrumb,
        setMapInfo: ui.setMapInfo,
        backBtn: ui.backBtn,
        renderInteriorMarkers: () => mapmod.renderInteriorMarkers({
          map,
          interiorPlacements: state.interiorPlacements,
          showInteriorsToggle: document.getElementById('show-interiors'),
          currentView: currentView.value,
          currentMapData: currentMapData.value,
          worldAtlas,
          manifest,
          interiorGroups: state.interiorGroups,
          showSingleMap,
          currentGroup: null
        })
      });
    }
  }

  // --- Wire up navigation buttons ---
  if (ui.backBtn) ui.backBtn.addEventListener('click', showWorldView);
  if (ui.worldBtn) ui.worldBtn.addEventListener('click', showWorldView);

  // --- Ensure showWorldView/showSingleMap are accessible globally for debugging ---
  window.showWorldView = showWorldView;
  window.showSingleMap = showSingleMap;

  // --- Save layout wiring ---
  const saveLayoutBtn = document.getElementById('save-layout');
  if (saveLayoutBtn) {
    saveLayoutBtn.addEventListener('click', () => {
      mapmod.saveLayout({
        worldAtlas,
        worldAtlasSource,
        overlayIndex: map._overlayIndex,
        mapsByName: state.mapsByName,
        map,
        interiorPlacements: state.interiorPlacements,
        interiorGroups: state.interiorGroups
      });
    });
  }

  // --- Initial render ---
  showWorldView();
}

window.addEventListener('load', init);
