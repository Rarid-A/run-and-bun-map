// --- Interior Placement and Search UI Logic ---
// Renders the search list for interiors/exteriors and supports placement/editing
export function renderSearchList({
  query = '', manifest, currentType, markMapType, showSingleMap, editInteriorsToggle, selectedInteriorForPlacement, searchList, interiorMaps
}) {
  const q = (query || '').trim().toLowerCase();
  let items = manifest.maps;
  // Only show interiors if editing interiors and not including world maps
  const includeWorldMaps = document.getElementById('search-all-images');
  const includeWorldMapsChecked = includeWorldMaps && includeWorldMaps.checked;
  
  // First, filter by search query if present
  if (q) {
    // Check if the query is only digits (1-3 digits)
    const numberMatch = q.match(/^#?(\d{1,3})$/);
    if (numberMatch) {
      const num = numberMatch[1];
      // Only show results if exactly 3 digits are entered
      if (num.length === 3) {
        const numValue = parseInt(num, 10);
        if (numValue >= 1 && numValue <= 519) {
          // Match #NNN followed by a space or non-digit
          items = items.filter(m => m.image && m.image.includes(`#${num} `));
        } else {
          items = [];
        }
      } else {
        // If 1 or 2 digits, don't show any results yet
        items = [];
      }
    } else {
      items = items.filter(m => m.name.toLowerCase().includes(q));
    }
  }
  
  // Then, filter to interiors only if in Edit Interiors mode (and not including world maps)
  if (
    editInteriorsToggle && editInteriorsToggle.checked &&
    !includeWorldMapsChecked
  ) {
    items = items.filter(m => currentType(m.name) === 'interior');
  }
  searchList.innerHTML = '';
  items.forEach(m => {
    const type = currentType(m.name);
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.marginBottom = '2px';
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
    // Add icon picker and 'Place' button in Edit Interiors mode
    // Allow placing both interiors AND exteriors when in edit mode
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
        selectedInteriorForPlacement.value = { ...m, icon: iconPicker.value };
      };
      li.appendChild(placeBtn);
    }
    searchList.appendChild(li);
  });
  if (!items.length) {
    const li = document.createElement('li');
    // Check if user is typing a number search
    const numberMatch = q.match(/^#?(\d{1,3})$/);
    if (numberMatch && numberMatch[1].length < 3) {
      li.textContent = `Keep typing... (${numberMatch[1].length}/3 digits)`;
      li.style.color = '#888';
      li.style.fontStyle = 'italic';
    } else {
      li.textContent = 'No maps found.';
    }
    searchList.appendChild(li);
  }
}

// Filters overlays and labels by search query
export function filterOverlaysBySearch({query, overlayIndex, overlaysGroup, markersLayer, renderSearchList, worldAtlas, interiorPlacements, interiorGroups, searchList, manifest}) {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    for (const [name, obj] of overlayIndex.entries()) {
      if (obj.overlay && overlaysGroup.hasLayer(obj.overlay)) obj.overlay.setOpacity(0.95);
      if (obj.label && markersLayer.hasLayer(obj.label)) obj.label._icon.style.opacity = 1;
    }
    renderSearchList({query: '', manifest, searchList});
    return;
  }
  // Save interior placements/groups to worldAtlas
  if (worldAtlas) {
    worldAtlas.interiorPlacements = JSON.parse(JSON.stringify(interiorPlacements));
    worldAtlas.groups = JSON.parse(JSON.stringify(interiorGroups));
  }
  for (const [name, obj] of overlayIndex.entries()) {
    const match = name.toLowerCase().includes(q);
    if (obj.overlay && overlaysGroup.hasLayer(obj.overlay)) obj.overlay.setOpacity(match ? 0.95 : 0.15);
    if (obj.label && markersLayer.hasLayer(obj.label)) obj.label._icon.style.opacity = match ? 1 : 0.2;
  }
  renderSearchList({query: q, manifest, searchList});
}
// --- Group Management UI Logic ---
// Renders and manages the group modal for interior grouping
export function renderGroupList({interiorGroups, interiorMaps, groupListDiv, searchQuery = ''}) {
  console.log('renderGroupList called:', {
    groupCount: interiorGroups?.length,
    searchQuery,
    hasListDiv: !!groupListDiv
  });
  
  groupListDiv.innerHTML = '';
  
  // Filter groups by search query
  const filteredGroups = searchQuery 
    ? interiorGroups.filter(g => 
        g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.members.some(m => m.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : interiorGroups;
  
  console.log('Filtered groups:', filteredGroups.length);
  
  if (filteredGroups.length === 0) {
    groupListDiv.innerHTML = '<p style="color:#999; text-align:center;">No groups found</p>';
    return;
  }
  
  // List all groups
  filteredGroups.forEach((group, idx) => {
    const originalIdx = interiorGroups.indexOf(group);
    const groupDiv = document.createElement('div');
    groupDiv.style.cssText = 'margin-bottom:1em; border:1px solid #ddd; border-radius:6px; overflow:hidden; background:#fafafa;';
    
    // Group header (collapsible)
    const header = document.createElement('div');
    header.style.cssText = 'padding:10px 12px; background:#f5f5f5; cursor:pointer; display:flex; justify-content:space-between; align-items:center; user-select:none;';
    header.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="collapse-icon" style="font-size:12px; transition:transform 0.2s;">▼</span>
        <strong style="font-size:14px;">${group.name}</strong>
        <span style="color:#666; font-size:12px;">(${group.members.length} maps)</span>
      </div>
      <button data-idx="${originalIdx}" class="remove-group" style="background:#e74c3c; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px;">Delete</button>
    `;
    
    // Content (members + add)
    const content = document.createElement('div');
    content.className = 'group-content';
    content.style.cssText = 'max-height:0; overflow:hidden; transition:max-height 0.3s ease;';
    
    const innerContent = document.createElement('div');
    innerContent.style.padding = '12px';
    
    // List members
    if (group.members.length > 0) {
      const members = document.createElement('ul');
      members.style.cssText = 'list-style:none; padding:0; margin:0 0 10px 0; max-height:150px; overflow-y:auto;';
      group.members.forEach((m, mIdx) => {
        const li = document.createElement('li');
        li.style.cssText = 'padding:6px 8px; margin-bottom:4px; background:white; border:1px solid #e0e0e0; border-radius:4px; display:flex; justify-content:space-between; align-items:center; font-size:13px;';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = m;
        nameSpan.style.flex = '1';
        
        const rmBtn = document.createElement('button');
        rmBtn.textContent = '✕';
        rmBtn.style.cssText = 'background:#ff6b6b; color:white; border:none; padding:2px 8px; border-radius:3px; cursor:pointer; font-size:11px;';
        rmBtn.onclick = (e) => {
          e.stopPropagation();
          group.members.splice(mIdx, 1);
          renderGroupList({interiorGroups, interiorMaps, groupListDiv, searchQuery});
        };
        
        li.appendChild(nameSpan);
        li.appendChild(rmBtn);
        members.appendChild(li);
      });
      innerContent.appendChild(members);
    }
    
    // Add member section
    const addDiv = document.createElement('div');
    addDiv.style.cssText = 'display:flex; flex-direction:column; gap:6px;';
    const select = document.createElement('select');
    select.style.cssText = 'width:100%; padding:6px; border:1px solid #ccc; border-radius:4px; font-size:13px; box-sizing:border-box;';
    
    // Get all maps that are already in ANY group
    const mapsInGroups = new Set();
    interiorGroups.forEach(g => {
      g.members.forEach(m => mapsInGroups.add(m));
    });
    
    // Filter out maps that are in the current group OR in any other group
    const availableMaps = interiorMaps.filter(im => !mapsInGroups.has(im.name));
    
    select.innerHTML = '<option value="">Add interior...</option>' +
      availableMaps.map(im => `<option value="${im.name}">${im.name}</option>`).join('');
    addDiv.appendChild(select);
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add';
    addBtn.style.cssText = 'width:100%; background:#3498db; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:12px; box-sizing:border-box;';
    addBtn.onclick = () => {
      if (select.value) {
        group.members.push(select.value);
        renderGroupList({interiorGroups, interiorMaps, groupListDiv, searchQuery});
      }
    };
    addDiv.appendChild(addBtn);
    innerContent.appendChild(addDiv);
    
    content.appendChild(innerContent);
    groupDiv.appendChild(header);
    groupDiv.appendChild(content);
    groupListDiv.appendChild(groupDiv);
    
    // Toggle collapse on header click
    let isExpanded = false;
    header.onclick = (e) => {
      if (e.target.classList.contains('remove-group')) return; // Don't toggle if clicking delete
      isExpanded = !isExpanded;
      const icon = header.querySelector('.collapse-icon');
      if (isExpanded) {
        content.style.maxHeight = content.scrollHeight + 'px';
        icon.style.transform = 'rotate(-90deg)';
      } else {
        content.style.maxHeight = '0';
        icon.style.transform = 'rotate(0deg)';
      }
    };
  });
  
  // Add new group section
  const newDiv = document.createElement('div');
  newDiv.style.cssText = 'margin-top:1.5em; margin-bottom:20px; padding:12px; border:2px dashed #ccc; border-radius:6px; background:#f9f9f9;';
  const nameInput = document.createElement('input');
  nameInput.placeholder = 'New group name';
  nameInput.style.cssText = 'width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; margin-bottom:8px; box-sizing:border-box;';
  newDiv.appendChild(nameInput);
  const createBtn = document.createElement('button');
  createBtn.textContent = '+ Create New Group';
  createBtn.style.cssText = 'width:100%; background:#27ae60; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; font-weight:bold;';
  createBtn.onclick = () => {
    const name = nameInput.value.trim();
    if (name && !interiorGroups.some(g => g.name === name)) {
      interiorGroups.push({ name, members: [] });
      renderGroupList({interiorGroups, interiorMaps, groupListDiv, searchQuery});
      nameInput.value = '';
    }
  };
  newDiv.appendChild(createBtn);
  groupListDiv.appendChild(newDiv);
  
  // Remove group buttons
  groupListDiv.querySelectorAll('.remove-group').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      if (!isNaN(idx) && confirm(`Delete group "${interiorGroups[idx].name}"?`)) {
        interiorGroups.splice(idx, 1);
        renderGroupList({interiorGroups, interiorMaps, groupListDiv, searchQuery});
      }
    };
  });
}

// Wire up group modal open/close
export function wireGroupModal({manageGroupsBtn, groupModal, closeGroupModalBtn, interiorGroups, interiorMaps, onOpen}) {
  // Set up search handler once, outside of the click handler
  const groupSearch = document.getElementById('group-search');
  const groupListDiv = document.getElementById('group-list');
  
  if (groupSearch && groupListDiv && interiorGroups && interiorMaps) {
    // Set up the search handler ONCE
    groupSearch.addEventListener('input', () => {
      console.log('Search handler fired:', groupSearch.value);
      renderGroupList({
        interiorGroups,
        interiorMaps,
        groupListDiv,
        searchQuery: groupSearch.value
      });
    });
  }
  
  if (manageGroupsBtn && groupModal) {
    manageGroupsBtn.addEventListener('click', () => {
      console.log('Opening group modal');
      groupModal.style.display = 'block';
      if (groupSearch) groupSearch.value = ''; // Clear search on open
      if (onOpen) onOpen();
    });
  }
  
  if (closeGroupModalBtn && groupModal) {
    closeGroupModalBtn.addEventListener('click', () => {
      groupModal.style.display = 'none';
    });
  }
}
// --- UI element references and event wiring from app.js ---
export const breadcrumb = document.getElementById('breadcrumb');
export const mapInfo = document.getElementById('current-map-info');
export const backBtn = document.getElementById('back-to-world');
export const worldBtn = document.getElementById('show-world-view');
export const toggleEdit = document.getElementById('toggle-edit');
export const toggleLines = document.getElementById('toggle-lines');
export const toggleLabels = document.getElementById('toggle-labels');
export const toggleIncludeInteriors = document.getElementById('toggle-include-interiors');
export const saveLayoutBtn = document.getElementById('save-layout');
export const groupModal = document.getElementById('group-modal');
export const closeGroupModal = document.getElementById('close-group-modal');

export function wireUIEvents({
  showWorldView,
  showSingleMap,
  setEditEnabled,
  refreshLabelsOnly,
  saveLayout,
  drawConnections,
  connectionLayer
}) {
  if (toggleEdit) toggleEdit.addEventListener('change', () => setEditEnabled(toggleEdit.checked));
  if (toggleLines) toggleLines.addEventListener('change', () => {
    if (toggleLines.checked) drawConnections(); else connectionLayer.clearLayers();
  });
  if (toggleLabels) toggleLabels.addEventListener('change', () => {
    refreshLabelsOnly();
  });
  if (toggleIncludeInteriors) toggleIncludeInteriors.addEventListener('change', () => {
    showWorldView();
  });
  if (saveLayoutBtn) saveLayoutBtn.addEventListener('click', saveLayout);
  if (backBtn) backBtn.addEventListener('click', showWorldView);
  if (worldBtn) worldBtn.addEventListener('click', showWorldView);
  if (closeGroupModal && groupModal) {
    closeGroupModal.addEventListener('click', () => {
      groupModal.style.display = 'none';
    });
  }
}
// UI logic for group management, toggles, and search
// Called from app.js to set up event handlers
export function setupUI({
  onEditInteriorsToggle,
  onShowInteriorsToggle,
  onManageGroups,
  onSearch,
  onIncludeWorldMapsToggle,
  getInteriorsForGrouping // NEW: function to get only interiors for group selection
}) {
  // Assign DOM elements
  const editInteriorsToggle = document.getElementById('edit-interiors');
  const showInteriorsToggle = document.getElementById('show-interiors');
  const manageGroupsBtn = document.getElementById('manage-groups');
  const interiorSearch = document.getElementById('interior-search');
  const searchAllImages = document.getElementById('search-all-images');
  const breadcrumb = document.getElementById('breadcrumb');
  const mapInfo = document.getElementById('current-map-info');
  const backBtn = document.getElementById('back-to-world');
  const worldBtn = document.getElementById('show-world-view');
  const toggleEdit = document.getElementById('toggle-edit');
  const toggleLines = document.getElementById('toggle-lines');
  const toggleLabels = document.getElementById('toggle-labels');
  const toggleIncludeInteriors = document.getElementById('toggle-include-interiors');
  const saveLayoutBtn = document.getElementById('save-layout');
  const groupModal = document.getElementById('group-modal');
  const closeGroupModal = document.getElementById('close-group-modal');

  if (editInteriorsToggle) {
    editInteriorsToggle.addEventListener('change', e => onEditInteriorsToggle(e.target.checked));
  }
  if (showInteriorsToggle) {
    showInteriorsToggle.addEventListener('change', e => onShowInteriorsToggle(e.target.checked));
  }
  if (manageGroupsBtn) {
    manageGroupsBtn.addEventListener('click', () => {
      // When opening group modal, only show interiors for selection
      if (typeof getInteriorsForGrouping === 'function') {
        const interiors = getInteriorsForGrouping();
        // TODO: Render group selection UI with only interiors
        // (Implementation of modal rendering is in app.js or here as needed)
      }
      onManageGroups();
    });
  }
  if (interiorSearch) {
    interiorSearch.addEventListener('input', e => onSearch(e.target.value));
  }
  if (searchAllImages) {
    searchAllImages.addEventListener('change', e => onIncludeWorldMapsToggle(e.target.checked));
  }
  if (closeGroupModal && groupModal) {
    closeGroupModal.addEventListener('click', () => {
      groupModal.style.display = 'none';
    });
  }
  // Add more UI event listeners as needed
}

// Example: update breadcrumb text
export function setBreadcrumb(text) {
  const breadcrumb = document.getElementById('breadcrumb');
  if (breadcrumb) breadcrumb.textContent = text;
}

// Example: update map info
export function setMapInfo(html) {
  const mapInfo = document.getElementById('current-map-info');
  if (mapInfo) mapInfo.innerHTML = html;
}

// Add more UI update functions as needed
