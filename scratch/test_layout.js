// Read app.js
const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');
const allData = { 
  schemaEntities: {
    'q_getUser': { name: 'q_getUser', type: 'query', fields: { 'user': {type:'object', refName:'User'} } },
    'User': { name: 'User', type: 'type', fields: { 'id': {type:'scalar'}, 'profile': {type:'object', refName:'Profile'} } },
    'Profile': { name: 'Profile', type: 'type', fields: { 'avatar': {type:'scalar'} } }
  }
};

const entities = Object.values(allData.schemaEntities);

// 1. Assign layers
let nodeLayers = {};
let layerCount = {};

// init with -1
entities.forEach(e => nodeLayers[e.name] = -1);

// Layer 0: Root nodes
entities.forEach(e => {
  if (['query','mutation','subscription'].includes(e.type)) {
    nodeLayers[e.name] = 0;
  }
});

// Calculate DAG layers with a simple BFS spreading max-depth
let changed = true;
let loops = 0;
while(changed && loops < 20) {
  changed = false;
  loops++;
  
  entities.forEach(e => {
    // If this node has a layer assigned, push its children to layer + 1
    if (nodeLayers[e.name] !== -1) {
      let myLayer = nodeLayers[e.name];
      Object.values(e.fields).forEach(f => {
        if (f.type === 'object' && nodeLayers[f.refName] !== undefined) {
          if (nodeLayers[f.refName] < myLayer + 1) {
            nodeLayers[f.refName] = myLayer + 1;
            changed = true;
          }
        }
      });
    }
  });
}

// Any unconnected/unassigned 'type' nodes go to a generic "Unlinked" layer at the end
let maxLayer = Math.max(0, ...Object.values(nodeLayers));
entities.forEach(e => {
  if (nodeLayers[e.name] === -1) {
    nodeLayers[e.name] = maxLayer + 1;
  }
});

console.log(nodeLayers);

// 2. We can split large layers into sub-columns
// e.g., if Layer 1 has 20 nodes, we can split it into Col 1, Col 2.
const colX = {};
const currentY = {};

entities.forEach(e => {
  let layer = nodeLayers[e.name];
  // Calculate how many nodes are in this layer
  if(!layerCount[layer]) layerCount[layer] = 0;
  
  const SUB_COL_LIMIT = 8; // If a layer has > 8 nodes, they wrap to the next column
  
  const subCol = Math.floor(layerCount[layer] / SUB_COL_LIMIT);
  
  // Real column X index = layer * base_width + extra sub columns
  // Need to track cumulative real columns to avoid layer 2 overlapping layer 1's sub-columns
  // Instead of complex logic:
  layerCount[layer]++;
});

// Actually, simpler: compute column base X dynamically.
// We have Layers 0..Max. Each layer has N nodes.
let colBaseX = 50;
entities.sort((a,b) => nodeLayers[a.name] - nodeLayers[b.name]); // sort by layer

let currentLayer = 0;
let layerNodeIdx = 0;
let currentGlobalCol = 0;

entities.forEach(e => {
  if (nodeLayers[e.name] !== currentLayer) {
    // next layer
    currentLayer = nodeLayers[e.name];
    currentGlobalCol++; 
    layerNodeIdx = 0;
  }
  
  if (layerNodeIdx > 0 && layerNodeIdx % 10 === 0) {
    currentGlobalCol++; // Spill into a new sub-column
  }
  
  const colW = 280;
  const colOffset = currentGlobalCol * colW;
  
  if(!currentY[currentGlobalCol]) currentY[currentGlobalCol] = 50;
  
  console.log(`Node ${e.name} -> Layer ${nodeLayers[e.name]}, Col ${currentGlobalCol}, Y ${currentY[currentGlobalCol]}`);
  
  e.x = 50 + colOffset;
  e.y = currentY[currentGlobalCol];
  
  currentY[currentGlobalCol] += 50 + Object.keys(e.fields).length * 25 + 40;
  
  layerNodeIdx++;
});
