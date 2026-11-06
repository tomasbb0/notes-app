// Builds the website (bytarc.com/notes-app) from the app's own index.html.
// Run: node build-web.js
const fs = require("fs");

function swap(html, from, to) {
  if (!html.includes(from)) throw new Error("Not found: " + from);
  return html.replace(from, () => to);
}

let html = fs.readFileSync("index.html", "utf8");
html = swap(
  html,
  '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />',
);
html = swap(html, "<title>Notes</title>", "<title>Notes · by BytArc</title>");
html = swap(html, "</head>", fs.readFileSync("web-head.html", "utf8") + "</head>");
html = swap(
  html,
  "<h1>Notes</h1>",
  '<h1>Notes</h1><a class="bytarc-by bytarc-by--tag" href="https://bytarc.com/" target="_blank" rel="noopener" title="BytArc, an AI studio in Lisbon">by BytArc</a>',
);
fs.writeFileSync("docs/index.html", html);
console.log("docs/index.html built");
