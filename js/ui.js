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
    manageGroupsBtn.addEventListener('click', onManageGroups);
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
