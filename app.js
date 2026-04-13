// ============================================================
// DATA
// ============================================================
const SENSITIVE_KEYS = [
  'email','password','token','secret','key','auth','credential','ssn','phone',
  'apikey','privatekey','accesstoken','refreshtoken','sessiontoken','cookie','jwt','bearer',
  'url','deploymenturl','environmenturl','avatarurl','webhookurl','callbackurl','redirecturl','endpoint',
  'login','username','userid','accountid','orgid','siteid','buildid',
  'commitmessage','commitsha','sha','hash','branch','vendor','repository','repourl','cloneurl',
  'internalip','privateip','hostname','host','server','region',
  'billing','invoice','payment','plan','subscription','tier',
  'log','stacktrace','error','debug','traceid',
  'name','fullname','firstname','lastname','displayname'
];

const STATIC_PAYLOADS = [
  {
    id: 'introspection-mini',
    title: 'Introspection (Mini)',
    desc: 'Ambil tipe root + list semua types untuk recon cepat.',
    payload: `query IntrospectionMini {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types { name kind }
  }
}`
  },
  {
    id: 'root-fields',
    title: 'Root Fields (Query/Mutation)',
    desc: 'Lihat semua field root + argumen untuk pivoting.',
    payload: `query RootFields {
  __schema {
    queryType {
      fields { name args { name type { name kind ofType { name kind } } } }
    }
    mutationType {
      fields { name args { name type { name kind ofType { name kind } } } }
    }
  }
}`
  },
  {
    id: 'type-deep',
    title: 'Type Deep Dive',
    desc: 'Extract semua field & args dari type tertentu.',
    payload: `query TypeDeepDive($typeName: String!) {
  __type(name: $typeName) {
    name
    fields {
      name
      args { name type { name kind ofType { name kind } } }
      type { name kind ofType { name kind } }
    }
  }
}`
  },
  {
    id: 'directives',
    title: 'Directives Map',
    desc: 'Lihat directives & locations yang bisa dipakai.',
    payload: `query DirectivesMap {
  __schema {
    directives {
      name
      locations
      args { name type { name kind ofType { name kind } } }
    }
  }
}`
  },
  {
    id: 'typename-probe',
    title: '__typename Probe',
    desc: 'Probe ringan untuk memastikan endpoint valid.',
    payload: `query TypenameProbe {
  __typename
}`
  }
];

let allData = { queries:[], mutations:[], subscriptions:[], idParams:[], sensitiveFields:[], sourceMap:{}, schemaEntities:{} };
let loadedFiles = [];
let selectedOp = null;
let qbTypeFilter = 'all';
let peSelectedOp = null;
let peTypeFilter = 'all';

// Canvas state
let canvas, ctx, nodes=[], pan={x:0,y:0}, zoom=1, dragging=false, lastMouse={x:0,y:0};

// ============================================================
// NAV
// ============================================================
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.getElementById('nav-'+name).classList.add('active');
  if (name==='visual') setTimeout(renderSchema, 100);
  if (name==='builder') { renderQBList(); filterQBList(); }
  if (name==='payload') { renderPEList(); }
}

// ============================================================
// MODE SWITCH
// ============================================================
function switchMode(mode, btn) {
  document.querySelectorAll('.mode-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('mode-upload').style.display = mode==='upload'?'block':'none';
  document.getElementById('mode-paste').style.display = mode==='paste'?'block':'none';
}

// ============================================================
// DRAG & DROP
// ============================================================
function onDragOver(e){e.preventDefault();document.getElementById('dropzone').classList.add('dragover');}
function onDragLeave(e){document.getElementById('dropzone').classList.remove('dragover');}
function onDrop(e){e.preventDefault();document.getElementById('dropzone').classList.remove('dragover');processFileObjects(Array.from(e.dataTransfer.files));}
function onFileSelect(e){processFileObjects(Array.from(e.target.files));}

function processFileObjects(files) {
  const valid = files.filter(f=>['.js','.mjs','.ts','.txt','.map'].some(ext=>f.name.toLowerCase().endsWith(ext)));
  if(!valid.length){showAlert('Format tidak didukung. Gunakan .js .mjs .ts .txt .map','warn');return;}
  let done=0;
  showProgress(0);
  valid.forEach(file=>{
    const existing=loadedFiles.findIndex(f=>f.name===file.name);
    if(existing!==-1)loadedFiles.splice(existing,1);
    const reader=new FileReader();
    reader.onload=e=>{
      loadedFiles.push({name:file.name,size:file.size,content:e.target.result,ops:0});
      done++;
      showProgress(Math.round(done/valid.length*100));
      if(done===valid.length){setTimeout(hideProgress,500);renderFileList();showAlert(`✅ ${valid.length} file dimuat. Klik Extract & Analyze!`,'success');}
    };
    reader.readAsText(file);
  });
}

function renderFileList() {
  const list=document.getElementById('file-list');
  if(!loadedFiles.length){list.innerHTML='';return;}
  list.innerHTML=loadedFiles.map((f,i)=>{
    const risk=f.ops>10?'high':f.ops>3?'med':'low';
    const riskLabel=f.ops>10?'HIGH':f.ops>3?'MED':'LOW';
    return `<div class="file-item">
      <span class="fi-name" title="${f.name}">${f.name}</span>
      <span class="fi-size">${fmtSize(f.size)}</span>
      <span class="fi-ops">${f.ops} ops</span>
      <span class="fi-risk ${risk}">${riskLabel}</span>
      <button class="fi-del" onclick="removeFile(${i})">✕</button>
    </div>`;
  }).join('');
}

function removeFile(i){loadedFiles.splice(i,1);renderFileList();if(!loadedFiles.length)clearAll();}
function fmtSize(b){return b<1024?b+'B':b<1048576?(b/1024).toFixed(1)+'KB':(b/1048576).toFixed(1)+'MB';}
function showProgress(p){document.getElementById('progress-wrap').classList.add('show');document.getElementById('progress-bar').style.width=p+'%';}
function hideProgress(){document.getElementById('progress-wrap').classList.remove('show');}

// ============================================================
// EXTRACT
// ============================================================
function extractAll(){
  if(!loadedFiles.length){showAlert('Upload file JS dulu bro!','warn');return;}
  const combined=loadedFiles.map(f=>`\n/* ===FILE:${f.name}=== */\n`+f.content).join('\n');
  applyResult(parseGraphQL(combined,true));
  showAlert(`✅ Ekstraksi selesai! Cek Operations & Attack Surface 🎯`,'success');
}
function extractPaste(){
  const txt=document.getElementById('paste-input').value.trim();
  if(!txt){showAlert('Paste JS dulu bro!','warn');return;}
  applyResult(parseGraphQL(txt,false));
  showAlert(`✅ Ekstraksi selesai!`,'success');
}

// ============================================================
// PARSER
// ============================================================

function buildAST(body, operationName, opType) {
  const tokens = body.match(/\{|\}|\w+|\.\.\./g) || [];
  const rootFields = {};
  const stack = [rootFields];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    const top = stack[stack.length-1];
    if (token === '{') {
    } else if (token === '}') {
      if (stack.length > 1) stack.pop(); // NEVER empty the root
    } else if (token === '...') {
      if (i + 2 < tokens.length && tokens[i+1] === 'on') {
        const typeName = tokens[i+2];
        if (top) top[`...on ${typeName}`] = { type: 'object', refName: typeName };
        if (!allData.schemaEntities[typeName]) allData.schemaEntities[typeName] = { name: typeName, type: 'type', fields: {} };
        stack.push(allData.schemaEntities[typeName].fields);
        i += 2;
      }
    } else {
      if (i + 1 < tokens.length && tokens[i+1] === '{') {
        const refName = token.charAt(0).toUpperCase() + token.slice(1);
        if (top) top[token] = { type: 'object', refName };
        if (!allData.schemaEntities[refName]) allData.schemaEntities[refName] = { name: refName, type: 'type', fields: {} };
        stack.push(allData.schemaEntities[refName].fields);
      } else {
        if (top) top[token] = { type: 'scalar' };
      }
    }
    i++;
  }
  
  if (!allData.schemaEntities[operationName]) {
     allData.schemaEntities[operationName] = { name: operationName, type: opType, fields: rootFields };
  } else {
     Object.assign(allData.schemaEntities[operationName].fields, rootFields);
  }
}

function parseGraphQL(input, trackFiles) {
  allData.schemaEntities = {}; // Reset the entities pool for a fresh reconstruction
  const queries=[],mutations=[],subscriptions=[];
  const idParams=[],sensitiveFields=[];
  const seenOps=new Set();
  const sourceMap={};
  const fileMarkers=[];
  const fmRe=/\/\* ===FILE:(.+?)=== \*\//g;
  let fm;
  while((fm=fmRe.exec(input))!==null) fileMarkers.push({name:fm[1],index:fm.index});
  function getSrc(idx){if(!fileMarkers.length)return'paste';let n=fileMarkers[0].name;for(const m of fileMarkers){if(m.index<=idx)n=m.name;else break;}return n;}

  const opRe=/(query|mutation|subscription)\s+(\w+)\s*(\([^)]*\))?\s*\{/g;
  let m;
  while((m=opRe.exec(input))!==null){
    const type=m[1],name=m[2],rawP=m[3]||'';
    if(seenOps.has(name))continue;seenOps.add(name);
    let depth=1,start=m.index+m[0].length,i=start;
    while(i<input.length&&depth>0){if(input[i]==='{')depth++;else if(input[i]==='}')depth--;i++;}
    const body=input.slice(start,i-1).trim();
    const params=rawP.replace(/[()]/g,'').trim();
    const src=getSrc(m.index);
    const opSensitive=[];
    body.split('\n').forEach(line=>{
      const fm2=line.match(/^\s+(\w+)/);
      if(fm2){
        const f=fm2[1].toLowerCase();
        if(['on','id','type','__typename'].includes(f))return;
        if(SENSITIVE_KEYS.some(s=>f===s||f.startsWith(s)||f.endsWith(s)||f.includes(s))){
          if(!opSensitive.includes(fm2[1]))opSensitive.push(fm2[1]);
          if(!sensitiveFields.find(sf=>sf.field===fm2[1]&&sf.operation===name))
            sensitiveFields.push({field:fm2[1],operation:name,src});
        }
      }
    });
    const opIdParams=[];
    params.split(',').forEach(p=>{
      const pm=p.match(/\$(\w+)\s*:/);
      if(pm&&/id|uuid|key/i.test(pm[1])){
        idParams.push({param:`$${pm[1]}`,operation:name,type,src});
        opIdParams.push(`$${pm[1]}`);
      }
    });
    
    buildAST(body, name, type);
    const risk=calcRisk(type,opIdParams,opSensitive);
    const op={type,name,params,body,src,sensitiveFields:opSensitive,idParams:opIdParams,risk};
    if(type==='query')queries.push(op);
    else if(type==='mutation')mutations.push(op);
    else subscriptions.push(op);
    sourceMap[src]=(sourceMap[src]||0)+1;
  }
  if(trackFiles){loadedFiles.forEach(f=>{f.ops=sourceMap[f.name]||0;});renderFileList();}
  return{queries,mutations,subscriptions,idParams,sensitiveFields,sourceMap,schemaEntities:allData.schemaEntities};
}

function calcRisk(type,idParams,sensitive){
  let score=0;
  if(type==='mutation')score+=4;
  else if(type==='subscription')score+=2;
  else score+=1;
  score+=idParams.length*2;
  score+=sensitive.filter(f=>['email','token','password','key','secret','auth'].some(s=>f.toLowerCase().includes(s))).length*2;
  score+=sensitive.length;
  if(score>=8)return'P1';
  if(score>=5)return'P2';
  if(score>=3)return'P3';
  return'P4';
}

function calcTotalRisk(){
  const all=[...allData.queries,...allData.mutations,...allData.subscriptions];
  if(!all.length)return'—';
  const p1=all.filter(o=>o.risk==='P1').length;
  const p2=all.filter(o=>o.risk==='P2').length;
  if(p1>0)return`P1(${p1})`;
  if(p2>0)return`P2(${p2})`;
  return'P3';
}

// ============================================================
// APPLY RESULT
// ============================================================
function applyResult(result){
  allData=result;
  const{queries,mutations,subscriptions,idParams,sensitiveFields}=result;
  document.getElementById('cnt-q').textContent=queries.length;
  document.getElementById('cnt-m').textContent=mutations.length;
  document.getElementById('cnt-s').textContent=subscriptions.length;
  document.getElementById('cnt-id').textContent=idParams.length;
  document.getElementById('cnt-fi').textContent=sensitiveFields.length;
  document.getElementById('cnt-ri').textContent=calcTotalRisk();
  // Update badges
  const total=queries.length+mutations.length+subscriptions.length;
  document.getElementById('badge-ops').textContent=total;
  document.getElementById('badge-attack').textContent=mutations.length>0?'⚠':'!';
  renderOpsTable();
  renderRawOutput();
  renderAttackSurface();
  renderQBList();
  renderPEList();
}

// ============================================================
// OPS TABLE
// ============================================================
function renderOpsTable(filter='',typeFilter='all',riskFilter='all'){
  const all=[...allData.queries,...allData.mutations,...allData.subscriptions];
  const filtered=all.filter(o=>{
    const nameMatch=o.name.toLowerCase().includes(filter.toLowerCase());
    const typeMatch=typeFilter==='all'||o.type===typeFilter;
    const riskMatch=riskFilter==='all'||o.risk===riskFilter;
    return nameMatch&&typeMatch&&riskMatch;
  });
  const tbody=document.getElementById('ops-tbody');
  if(!filtered.length){
    tbody.innerHTML=`<tr><td colspan="6" style="color:var(--muted2);text-align:center;padding:2.5rem;font-family:var(--mono);font-size:12px;">${all.length?'Tidak ada yang cocok filter':'Belum ada data — upload atau paste JS dulu'}</td></tr>`;
    return;
  }
  tbody.innerHTML=filtered.map(o=>`
    <tr>
      <td><span class="risk-pill risk-${o.risk.toLowerCase()}">${o.risk}</span></td>
      <td><span class="type-badge type-${o.type[0]}">${o.type.toUpperCase()}</span></td>
      <td><span class="op-name" onclick="showOpDetail('${o.name}')">${o.name}</span></td>
      <td class="params-cell" title="${o.params}">${o.params||'—'}</td>
      <td>${o.sensitiveFields.length?o.sensitiveFields.slice(0,3).map(f=>`<span style="color:var(--pink);font-size:10px;">${f}</span>`).join(' '):'<span style="color:var(--muted2)">—</span>'}</td>
      <td class="src-cell" title="${o.src}">${o.src}</td>
    </tr>
  `).join('');
}

function filterOps(){
  renderOpsTable(
    document.getElementById('ops-search').value,
    document.getElementById('ops-filter').value,
    document.getElementById('risk-filter').value
  );
}

// ============================================================
// OP DETAIL MODAL
// ============================================================
function showOpDetail(name){
  const all=[...allData.queries,...allData.mutations,...allData.subscriptions];
  const op=all.find(o=>o.name===name);
  if(!op)return;
  const riskColors={P1:'#f43f5e',P2:'#fb923c',P3:'#fbbf24',P4:'#34d399'};
  document.getElementById('modal-title').innerHTML=`<span style="color:${riskColors[op.risk]}">[${op.risk}]</span> ${op.name}`;
  document.getElementById('modal-body').innerHTML=`
    <div style="margin-bottom:14px;">
      <div class="detail-row"><span class="detail-key">Type</span><span class="detail-val">${op.type.toUpperCase()}</span></div>
      <div class="detail-row"><span class="detail-key">Risk</span><span class="detail-val" style="color:${riskColors[op.risk]}">${op.risk}</span></div>
      <div class="detail-row"><span class="detail-key">Params</span><span class="detail-val" style="color:var(--warn)">${op.params||'—'}</span></div>
      <div class="detail-row"><span class="detail-key">IDOR Params</span><span class="detail-val" style="color:var(--danger)">${op.idParams.join(', ')||'—'}</span></div>
      <div class="detail-row"><span class="detail-key">Sensitive</span><span class="detail-val" style="color:var(--pink)">${op.sensitiveFields.join(', ')||'—'}</span></div>
      <div class="detail-row"><span class="detail-key">Source</span><span class="detail-val">${op.src}</span></div>
    </div>
    <div style="font-size:10px;color:var(--muted2);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">Body</div>
    <pre>${op.type} ${op.name}${op.params?'('+op.params+')':''} {\n  ${op.body.split('\n').join('\n  ')}\n}</pre>
  `;
  document.getElementById('modal').classList.add('open');
}
function closeModal(){document.getElementById('modal').classList.remove('open');}

// ============================================================
// VISUAL SCHEMA (CYTOSCAPE.JS MAP)
// ============================================================
let cy = null;

function renderSchema() {
  const container = document.getElementById('cy');
  if(!container) return;
  
  const entities = Object.values(allData.schemaEntities);
  if (!entities.length) {
    container.innerHTML = '<div style="padding:20px; color:var(--muted2); font-family:var(--mono);">Extract schema dulu untuk melihat diagram...</div>';
    return;
  }
  container.innerHTML = '';
  
  const elements = [];
  
  // Add Nodes
  entities.forEach(e => {
    let nodeClass = e.type === 'query' || e.type === 'mutation' || e.type === 'subscription' ? 'rootNode' : 'typeNode';
    if(e.type === 'mutation') nodeClass += ' mutationNode';
    
    elements.push({
      data: { id: e.name, label: e.name, type: e.type, fields: e.fields },
      classes: nodeClass
    });
  });
  
  // Add Edges
  entities.forEach(e => {
    Object.entries(e.fields).forEach(([fName, fDef]) => {
      if (fDef.type === 'object' && allData.schemaEntities[fDef.refName]) {
        elements.push({
          data: {
            id: `edge-${e.name}-${fDef.refName}`,
            source: e.name,
            target: fDef.refName,
            label: fName
          }
        });
      }
    });
  });
  
  try {
    cy = cytoscape({
      container: container,
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'color': '#cbd5e1',
            'font-size': '11px',
            'font-family': 'monospace',
            'text-valign': 'center',
            'text-halign': 'center',
            'background-color': '#1e293b',
            'border-width': 2,
            'border-color': '#334155',
            'width': 'label',
            'height': 'label',
            'padding': '14px',
            'shape': 'round-rectangle',
            'text-outline-width': 0,
            'text-wrap': 'wrap',
            'text-max-width': '150px'
          }
        },
        {
          selector: 'node.rootNode',
          style: {
            'border-color': '#3b82f6',
            'background-color': '#172554',
            'color': '#93c5fd',
            'font-weight': 'bold',
            'border-width': 3
          }
        },
        {
          selector: 'node.mutationNode',
          style: {
            'border-color': '#ef4444',
            'background-color': '#450a0a',
            'color': '#fca5a5'
          }
        },
        {
          selector: 'node.typeNode',
          style: {
            'border-color': '#10b981',
            'background-color': '#022c22',
            'color': '#6ee7b7'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#334155',
            'target-arrow-color': '#334155',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'opacity': 0.6,
            // 'label': 'data(label)',
            // 'font-size': '9px',
            // 'color': '#64748b',
            // 'text-rotation': 'autorotate',
            // 'text-margin-y': -10
          }
        },
        {
          selector: '.highlighted',
          style: {
            'background-color': '#f59e0b',
            'border-color': '#fbbf24',
            'color': '#fff'
          }
        },
        {
          selector: '.highlighted-edge',
          style: {
            'line-color': '#fbbf24',
            'target-arrow-color': '#fbbf24',
            'width': 3,
            'opacity': 1,
            'z-index': 99
          }
        },
        {
          selector: '.dimmed',
          style: {
            'opacity': 0.15
          }
        }
      ],
      layout: {
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: 60,
        edgeSep: 20,
        rankSep: 100
      },
      wheelSensitivity: 0.2
    });
    
    // Interactions
    cy.on('tap', 'node', function(evt){
      const node = evt.target;
      
      // Highlight/Dim logic
      cy.elements().removeClass('highlighted highlighted-edge dimmed');
      cy.elements().addClass('dimmed');
      
      node.removeClass('dimmed');
      node.addClass('highlighted');
      
      const outEdges = node.outgoers('edge');
      const inEdges = node.incomers('edge');
      const outNodes = node.outgoers('node');
      const inNodes = node.incomers('node');
      
      outEdges.removeClass('dimmed').addClass('highlighted-edge');
      inEdges.removeClass('dimmed').addClass('highlighted-edge');
      outNodes.removeClass('dimmed').addClass('highlighted');
      inNodes.removeClass('dimmed').addClass('highlighted');
      
      openCyPanel(node.data());
    });
    
    cy.on('tap', function(evt){
      if(evt.target === cy){
        cy.elements().removeClass('highlighted highlighted-edge dimmed');
        closeCyPanel();
      }
    });

  } catch(e) {
    console.error("Cytoscape init error:", e);
    container.innerHTML = '<div style="color:var(--warn); padding:20px;">Gagal meload Cytoscape layout. Pastikan koneksi internet aktif untuk memuat library CDN.</div>';
  }
}

let cyZoom = 1;
function zoomCanvas(dir){
  if(cy){
    cyZoom = cy.zoom();
    cyZoom += dir*0.2;
    cy.zoom({level: cyZoom, renderedPosition: {x: cy.width()/2, y: cy.height()/2}});
    updateZoomLabel();
  }
}
function resetZoom(){
  if(cy){
    cy.fit();
    cyZoom = cy.zoom();
    updateZoomLabel();
  }
}
function updateZoomLabel(){
  const z = document.getElementById('zoom-label');
  if(z && cy) z.textContent = Math.round(cy.zoom()*100) + '%';
}

function openCyPanel(data) {
  document.getElementById('cy-panel').classList.add('open');
  document.getElementById('cyp-title').textContent = data.id + ' (' + data.type + ')';
  
  let html = '';
  const fields = data.fields;
  if(Object.keys(fields).length === 0) {
    html = '<div style="color:var(--muted2); font-size:12px; font-family:var(--mono);">Tidak ada internal fields</div>';
  } else {
    Object.entries(fields).forEach(([fName, fDef]) => {
      html += `
        <div class="cyp-field" onclick="focusNode('${fDef.type === 'object' ? fDef.refName : ''}')">
          <span class="cyp-field-name">${fName}</span>
          <span class="cyp-field-type ${fDef.type}">${fDef.type === 'object'? fDef.refName : 'Scalar'}</span>
        </div>
      `;
    });
  }
  document.getElementById('cyp-content').innerHTML = html;
}

function closeCyPanel() {
  document.getElementById('cy-panel').classList.remove('open');
}

window.focusNode = function(refName) {
  if(!cy || !refName) return;
  const targetNode = cy.getElementById(refName);
  if(targetNode.length > 0) {
    cy.animate({
      center: { eles: targetNode },
      zoom: 1.5,
      duration: 300
    });
    targetNode.emit('tap'); // Trigger the highlight and panel update!
  } else {
    showAlert('Node tidak ditemukan di grafik!', 'warn');
  }
};

window.searchNode = function() {
  if(!cy) return;
  const val = document.getElementById('cy-search').value.toLowerCase().trim();
  if(!val) return;
  
  const nodes = cy.nodes();
  let target = nodes.filter(n => n.id().toLowerCase() === val || (n.data('label') && n.data('label').toLowerCase() === val));
  if(target.length === 0) {
    target = nodes.filter(n => n.id().toLowerCase().includes(val) || (n.data('label') && n.data('label').toLowerCase().includes(val)));
  }
  
  if(target.length > 0) {
    window.focusNode(target[0].id());
  } else {
    showAlert('Node tidak ditemukan!', 'warn');
  }
};

// No-op for old slider bindings
function syncSliders(){}
function onSliderX(v){}
function onSliderY(v){}

// ============================================================
// ATTACK SURFACE
// ============================================================
function renderAttackSurface(){
  const{queries,mutations,subscriptions,idParams,sensitiveFields}=allData;
  const all=[...queries,...mutations,...subscriptions];
  const vectors=[];

  if(idParams.length){
    vectors.push({p:'p2',label:'P2',title:'IDOR via GraphQL ID Parameters',
      desc:`${idParams.length} operasi memiliki parameter ID ($siteId, $userId, dll). Test dengan menukar ID antar akun milikmu sendiri.`,
      ops:idParams.map(p=>p.operation)});
  }
  if(mutations.length){
    vectors.push({p:'p1',label:'P1',title:'Mutation-based Authorization Bypass',
      desc:`${mutations.length} mutations ditemukan. Coba jalankan mutation akun A dengan resource ID dari akun B. Periksa apakah server memvalidasi ownership.`,
      ops:mutations.map(o=>o.name)});
  }
  const sfOps=[...new Set(sensitiveFields.map(f=>f.operation))];
  if(sfOps.length){
    vectors.push({p:'p3',label:'P3',title:'Sensitive Information Disclosure',
      desc:`${sensitiveFields.length} sensitive fields ditemukan (email, token, url, sha, dll). Cek apakah fields ini ter-return ke user yang tidak berhak.`,
      ops:sfOps});
  }
  const urlFields=sensitiveFields.filter(f=>f.field.toLowerCase().includes('url'));
  if(urlFields.length){
    vectors.push({p:'p2',label:'P2',title:'Internal URL / Endpoint Exposure',
      desc:`Fields seperti deploymentUrl, environmentUrl ter-expose. URL ini bisa mengungkap infrastruktur internal atau environment orang lain.`,
      ops:[...new Set(urlFields.map(f=>f.operation))]});
  }
  const noAuthOps=all.filter(o=>!o.params.includes('token')&&!o.params.includes('auth')&&o.idParams.length>0);
  if(noAuthOps.length){
    vectors.push({p:'p3',label:'P3',title:'Potential Missing Authorization Check',
      desc:`${noAuthOps.length} operasi memiliki ID params tapi tidak ada token/auth di parameter level. Cek apakah authorization dilakukan di server-side.`,
      ops:noAuthOps.map(o=>o.name)});
  }
  if(subscriptions.length){
    vectors.push({p:'p3',label:'P3',title:'Subscription Data Leakage',
      desc:`${subscriptions.length} subscriptions ditemukan. WebSocket subscriptions sering tidak diproteksi dengan baik — cek subscribe ke event orang lain.`,
      ops:subscriptions.map(o=>o.name)});
  }

  const el=document.getElementById('attack-list');
  if(!vectors.length){
    el.innerHTML='<div style="color:var(--muted2);text-align:center;padding:2.5rem;font-family:var(--mono);font-size:12px;">Tidak ada vektor serangan teridentifikasi</div>';
    return;
  }

  const riskColors={P1:'var(--danger)',P2:'#fb923c',P3:'var(--warn)',P4:'var(--accent-dim)'};
  el.innerHTML=vectors.sort((a,b)=>a.label.localeCompare(b.label)).map(v=>`
    <div class="attack-item ${v.p}">
      <div class="attack-priority" style="color:${riskColors[v.label]}">${v.label}</div>
      <div class="attack-content">
        <div class="attack-title">${v.title}</div>
        <div class="attack-desc">${v.desc}</div>
        <div class="attack-ops">${v.ops.slice(0,6).map(o=>`<span class="attack-op-tag">${o}</span>`).join('')}${v.ops.length>6?`<span class="attack-op-tag">+${v.ops.length-6} more</span>`:''}</div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// QUERY BUILDER — with search + filter
// ============================================================
function setQBFilter(type, btn){
  qbTypeFilter=type;
  document.querySelectorAll('.qb-filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  filterQBList();
}

function renderQBList(){
  filterQBList();
}

function filterQBList(){
  const search=(document.getElementById('qb-search')||{}).value||'';
  const all=[...allData.queries,...allData.mutations,...allData.subscriptions];
  const filtered=all.filter(op=>{
    const matchType=qbTypeFilter==='all'||op.type===qbTypeFilter;
    const matchName=op.name.toLowerCase().includes(search.toLowerCase());
    return matchType&&matchName;
  });
  const el=document.getElementById('qb-op-list');
  const countEl=document.getElementById('qb-count');
  countEl.textContent=`${filtered.length} operasi`;
  if(!all.length){el.innerHTML='<div class="qb-empty">Extract schema dulu...</div>';return;}
  if(!filtered.length){el.innerHTML='<div class="qb-empty">Tidak ada yang cocok</div>';return;}
  el.innerHTML=filtered.map(op=>`
    <div class="qb-op-item ${selectedOp&&selectedOp.name===op.name?'selected':''}" onclick="selectQBOp('${op.name}')">
      <span class="type-badge type-${op.type[0]}" style="font-size:9px;padding:1px 6px;">${op.type[0].toUpperCase()}</span>
      <span class="risk-pill risk-${op.risk.toLowerCase()}" style="font-size:9px;padding:1px 6px;">${op.risk}</span>
      <span class="qb-op-name">${op.name}</span>
    </div>
  `).join('');
}

function selectQBOp(name){
  const all=[...allData.queries,...allData.mutations,...allData.subscriptions];
  selectedOp=all.find(o=>o.name===name);
  filterQBList();
  renderQBPreview();
}

// ============================================================
// PAYLOAD HELPERS
// ============================================================
function buildOperationQuery(op, overrides = {}) {
  if(!op) return '';
  const type = overrides.type || op.type;
  const name = overrides.name || op.name;
  const body = overrides.body || op.body || '';
  const params = overrides.params !== undefined ? overrides.params : (op.params || '');
  const pStr = params ? `(\n  ${params.split(',').map(p=>p.trim()).filter(Boolean).join(',\n  ')}\n)` : '';
  return `${type} ${name}${pStr} {\n  ${body.split('\n').join('\n  ')}\n}`;
}

function parseVarDefs(paramStr){
  if(!paramStr) return [];
  return paramStr.split(',').map(p=>p.trim()).filter(Boolean).map(p=>{
    const m=p.match(/\$(\w+)\s*:\s*([!\[\]\w]+)/);
    if(!m) return null;
    return {name:m[1], type:m[2]};
  }).filter(Boolean);
}

function baseType(t){return t.replace(/[[\]!]/g,'');}
function isListType(t){return t.includes('[');}

function defaultValueForType(type, name){
  const base = baseType(type);
  const low = (name||'').toLowerCase();
  let val;
  if(low.includes('id')) val = 'YOUR_ID_HERE';
  else if(base === 'ID') val = 'YOUR_ID_HERE';
  else if(base === 'String') val = 'example';
  else if(base === 'Int') val = 1;
  else if(base === 'Float') val = 1.5;
  else if(base === 'Boolean') val = true;
  else val = {};
  return isListType(type) ? [val] : val;
}

function edgeValueForType(type){
  const base = baseType(type);
  let val;
  if(base === 'Int') val = 0;
  else if(base === 'Float') val = 0.1;
  else if(base === 'Boolean') val = false;
  else if(base === 'ID' || base === 'String') val = '';
  else val = {};
  return isListType(type) ? [val] : val;
}

function longValueForType(type){
  const base = baseType(type);
  let val;
  if(base === 'Int') val = 2147483647;
  else if(base === 'Float') val = 99999.99;
  else if(base === 'Boolean') val = true;
  else if(base === 'ID' || base === 'String') val = 'A'.repeat(64);
  else val = { fuzz: 'A'.repeat(8) };
  return isListType(type) ? [val] : val;
}

function typeMismatchValueForType(type){
  const base = baseType(type);
  let val;
  if(base === 'Int' || base === 'Float') val = 'notANumber';
  else if(base === 'Boolean') val = 'notABool';
  else if(base === 'ID' || base === 'String') val = 12345;
  else val = 12345;
  return isListType(type) ? 'notAList' : val;
}

function buildVariables(op, mode = 'default'){
  const vars = {};
  parseVarDefs(op.params).forEach(v=>{
    if(mode === 'edge') vars[v.name] = edgeValueForType(v.type);
    else if(mode === 'long') vars[v.name] = longValueForType(v.type);
    else if(mode === 'mismatch') vars[v.name] = typeMismatchValueForType(v.type);
    else if(mode === 'null') vars[v.name] = null;
    else vars[v.name] = defaultValueForType(v.type, v.name);
  });
  return vars;
}

function countBraces(line){
  const open=(line.match(/{/g)||[]).length;
  const close=(line.match(/}/g)||[]).length;
  return open - close;
}

function aliasTopLevelFields(body){
  const lines=body.split('\n');
  let depth=0,idx=1;
  const out=[];
  lines.forEach(line=>{
    const trimmed=line.trim();
    const depthBefore=depth;
    if(depthBefore===0 && trimmed && !trimmed.startsWith('...') && /^[A-Za-z_]/.test(trimmed)){
      if(!/^[A-Za-z_]\w*\s*:/.test(trimmed)){
        const m=trimmed.match(/^([A-Za-z_][\w]*)\b/);
        if(m){
          const alias=`a${idx++}`;
          line=line.replace(m[1], `${alias}: ${m[1]}`);
        }
      }
    }
    out.push(line);
    depth += countBraces(line);
  });
  return out.join('\n');
}

function injectInvalidField(body){
  if(!body.trim()) return '__invalidField__';
  return body + '\n  __invalidField__';
}

function renameFirstTopField(body){
  const lines=body.split('\n');
  let depth=0;
  for(let i=0;i<lines.length;i++){
    const trimmed=lines[i].trim();
    if(depth===0 && trimmed && !trimmed.startsWith('...') && /^[A-Za-z_]/.test(trimmed)){
      const m=trimmed.match(/^([A-Za-z_][\w]*)/);
      if(m){
        lines[i]=lines[i].replace(m[1], `__${m[1]}_invalid`);
        return lines.join('\n');
      }
    }
    depth += countBraces(lines[i]);
  }
  return body;
}

function tamperFirstArg(body){
  const lines=body.split('\n');
  let depth=0;
  for(let i=0;i<lines.length;i++){
    const trimmed=lines[i].trim();
    if(depth===0 && trimmed){
      const m=trimmed.match(/^([A-Za-z_][\w]*)\s*\(([^)]*)\)/);
      if(m){
        const args=m[2].split(',').map(a=>a.trim()).filter(Boolean);
        if(args.length){
          const arg0=args[0].replace(/^\w+/, 'nonExistArg');
          const newArgs=[arg0,...args.slice(1)].join(', ');
          lines[i]=lines[i].replace(m[2], newArgs);
          return lines.join('\n');
        }
      }
    }
    depth += countBraces(lines[i]);
  }
  return null;
}

function renderQBPreview(){
  if(!selectedOp){document.getElementById('qb-preview').textContent='// Pilih operasi dari kiri';return;}
  const op=selectedOp;
  document.getElementById('qb-preview').textContent=buildOperationQuery(op);
  const vars=[];
  op.params.split(',').forEach(p=>{
    const m=p.match(/\$(\w+)\s*:\s*([^\s,!]+)/);
    if(m)vars.push({name:m[1],type:m[2]});
  });
  document.getElementById('qb-vars').innerHTML=vars.length?vars.map(v=>`
    <div class="qb-var-row">
      <span class="qb-var-label">$${v.name} (${v.type})</span>
      <input class="qb-var-input" id="var-${v.name}" placeholder="nilai ${v.name}..." value="${v.name.toLowerCase().includes('id')?'YOUR_ID_HERE':''}">
    </div>
  `).join(''):'<span style="color:var(--muted2);font-size:11px;font-family:var(--mono);">Tidak ada variable</span>';
}

function getQBVars(){
  if(!selectedOp)return{};
  const vars={};
  selectedOp.params.split(',').forEach(p=>{
    const m=p.match(/\$(\w+)/);
    if(m){const el=document.getElementById('var-'+m[1]);if(el)vars[m[1]]=el.value||m[1];}
  });
  return vars;
}

function copyQB(){
  if(!selectedOp){showAlert('Pilih operasi dulu!','warn');return;}
  navigator.clipboard.writeText(document.getElementById('qb-preview').textContent)
    .then(()=>showAlert('✅ Query di-copy!','success'));
}
function copyQBJson(){
  if(!selectedOp){showAlert('Pilih operasi dulu!','warn');return;}
  const vars=getQBVars();
  const json=JSON.stringify({query:document.getElementById('qb-preview').textContent,variables:vars},null,2);
  navigator.clipboard.writeText(json).then(()=>showAlert('✅ JSON Burp/Insomnia di-copy!','success'));
}
function genIDORTest(){
  if(!selectedOp){showAlert('Pilih operasi dulu!','warn');return;}
  if(!selectedOp.idParams.length){showAlert('Operasi ini tidak punya ID param!','warn');return;}
  const vars=getQBVars();
  const comment=`# IDOR TEST - ${selectedOp.name}\n# Ganti nilai ID dengan ID dari akun lain\n# Jika response berisi data = IDOR confirmed!\n\n`;
  const q=document.getElementById('qb-preview').textContent;
  const json=JSON.stringify({query:q,variables:vars},null,2);
  navigator.clipboard.writeText(comment+json).then(()=>showAlert('🔴 IDOR test payload di-copy! Paste ke Burp Repeater','warn'));
}

// ============================================================
// PAYLOAD ENGINE
// ============================================================
function renderPayloadLibrary(){
  const wrap=document.getElementById('payload-library');
  if(!wrap) return;
  if(!STATIC_PAYLOADS.length){
    wrap.innerHTML='<div class="payload-empty">Tidak ada payload library</div>';
    return;
  }
  wrap.innerHTML=STATIC_PAYLOADS.map(p=>`
    <div class="payload-card">
      <div class="payload-title">${p.title}</div>
      <div class="payload-desc">${p.desc}</div>
      <div class="payload-code">${escapeHtml(p.payload)}</div>
      <div class="payload-actions">
        <button class="btn btn-ghost btn-sm" onclick="copyStaticPayload('${p.id}')">Copy</button>
      </div>
    </div>
  `).join('');
}

function escapeHtml(str){
  return (str||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function copyStaticPayload(id){
  const p=STATIC_PAYLOADS.find(x=>x.id===id);
  if(!p) return;
  navigator.clipboard.writeText(p.payload).then(()=>showAlert('✅ Payload di-copy!','success'));
}

function setPEFilter(type, btn){
  peTypeFilter=type;
  document.querySelectorAll('[data-pe-type]').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  filterPEList();
}

function renderPEList(){
  filterPEList();
}

function filterPEList(){
  const search=(document.getElementById('pe-search')||{}).value||'';
  const all=[...allData.queries,...allData.mutations,...allData.subscriptions];
  const filtered=all.filter(op=>{
    const matchType=peTypeFilter==='all'||op.type===peTypeFilter;
    const matchName=op.name.toLowerCase().includes(search.toLowerCase());
    return matchType&&matchName;
  });
  const el=document.getElementById('pe-op-list');
  const countEl=document.getElementById('pe-count');
  if(countEl) countEl.textContent=`${filtered.length} operasi`;
  if(!el) return;
  if(!all.length){el.innerHTML='<div class="qb-empty">Extract schema dulu...</div>';return;}
  if(!filtered.length){el.innerHTML='<div class="qb-empty">Tidak ada yang cocok</div>';return;}
  el.innerHTML=filtered.map(op=>`
    <div class="pe-op-item ${peSelectedOp&&peSelectedOp.name===op.name?'selected':''}" onclick="selectPEOp('${op.name}')">
      <span class="type-badge type-${op.type[0]}" style="font-size:9px;padding:1px 6px;">${op.type[0].toUpperCase()}</span>
      <span class="risk-pill risk-${op.risk.toLowerCase()}" style="font-size:9px;padding:1px 6px;">${op.risk}</span>
      <span class="pe-op-name">${op.name}</span>
    </div>
  `).join('');
}

function selectPEOp(name){
  const all=[...allData.queries,...allData.mutations,...allData.subscriptions];
  peSelectedOp=all.find(o=>o.name===name);
  filterPEList();
  renderPESelected();
}

function renderPESelected(){
  const el=document.getElementById('pe-selected-name');
  if(el) el.textContent=peSelectedOp?peSelectedOp.name:'—';
}

function buildPayloadJson(query, variables){
  return JSON.stringify({query,variables},null,2);
}

function generateSmartPayload(){
  if(!peSelectedOp){showAlert('Pilih operasi dulu!','warn');return;}
  const op=peSelectedOp;
  const opts={
    single:document.getElementById('pe-opt-single')?.checked,
    alias:document.getElementById('pe-opt-alias')?.checked,
    fuzz:document.getElementById('pe-opt-fuzz')?.checked,
    batch:document.getElementById('pe-opt-batch')?.checked
  };
  if(!opts.single&&!opts.alias&&!opts.fuzz&&!opts.batch){
    showAlert('Pilih minimal satu mode payload!','warn');return;
  }
  const blocks=[];
  const baseQuery=buildOperationQuery(op);

  if(opts.single){
    blocks.push(`# SINGLE REQUEST\n${baseQuery}`);
  }
  if(opts.alias){
    const aliasBody=aliasTopLevelFields(op.body||'');
    const aliasQuery=buildOperationQuery(op,{name:op.name+'Alias',body:aliasBody});
    blocks.push(`# ALIASING VERSION\n${aliasQuery}`);
  }
  if(opts.fuzz){
    const fuzzSets=[
      {label:'EDGE_VALUES',vars:buildVariables(op,'edge')},
      {label:'LONG_VALUES',vars:buildVariables(op,'long')},
      {label:'NULL_INJECTION',vars:buildVariables(op,'null')}
    ];
    blocks.push(`# VARIABLE FUZZING (${fuzzSets.length} variants)`);
    fuzzSets.forEach(s=>{
      blocks.push(`# ${s.label}\n${buildPayloadJson(baseQuery,s.vars)}`);
    });
  }
  if(opts.batch){
    const varsA=buildVariables(op,'default');
    const varsB=buildVariables(op,'edge');
    const batch=JSON.stringify([{query:baseQuery,variables:varsA},{query:baseQuery,variables:varsB}],null,2);
    blocks.push(`# BATCH REQUEST\n${batch}`);
  }
  const out=document.getElementById('pe-output');
  if(out) out.textContent=blocks.join('\n\n');
}

function generateErrorPayload(){
  if(!peSelectedOp){showAlert('Pilih operasi dulu!','warn');return;}
  const op=peSelectedOp;
  const opts={
    invalid:document.getElementById('pe-err-invalid')?.checked,
    mismatch:document.getElementById('pe-err-typemismatch')?.checked,
    nullinj:document.getElementById('pe-err-null')?.checked,
    schema:document.getElementById('pe-err-schema')?.checked
  };
  if(!opts.invalid&&!opts.mismatch&&!opts.nullinj&&!opts.schema){
    showAlert('Pilih minimal satu jenis error payload!','warn');return;
  }
  const blocks=[];
  const baseQuery=buildOperationQuery(op);

  if(opts.invalid){
    const invalidBody=injectInvalidField(op.body||'');
    const invalidQuery=buildOperationQuery(op,{name:op.name+'Invalid',body:invalidBody});
    blocks.push(`# INVALID FIELD\n${invalidQuery}`);
  }
  if(opts.mismatch){
    if(op.params){
      const mismatchVars=buildVariables(op,'mismatch');
      blocks.push(`# TYPE MISMATCH\n${buildPayloadJson(baseQuery,mismatchVars)}`);
    } else {
      blocks.push('# TYPE MISMATCH\n# Operasi ini tidak memiliki variable untuk dimismatch.');
    }
  }
  if(opts.nullinj){
    if(op.params){
      const nullVars=buildVariables(op,'null');
      blocks.push(`# NULL INJECTION\n${buildPayloadJson(baseQuery,nullVars)}`);
    } else {
      blocks.push('# NULL INJECTION\n# Operasi ini tidak memiliki variable untuk di-null-kan.');
    }
  }
  if(opts.schema){
    const tampered=tamperFirstArg(op.body||'') || renameFirstTopField(op.body||'');
    const schemaQuery=buildOperationQuery(op,{name:op.name+'SchemaMismatch',body:tampered});
    blocks.push(`# SCHEMA MISMATCH\n${schemaQuery}`);
  }

  const out=document.getElementById('pe-error-output');
  if(out) out.textContent=blocks.join('\n\n');
}

function copyPEOutput(){
  const el=document.getElementById('pe-output');
  if(!el){return;}
  navigator.clipboard.writeText(el.textContent).then(()=>showAlert('✅ Payload di-copy!','success'));
}

function copyPEErrorOutput(){
  const el=document.getElementById('pe-error-output');
  if(!el){return;}
  navigator.clipboard.writeText(el.textContent).then(()=>showAlert('✅ Error payload di-copy!','success'));
}

// ============================================================
// RAW OUTPUT
// ============================================================
function renderRawOutput(){
  const{queries,mutations,subscriptions,idParams,sensitiveFields}=allData;
  const lines=[];
  lines.push('# ================================================');
  lines.push('# GQL HUNTER v4 — SCHEMA RECONSTRUCTION REPORT');
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Queries: ${queries.length} | Mutations: ${mutations.length} | Subscriptions: ${subscriptions.length}`);
  lines.push(`# IDOR Candidates: ${idParams.length} | Sensitive Fields: ${sensitiveFields.length}`);
  lines.push(`# Risk Level: ${calcTotalRisk()}`);
  lines.push('# ================================================\n');
  if(queries.length){lines.push('# ====== QUERIES ======\n');queries.forEach(o=>{lines.push(`# [${o.risk}] src: ${o.src}`);lines.push(`query ${o.name}${o.params?'('+o.params+')':''} {\n  ${o.body.split('\n').join('\n  ')}\n}\n`);});}
  if(mutations.length){lines.push('# ====== MUTATIONS [CRITICAL] ======\n');mutations.forEach(o=>{lines.push(`# [${o.risk}] src: ${o.src}`);lines.push(`mutation ${o.name}${o.params?'('+o.params+')':''} {\n  ${o.body.split('\n').join('\n  ')}\n}\n`);});}
  if(subscriptions.length){lines.push('# ====== SUBSCRIPTIONS ======\n');subscriptions.forEach(o=>{lines.push(`# [${o.risk}] src: ${o.src}`);lines.push(`subscription ${o.name}${o.params?'('+o.params+')':''} {\n  ${o.body.split('\n').join('\n  ')}\n}\n`);});}
  if(idParams.length){lines.push('\n# ====== IDOR CANDIDATES ======');idParams.forEach(p=>lines.push(`# [${p.type.toUpperCase()}] ${p.operation} → ${p.param} | ${p.src}`));}
  if(sensitiveFields.length){lines.push('\n# ====== SENSITIVE FIELDS ======');sensitiveFields.forEach(f=>lines.push(`# ${f.field} in ${f.operation} | ${f.src}`));}
  document.getElementById('raw-output').textContent=lines.join('\n');
}

// ============================================================
// EXPORT
// ============================================================
function copyRaw(){navigator.clipboard.writeText(document.getElementById('raw-output').textContent).then(()=>showAlert('✅ Schema di-copy!','success'));}
function dlGraphql(){dl(document.getElementById('raw-output').textContent,'schema-'+Date.now()+'.graphql','text/plain');}
function dlJson(){
  const{queries,mutations,subscriptions,idParams,sensitiveFields}=allData;
  dl(JSON.stringify({queries,mutations,subscriptions,idParams,sensitiveFields},null,2),'schema-'+Date.now()+'.json','application/json');
}
function dlReport(){
  const{queries,mutations,subscriptions,idParams,sensitiveFields}=allData;
  const all=[...queries,...mutations,...subscriptions];
  let md=`# GQL Hunter v4 — Bug Hunting Report\n\n**Generated:** ${new Date().toLocaleString()}\n\n`;
  md+=`## Summary\n| Metric | Count |\n|--------|-------|\n`;
  md+=`| Queries | ${queries.length} |\n| Mutations | ${mutations.length} |\n| Subscriptions | ${subscriptions.length} |\n`;
  md+=`| IDOR Candidates | ${idParams.length} |\n| Sensitive Fields | ${sensitiveFields.length} |\n| Risk Level | ${calcTotalRisk()} |\n\n`;
  md+=`## Operations by Risk\n\n`;
  ['P1','P2','P3','P4'].forEach(r=>{
    const ops=all.filter(o=>o.risk===r);
    if(!ops.length)return;
    md+=`### ${r} (${ops.length} operations)\n`;
    ops.forEach(o=>md+=`- \`${o.type} ${o.name}\` — params: ${o.params||'none'} — sensitive: ${o.sensitiveFields.join(', ')||'none'}\n`);
    md+='\n';
  });
  md+=`## IDOR Candidates\n`;
  idParams.forEach(p=>md+=`- \`${p.operation}\` → \`${p.param}\` (${p.type})\n`);
  md+=`\n## Sensitive Fields\n`;
  sensitiveFields.forEach(f=>md+=`- \`${f.field}\` in \`${f.operation}\`\n`);
  dl(md,'report-'+Date.now()+'.md','text/markdown');
}
function dl(content,filename,type){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([content],{type}));
  a.download=filename;a.click();
  showAlert('✅ File didownload!','success');
}

// ============================================================
// CLEAR
// ============================================================
function clearFiles(){loadedFiles=[];document.getElementById('file-list').innerHTML='';document.getElementById('fileInput').value='';showAlert('File list dikosongkan','warn');}
function clearAll(){
  loadedFiles=[];
  allData={queries:[],mutations:[],subscriptions:[],idParams:[],sensitiveFields:[],sourceMap:{},schemaEntities:{}};
  selectedOp=null;
  peSelectedOp=null;
  document.getElementById('file-list').innerHTML='';
  document.getElementById('fileInput').value='';
  document.getElementById('paste-input').value='';
  document.getElementById('raw-output').textContent='// Hasil rekonstruksi schema akan muncul di sini...';
  ['cnt-q','cnt-m','cnt-s','cnt-id','cnt-fi'].forEach(id=>document.getElementById(id).textContent='0');
  document.getElementById('cnt-ri').textContent='—';
  document.getElementById('badge-ops').textContent='0';
  document.getElementById('ops-tbody').innerHTML='<tr><td colspan="6" style="color:var(--muted2);text-align:center;padding:2.5rem;font-family:var(--mono);font-size:12px;">Belum ada data</td></tr>';
  document.getElementById('attack-list').innerHTML='<div style="color:var(--muted2);font-size:13px;text-align:center;padding:2.5rem;">Extract schema dulu</div>';
  document.getElementById('qb-op-list').innerHTML='<div class="qb-empty">Extract schema dulu...</div>';
  document.getElementById('qb-preview').textContent='// Pilih operasi dari kiri';
  document.getElementById('qb-vars').innerHTML='<span style="color:var(--muted2);font-size:11px;font-family:var(--mono);">Pilih operasi dulu</span>';
  document.getElementById('qb-count').textContent='0 operasi';
  const peList=document.getElementById('pe-op-list');
  if(peList) peList.innerHTML='<div class="qb-empty">Extract schema dulu...</div>';
  const peCount=document.getElementById('pe-count');
  if(peCount) peCount.textContent='0 operasi';
  const peSel=document.getElementById('pe-selected-name');
  if(peSel) peSel.textContent='—';
  const peOut=document.getElementById('pe-output');
  if(peOut) peOut.textContent='// Pilih operasi untuk generate payload otomatis';
  const peErr=document.getElementById('pe-error-output');
  if(peErr) peErr.textContent='// Generate payload invalid untuk recon via error response';
}

// ============================================================
// ALERT TOAST
// ============================================================
function showAlert(msg,type){
  const a=document.getElementById('alert');
  a.textContent=msg;
  const c={
    success:{color:'var(--success)',border:'rgba(52,211,153,0.3)',bg:'rgba(52,211,153,0.08)'},
    warn:{color:'var(--warn)',border:'rgba(251,146,60,0.3)',bg:'rgba(251,146,60,0.08)'},
    danger:{color:'var(--danger)',border:'rgba(244,63,94,0.3)',bg:'rgba(244,63,94,0.08)'}
  };
  const col=c[type]||c.success;
  a.style.cssText=`color:${col.color};border-color:${col.border};background:${col.bg};`;
  a.classList.add('show');
  clearTimeout(a._t);
  a._t=setTimeout(()=>a.classList.remove('show'),4000);
}

// ============================================================
// EXAMPLE DATA
// ============================================================
function loadExampleFiles(){
  const content=`query AutopilotNavInfo($siteId: ID!) {
  site(id: $siteId) { id autopilot { isConfigured } }
}
query AutopilotSiteSettings($siteId: ID!) {
  site(id: $siteId) {
    id autopilot {
      settings { areModuleUpdatesEnabled areThemeUpdatesEnabled deploymentDestination updateFrequency }
      unlistable { environmentVariables { buildStep } }
    }
  }
}
query BuildById($buildById: ID!) {
  buildById(id: $buildById) {
    id label status lastUpdateTime
    repository { name id url vendor }
    triggeredBy {
      ... on User { id name avatarUrl email }
      ... on VCSUser { avatarUrl vendor name id login }
    }
    triggerMethod commitSHA deploymentUrl environmentUrl
  }
}
query CmsCommitLogs($env: String!, $siteId: ID!) {
  cmsSite(id: $siteId) {
    environment(environment: $env) {
      commitLog { author email commitSha message hasBuildLog }
    }
  }
}
mutation UpdateAutopilotSettings($siteId: ID!, $input: AutopilotSettingsInput!) {
  updateAutopilotSettings(siteId: $siteId, input: $input) { success errors }
}
mutation DeleteSite($siteId: ID!, $userId: ID!) {
  deleteSite(id: $siteId, userId: $userId) { success }
}
mutation TransferSiteOwnership($siteId: ID!, $newOwnerId: ID!) {
  transferSiteOwnership(siteId: $siteId, newOwnerId: $newOwnerId) { success message }
}
query GetUserProfile($userId: ID!) {
  user(id: $userId) { id email token organizations { id name } }
}
subscription BuildStatusUpdated($buildId: ID!) {
  buildStatusUpdated(buildId: $buildId) { id status deploymentUrl }
}`;
  loadedFiles=[{name:'bundle-example.js',size:content.length,content,ops:0}];
  renderFileList();
  showAlert('✅ Example dimuat! Klik Extract & Analyze','success');
}

function loadExamplePaste(){
  document.getElementById('paste-input').value=`query BuildById($buildById: ID!) {
  buildById(id: $buildById) {
    id label status commitSHA deploymentUrl environmentUrl
    triggeredBy { ... on User { id name email } }
  }
}
mutation DeleteSite($siteId: ID!, $userId: ID!) {
  deleteSite(id: $siteId, userId: $userId) { success }
}
query GetUserProfile($userId: ID!) {
  user(id: $userId) { id email token organizations { id name } }
}`;
  extractPaste();
}

// Keyboard shortcut: Escape closes modal
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});

// ============================================================
// EVENT LISTENERS INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('logo-input')?.addEventListener('click', () => showPage('input'));
  ['nav-input', 'nav-ops', 'nav-visual', 'nav-attack', 'nav-builder', 'nav-payload', 'nav-raw'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => showPage(id.replace('nav-', '')));
  });
  document.getElementById('nav-clear')?.addEventListener('click', clearAll);

  // Tabs
  document.getElementById('mode-tab-upload')?.addEventListener('click', function() { switchMode('upload', this); });
  document.getElementById('mode-tab-paste')?.addEventListener('click', function() { switchMode('paste', this); });

  // Dropzone
  const dz = document.getElementById('dropzone');
  if (dz) {
    dz.addEventListener('dragover', onDragOver);
    dz.addEventListener('dragleave', onDragLeave);
    dz.addEventListener('drop', onDrop);
  }
  document.getElementById('fileInput')?.addEventListener('change', onFileSelect);

  // Upload actions
  document.getElementById('btn-extract-all')?.addEventListener('click', extractAll);
  document.getElementById('btn-load-example-files')?.addEventListener('click', loadExampleFiles);
  document.getElementById('btn-clear-files')?.addEventListener('click', clearFiles);

  // Paste actions
  document.getElementById('btn-extract-paste')?.addEventListener('click', extractPaste);
  document.getElementById('btn-load-example-paste')?.addEventListener('click', loadExamplePaste);
  document.getElementById('btn-clear-paste')?.addEventListener('click', () => {
    const el = document.getElementById('paste-input');
    if (el) el.value = '';
  });

  // Ops Filters
  document.getElementById('ops-search')?.addEventListener('input', filterOps);
  document.getElementById('ops-filter')?.addEventListener('change', filterOps);
  document.getElementById('risk-filter')?.addEventListener('change', filterOps);

  // QB Filters
  document.getElementById('qb-search')?.addEventListener('input', filterQBList);
  document.querySelectorAll('.qb-filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      setQBFilter(this.getAttribute('data-type'), this);
    });
  });

  // QB Actions
  document.getElementById('btn-copy-qb')?.addEventListener('click', copyQB);
  document.getElementById('btn-copy-qb-json')?.addEventListener('click', copyQBJson);
  document.getElementById('btn-gen-idor-test')?.addEventListener('click', genIDORTest);

  // Payload Engine
  renderPayloadLibrary();
  document.getElementById('pe-search')?.addEventListener('input', filterPEList);
  document.querySelectorAll('[data-pe-type]').forEach(btn => {
    btn.addEventListener('click', function() {
      setPEFilter(this.getAttribute('data-pe-type'), this);
    });
  });
  document.getElementById('btn-pe-generate')?.addEventListener('click', generateSmartPayload);
  document.getElementById('btn-pe-copy')?.addEventListener('click', copyPEOutput);
  document.getElementById('btn-pe-gen-error')?.addEventListener('click', generateErrorPayload);
  document.getElementById('btn-pe-copy-error')?.addEventListener('click', copyPEErrorOutput);

  // Raw Actions
  document.getElementById('btn-copy-raw')?.addEventListener('click', copyRaw);
  document.getElementById('btn-dl-graphql')?.addEventListener('click', dlGraphql);
  document.getElementById('btn-dl-json')?.addEventListener('click', dlJson);
  document.getElementById('btn-dl-report')?.addEventListener('click', dlReport);

  // Modal
  const mod = document.getElementById('modal');
  if(mod) mod.addEventListener('click', e => { if(e.target === mod) closeModal(); });
  document.getElementById('btn-modal-close')?.addEventListener('click', closeModal);
  // Canvas Controls
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => zoomCanvas(1));
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => zoomCanvas(-1));
  document.getElementById('btn-reset-zoom')?.addEventListener('click', resetZoom);
  document.getElementById('slider-x')?.addEventListener('input', e => onSliderX(e.target.value));
  document.getElementById('slider-y')?.addEventListener('input', e => onSliderY(e.target.value));
});
