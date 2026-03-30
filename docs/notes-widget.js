// Notes Widget for Scriptable (iOS)
// ─────────────────────────────────
// 1. Install "Scriptable" from the App Store (free)
// 2. Create a new script and paste this code
// 3. Set GITHUB_TOKEN and GIST_ID below
// 4. Add a Scriptable widget to your Home Screen
// 5. Long-press the widget → Edit Widget → choose this script

// ── CONFIG ──
const GITHUB_TOKEN = "YOUR_TOKEN_HERE"; // your GitHub PAT with gist scope
const GIST_ID = "YOUR_GIST_ID_HERE"; // the Gist ID from your Notes sync setup
const WEB_URL = "https://tomasbb0.github.io/notes-app/"; // tap widget to open

// ── FETCH NOTES ──
async function fetchNotes() {
  const req = new Request(`https://api.github.com/gists/${GIST_ID}`);
  req.headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github.v3+json",
  };
  const gist = await req.loadJSON();
  const file = gist.files["notes-data.json"];
  if (!file) return { tabs: [] };
  return JSON.parse(file.content);
}

// ── STRIP HTML ──
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── BUILD WIDGET ──
async function createWidget() {
  const w = new ListWidget();
  w.backgroundColor = new Color("#111111");
  w.url = WEB_URL;

  // Header
  const header = w.addStack();
  header.centerAlignContent();
  header.spacing = 6;

  const logo = header.addText("N");
  logo.font = Font.boldSystemFont(14);
  logo.textColor = Color.white();

  const title = header.addText("NOTES");
  title.font = Font.boldSystemFont(10);
  title.textColor = new Color("#888888");
  title.textOpacity = 0.8;

  header.addSpacer();

  w.addSpacer(6);

  try {
    const data = await fetchNotes();
    const tabs = data.tabs || [];

    if (tabs.length === 0) {
      const empty = w.addText("No notes yet");
      empty.font = Font.regularSystemFont(12);
      empty.textColor = new Color("#555555");
    } else {
      // Show active tab or first tab
      const activeTab = tabs.find((t) => t.id === data.active) || tabs[0];

      // Tab name
      const tabName = w.addText(activeTab.title || "Untitled");
      tabName.font = Font.semiboldSystemFont(13);
      tabName.textColor = Color.white();
      tabName.lineLimit = 1;

      w.addSpacer(4);

      // Tab content preview
      if (activeTab.type === "task" && activeTab.tasks) {
        // Show task items
        const maxTasks = config.widgetFamily === "large" ? 8 : 3;
        for (let i = 0; i < Math.min(activeTab.tasks.length, maxTasks); i++) {
          const task = activeTab.tasks[i];
          const row = w.addStack();
          row.spacing = 6;
          const num = row.addText(`${i + 1}.`);
          num.font = Font.monospacedSystemFont(10);
          num.textColor = new Color("#555555");
          const text = row.addText(task.text || "—");
          text.font = Font.regularSystemFont(11);
          text.textColor = new Color("#cccccc");
          text.lineLimit = 1;
        }
        if (activeTab.tasks.length > maxTasks) {
          const more = w.addText(`+${activeTab.tasks.length - maxTasks} more`);
          more.font = Font.regularSystemFont(9);
          more.textColor = new Color("#555555");
        }
      } else {
        // Show note preview
        const plainText = stripHtml(activeTab.content || "");
        const maxChars = config.widgetFamily === "large" ? 400 : 120;
        const preview =
          plainText.substring(0, maxChars) +
          (plainText.length > maxChars ? "…" : "");
        const content = w.addText(preview || "Empty note");
        content.font = Font.regularSystemFont(11);
        content.textColor = new Color("#cccccc");
        content.minimumScaleFactor = 0.8;
      }

      w.addSpacer(4);

      // Footer: tab count
      const footer = w.addStack();
      footer.centerAlignContent();
      const countText = footer.addText(
        `${tabs.length} tab${tabs.length !== 1 ? "s" : ""}`,
      );
      countText.font = Font.regularSystemFont(9);
      countText.textColor = new Color("#444444");

      footer.addSpacer();

      // Last sync time
      const syncTime = footer.addText("tap to open");
      syncTime.font = Font.regularSystemFont(9);
      syncTime.textColor = new Color("#444444");
    }
  } catch (e) {
    const err = w.addText("Sync error");
    err.font = Font.regularSystemFont(11);
    err.textColor = new Color("#ff4444");
    const detail = w.addText(e.message || "Check token/gist ID");
    detail.font = Font.regularSystemFont(9);
    detail.textColor = new Color("#666666");
  }

  w.addSpacer();
  return w;
}

// ── RUN ──
const widget = await createWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentMedium();
}
Script.complete();
