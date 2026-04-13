const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

global.document = {
  getElementById: () => ({ textContent: '', value: '', style: {}, classList: { add: ()=>{}, remove: ()=>{} }, innerHTML: '', appendChild: ()=>{} }),
  querySelectorAll: () => ([]),
  createElement: () => ({ style: {}, classList: { add: ()=>{}, remove: ()=>{} , toggle: ()=>{} }, appendChild: ()=>{} }),
  addEventListener: () => {}
};
global.window = {
  addEventListener: () => {},
  drawEdges: () => {},
  applyTransform: () => {},
  setTimeout: () => {}
};
global.navigator = { clipboard: { writeText: async ()=>{} } };

eval(code);

const pasteSrc = `query BuildById($buildById: ID!) {
  buildById(id: $buildById) {
    id
    }
    }
  }
}
`;

try {
  let r = parseGraphQL(pasteSrc, false);
  console.log("PARSE OK: ", r.queries.length);
  applyResult(r);
  console.log("APPLY OK.");
} catch(e) {
  console.error("ERROR CAUGHT IN TEST:");
  console.error(e);
}
