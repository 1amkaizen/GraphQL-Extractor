# GQL Hunter v5

GQL Hunter v5 is a browser-based GraphQL schema recon tool for bug hunters. It parses GraphQL operations found in JavaScript bundles or pasted source, scores risk, builds an interactive schema graph, and generates testing payloads for tools like Burp or Insomnia.

**What this is**
- A single-page, client-side tool (no backend).
- Built with plain HTML/CSS/JS.
- Designed for recon and testing workflows against GraphQL APIs you are authorized to test.

## Features
- Input modes: drag & drop multi-file upload, paste manual source, supported extensions `.js`, `.mjs`, `.ts`, `.txt`, `.map`.
- Operation extraction: finds `query`, `mutation`, `subscription` blocks, captures name/params/body/source, flags ID-like params and sensitive fields.
- Risk scoring (P1–P4): heuristic score based on operation type, ID params, and sensitive fields.
- Operations table: search by name, filter by type/risk, modal detail view per operation.
- Attack Surface map: auto-suggested vectors like IDOR, mutation auth bypass, sensitive field exposure, internal URL exposure, missing auth hints, and subscription leakage.
- Schema visualizer: interactive graph (Cytoscape + Dagre via CDN), click nodes for fields, search + zoom controls.
- Query Builder: pick an operation, preview query, fill variables, copy query/JSON, generate IDOR test template.
- Payload Engine: static payload library + smart generator (single, aliasing, fuzzing, batch) + error-based generator (invalid field, type mismatch, null injection, schema mismatch), supports POST JSON or GET URL with endpoint field.
- Raw output + export: full reconstructed schema report, copy or download `.graphql`, `.json`, `.md`.

## Requirements
- A modern browser (Chrome/Firefox/Edge).
- Internet connection is needed for Cytoscape + Dagre (schema graph) and Google Fonts.

Everything else runs fully offline in the browser.

## Installation
No build or dependencies required.

1. Clone or download this repo.
2. Open `graphql-extractor-v5.html` in your browser.

Optional: serve it locally to avoid file restrictions in some browsers.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/graphql-extractor-v5.html`.

## Usage
1. Open the app in your browser.
2. Choose an input mode (upload JS bundles or paste source).
3. Click **Extract & Analyze**.
4. Explore **Operations**, **Schema Visual**, **Attack Surface**, **Query Builder**, **Payload Engine**, and **Raw Schema**.

### Example flow
1. In your target app, open DevTools → Sources or Network.
2. Save the largest JS bundle (or copy the content).
3. Upload the file or paste it into the app.
4. Click **Extract & Analyze**.
5. Open **Query Builder** to copy a ready query JSON for Burp Repeater.

## Notes & Limitations
- The parser is regex-based and reconstructs schema structure from operations, not from live introspection.
- Risk scoring is heuristic. Use it for prioritization, not as a final verdict.
- The schema graph only includes fields and types observed in extracted operations.
- Schema graph rendering requires CDN access for Cytoscape + Dagre.

## Project Structure
- `graphql-extractor-v5.html` — main UI page.
- `app.js` — core logic (parser, scoring, UI actions).
- `style.css` — styling.
- `payload/` — standalone GraphQL payload samples.

## Legal / Ethics
Use this tool only on systems you own or have explicit permission to test.
