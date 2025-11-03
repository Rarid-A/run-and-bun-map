// Script to automatically generate groups from nested interiors in world-atlas.json
// Usage: node generate-groups.js

const fs = require('fs');
const path = require('path');

// Load the world-atlas file
const atlasPath = path.join(__dirname, 'data', 'world-atlas (1).json');
const atlas = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));

// Load the manifest to get map dimensions
const mapsPath = path.join(__dirname, 'data', 'maps.json');
const manifest = JSON.parse(fs.readFileSync(mapsPath, 'utf8'));

// Create a map of map names to their data
const mapsByName = {};
manifest.maps.forEach(m => {
  mapsByName[m.name] = m;
});

// Build parent-child relationships from interiorPlacements
const parentToChildren = new Map();
const childToParent = new Map();

atlas.interiorPlacements.forEach(placement => {
  const child = placement.name;
  const parent = placement.parent;
  
  if (parent) {
    if (!parentToChildren.has(parent)) {
      parentToChildren.set(parent, []);
    }
    parentToChildren.get(parent).push({
      name: child,
      x: placement.x,
      y: placement.y
    });
    childToParent.set(child, parent);
  }
});

// Find all root interiors (interiors that have children but are themselves children)
// and all standalone groups
const allInteriors = new Set(atlas.interiorPlacements.map(p => p.name));
const rootGroups = new Map(); // groupName -> [members]

// Function to get all members of a connected group
function getAllConnectedMembers(startName, visited = new Set()) {
  if (visited.has(startName)) return [];
  visited.add(startName);
  
  const members = [startName];
  
  // Get children
  if (parentToChildren.has(startName)) {
    parentToChildren.get(startName).forEach(child => {
      members.push(...getAllConnectedMembers(child.name, visited));
    });
  }
  
  // Get parent
  if (childToParent.has(startName)) {
    const parent = childToParent.get(startName);
    members.push(...getAllConnectedMembers(parent, visited));
  }
  
  return members;
}

// Find all unique groups
const processedMaps = new Set();
const groups = [];

allInteriors.forEach(interiorName => {
  if (processedMaps.has(interiorName)) return;
  
  // Get all connected members
  const members = getAllConnectedMembers(interiorName);
  
  // Only create a group if there are multiple connected members
  if (members.length > 1) {
    // Mark all as processed
    members.forEach(m => processedMaps.add(m));
    
    // Determine group name (use the most common base name)
    const groupName = determineGroupName(members);
    
    groups.push({
      name: groupName,
      members: members
    });
  }
});

// Function to determine the best group name
function determineGroupName(members) {
  // Try to find common prefix
  if (members.length === 0) return 'Unknown Group';
  
  // Remove floor indicators to find base name
  const baseNames = members.map(name => {
    // Remove common floor patterns
    return name
      .replace(/\s+\d+F$/i, '')
      .replace(/\s+B\d+F$/i, '')
      .replace(/\s+Floor \d+$/i, '')
      .replace(/\s+Exterior$/i, '')
      .replace(/\s+Summit$/i, '')
      .trim();
  });
  
  // Find most common base name
  const nameCounts = {};
  baseNames.forEach(name => {
    nameCounts[name] = (nameCounts[name] || 0) + 1;
  });
  
  const mostCommon = Object.keys(nameCounts).reduce((a, b) => 
    nameCounts[a] > nameCounts[b] ? a : b
  );
  
  return mostCommon;
}

// Function to extract floor information
function extractFloorInfo(name) {
  // Check for floor patterns
  const patterns = [
    { regex: /(\d+)F$/i, type: 'floor' },
    { regex: /B(\d+)F$/i, type: 'basement' },
    { regex: /Floor (\d+)$/i, type: 'floor' },
    { regex: /Exterior$/i, type: 'exterior' },
    { regex: /Summit$/i, type: 'summit' },
  ];
  
  for (const pattern of patterns) {
    const match = name.match(pattern.regex);
    if (match) {
      if (pattern.type === 'floor' || pattern.type === 'basement') {
        const floorNum = parseInt(match[1]);
        return {
          type: pattern.type,
          number: floorNum,
          sort: pattern.type === 'basement' ? -floorNum : floorNum
        };
      } else if (pattern.type === 'exterior') {
        return { type: 'exterior', number: 0, sort: 0 };
      } else if (pattern.type === 'summit') {
        return { type: 'summit', number: 999, sort: 999 };
      }
    }
  }
  
  // Check if it's a Pokemon Center 2F (special case)
  if (name.includes('Pokemon Center') && name.includes('2F')) {
    return { type: 'pokemon-center-2f', number: 2, sort: 2 };
  }
  
  return { type: 'other', number: 0, sort: 0 };
}

// Generate group layouts
const groupLayouts = {};

groups.forEach(group => {
  const layouts = {};
  
  // Check if this is a Pokemon Center
  const isPokemonCenter = group.members.some(m => m.includes('Pokemon Center'));
  
  // Sort members by floor
  const memberInfo = group.members.map(name => ({
    name,
    floor: extractFloorInfo(name),
    map: mapsByName[name]
  })).filter(m => m.map); // Only include maps that exist
  
  // Sort by floor number
  memberInfo.sort((a, b) => a.floor.sort - b.floor.sort);
  
  // Find max dimensions for spacing
  const maxW = Math.max(...memberInfo.map(m => m.map.width));
  const maxH = Math.max(...memberInfo.map(m => m.map.height));
  const padding = 20;
  
  if (isPokemonCenter) {
    // Special Pokemon Center layout: 2F to the left of 1F
    memberInfo.forEach((member, idx) => {
      if (member.name.includes('2F')) {
        // 2F goes to the left
        layouts[member.name] = {
          offsetX: 0,
          offsetY: 0
        };
      } else {
        // 1F goes to the right
        layouts[member.name] = {
          offsetX: maxW + padding,
          offsetY: 0
        };
      }
    });
  } else {
    // Default layout: floors stack vertically, others go to the left
    let currentY = 0;
    let leftColumnY = 0;
    let hasFloors = memberInfo.some(m => m.floor.type === 'floor' || m.floor.type === 'basement');
    
    memberInfo.forEach((member, idx) => {
      if (member.floor.type === 'floor' || member.floor.type === 'basement' || member.floor.type === 'summit') {
        // Stack floors vertically (higher floors at top)
        // Reverse the order so 1F is at bottom
        const reverseIdx = memberInfo.filter(m => 
          m.floor.type === 'floor' || m.floor.type === 'basement' || m.floor.type === 'summit'
        ).length - 1 - memberInfo.filter(m => 
          m.floor.type === 'floor' || m.floor.type === 'basement' || m.floor.type === 'summit'
        ).indexOf(member);
        
        layouts[member.name] = {
          offsetX: hasFloors ? maxW + padding : 0,
          offsetY: reverseIdx * (maxH + padding)
        };
      } else {
        // Place other maps (like Exterior) to the left
        layouts[member.name] = {
          offsetX: 0,
          offsetY: leftColumnY
        };
        leftColumnY += maxH + padding;
      }
    });
  }
  
  groupLayouts[group.name] = layouts;
});

// Update atlas with new groups and layouts
atlas.groups = groups;
atlas.groupLayouts = groupLayouts;

// Save the updated atlas
const outputPath = path.join(__dirname, 'data', 'world-atlas (1).json');
fs.writeFileSync(outputPath, JSON.stringify(atlas, null, 2), 'utf8');

console.log(`✓ Generated ${groups.length} groups`);
console.log('\nGroups created:');
groups.forEach(group => {
  console.log(`  - ${group.name} (${group.members.length} maps)`);
  group.members.forEach(member => {
    console.log(`    • ${member}`);
  });
});
console.log(`\n✓ Saved to ${outputPath}`);
