const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  session,
  systemPreferences,
} = require("electron");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

let mainWindow;
let isCollapsed = false;
let expandedBounds = null; // remember size/pos before collapse

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 340,
    height: 520,
    minWidth: 240,
    minHeight: 200,
    alwaysOnTop: true,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#111111",
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile("index.html");

  // Enable DevTools shortcut (Cmd+Option+I)
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.meta && input.alt && input.key.toLowerCase() === "i") {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Make it float above ALL windows including fullscreen on macOS
  applyAlwaysOnTop();

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
}

function applyAlwaysOnTop() {
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });
  mainWindow.setFullScreenable(false);
}

// ── IPC handlers ──

ipcMain.handle("toggle-always-on-top", () => {
  const current = mainWindow.isAlwaysOnTop();
  if (current) {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setVisibleOnAllWorkspaces(false);
  } else {
    // Re-do dock hide/show to restore accessory process type
    if (process.platform === "darwin") {
      app.dock.hide();
      setTimeout(() => app.dock.show(), 200);
    }
    applyAlwaysOnTop();
  }
  return !current;
});

ipcMain.handle("get-always-on-top", () => {
  return mainWindow.isAlwaysOnTop();
});

ipcMain.handle("collapse", () => {
  if (!isCollapsed) {
    expandedBounds = mainWindow.getBounds();
    mainWindow.setMinimumSize(60, 60);
    mainWindow.setSize(60, 60);
    // Keep at same position (top-right corner of where it was)
    const b = expandedBounds;
    mainWindow.setPosition(b.x + b.width - 60, b.y);
    mainWindow.setResizable(false);
    // Hide traffic lights when collapsed
    if (process.platform === "darwin") {
      mainWindow.setWindowButtonVisibility(false);
    }
    isCollapsed = true;
  }
  return true;
});

ipcMain.handle("expand", () => {
  if (isCollapsed) {
    const collapsed = mainWindow.getBounds();
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(240, 200);
    const w = expandedBounds ? expandedBounds.width : 340;
    const h = expandedBounds ? expandedBounds.height : 520;
    // Expand from where the collapsed square currently is
    mainWindow.setBounds({
      x: collapsed.x + 60 - w,
      y: collapsed.y,
      width: w,
      height: h,
    });
    // Restore traffic lights
    if (process.platform === "darwin") {
      mainWindow.setWindowButtonVisibility(true);
    }
    isCollapsed = false;
  }
  return true;
});

ipcMain.handle("is-collapsed", () => isCollapsed);

ipcMain.handle("get-position", () => {
  const bounds = mainWindow.getBounds();
  return [bounds.x, bounds.y];
});

ipcMain.handle("set-position", (_, x, y) => {
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: bounds.width,
    height: bounds.height,
  });
});

// ── APP SNAPSHOT: capture active windows/apps ──
function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    exec(
      `osascript -e '${script.replace(/'/g, "'\\''")}'`,
      { timeout: 10000 },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      },
    );
  });
}

ipcMain.handle("capture-snapshot", async () => {
  if (process.platform !== "darwin") return [];
  try {
    // Get list of visible apps with their windows
    const script = `
set appList to ""
tell application "System Events"
  set activeApps to (every process whose visible is true and background only is false)
  repeat with proc in activeApps
    set appName to name of proc
    set bundleId to bundle identifier of proc
    if bundleId is not missing value then
      set appList to appList & appName & "|||" & bundleId & "\\n"
    end if
  end repeat
end tell
return appList`;
    const result = await runAppleScript(script);
    const apps = result
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, bundleId] = line.split("|||");
        return { name: name?.trim(), bundleId: bundleId?.trim() };
      })
      .filter(
        (a) => a.name && a.bundleId && a.bundleId !== "com.tomasbatalha.notes",
      );

    // Try to get Chrome URLs if Chrome is running
    const chromeApp = apps.find((a) => a.bundleId === "com.google.Chrome");
    if (chromeApp) {
      try {
        const chromeScript = `
set urlList to ""
tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      set urlList to urlList & (URL of t) & "|||" & (title of t) & "\\n"
    end repeat
  end repeat
end tell
return urlList`;
        const urls = await runAppleScript(chromeScript);
        chromeApp.tabs = urls
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [url, title] = line.split("|||");
            return { url: url?.trim(), title: title?.trim() };
          });
      } catch (e) {
        /* Chrome not accessible */
      }
    }

    // Try Safari too
    const safariApp = apps.find((a) => a.bundleId === "com.apple.Safari");
    if (safariApp) {
      try {
        const safariScript = `
set urlList to ""
tell application "Safari"
  repeat with w in windows
    repeat with t in tabs of w
      set urlList to urlList & (URL of t) & "|||" & (name of t) & "\\n"
    end repeat
  end repeat
end tell
return urlList`;
        const urls = await runAppleScript(safariScript);
        safariApp.tabs = urls
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [url, title] = line.split("|||");
            return { url: url?.trim(), title: title?.trim() };
          });
      } catch (e) {
        /* Safari not accessible */
      }
    }

    return apps;
  } catch (e) {
    console.error("Snapshot capture failed:", e);
    return [];
  }
});

ipcMain.handle("restore-snapshot", async (_, snapshot) => {
  if (process.platform !== "darwin" || !Array.isArray(snapshot)) return false;
  try {
    // 1. Get currently running apps so we don't disturb them
    const runningScript = `
tell application "System Events"
  set bList to ""
  set procs to (every process whose background only is false)
  repeat with p in procs
    set bid to bundle identifier of p
    if bid is not missing value then
      set bList to bList & bid & "\\n"
    end if
  end repeat
end tell
return bList`;
    const runningResult = await runAppleScript(runningScript);
    const runningSet = new Set(
      runningResult
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    );

    // 2. Separate Chrome/Safari (browser) apps from generic apps
    const browsers = snapshot.filter(
      (a) =>
        a.bundleId === "com.google.Chrome" || a.bundleId === "com.apple.Safari",
    );
    const others = snapshot.filter(
      (a) =>
        a.bundleId !== "com.google.Chrome" && a.bundleId !== "com.apple.Safari",
    );

    // 3. Open any NOT-yet-running generic apps (no activation — just open them)
    for (const app of others) {
      if (!runningSet.has(app.bundleId)) {
        try {
          exec(`open -b "${app.bundleId}"`);
        } catch (e) {
          /* skip */
        }
      }
    }

    // 4. Handle Chrome tab restoration in one batch
    const chrome = browsers.find((a) => a.bundleId === "com.google.Chrome");
    if (chrome && chrome.tabs && chrome.tabs.length > 0) {
      const isRunning = runningSet.has("com.google.Chrome");
      if (!isRunning) {
        await runAppleScript(`tell application "Google Chrome" to activate`);
        await new Promise((r) => setTimeout(r, 2000));
      }
      // Build a single AppleScript that opens all missing tabs at once
      const urlList = chrome.tabs.map((t) => `"${t.url}"`).join(", ");
      const batchScript = `
tell application "Google Chrome"
  set existingURLs to {}
  repeat with w in windows
    repeat with t in tabs of w
      set end of existingURLs to (URL of t)
    end repeat
  end repeat
  set urlsToOpen to {${urlList}}
  repeat with u in urlsToOpen
    if existingURLs does not contain (u as text) then
      tell window 1 to make new tab with properties {URL:u}
    end if
  end repeat
end tell`;
      try {
        await runAppleScript(batchScript);
      } catch (e) {
        console.error("Chrome tab restore error:", e.message);
      }
    }

    // 5. Handle Safari tab restoration in one batch
    const safari = browsers.find((a) => a.bundleId === "com.apple.Safari");
    if (safari && safari.tabs && safari.tabs.length > 0) {
      const isRunning = runningSet.has("com.apple.Safari");
      if (!isRunning) {
        await runAppleScript(`tell application "Safari" to activate`);
        await new Promise((r) => setTimeout(r, 2000));
      }
      const urlList = safari.tabs.map((t) => `"${t.url}"`).join(", ");
      const batchScript = `
tell application "Safari"
  set existingURLs to {}
  repeat with w in windows
    repeat with t in tabs of w
      set end of existingURLs to (URL of t)
    end repeat
  end repeat
  set urlsToOpen to {${urlList}}
  repeat with u in urlsToOpen
    if existingURLs does not contain (u as text) then
      tell window 1 to make new tab with properties {URL:u}
    end if
  end repeat
end tell`;
      try {
        await runAppleScript(batchScript);
      } catch (e) {
        console.error("Safari tab restore error:", e.message);
      }
    }

    return true;
  } catch (e) {
    console.error("Snapshot restore failed:", e);
    return false;
  }
});

// ── FLOATING NOTE (teleprompter) ──
const floatWindows = new Map(); // note id -> BrowserWindow
const floatNotes = new Map(); // note id -> { id, title, html }

function tpConfigPath() {
  return path.join(app.getPath("userData"), "teleprompter.json");
}
const TP_DEFAULTS = {
  openaiKey: "",
  language: "en",
  wpm: 130,
  fontSize: 22,
  mode: "ai",
  bounds: null,
};
function readTpConfig() {
  try {
    return Object.assign(
      {},
      TP_DEFAULTS,
      JSON.parse(fs.readFileSync(tpConfigPath(), "utf8")),
    );
  } catch (e) {
    return Object.assign({}, TP_DEFAULTS);
  }
}
function writeTpConfig(patch) {
  const cfg = Object.assign(readTpConfig(), patch || {});
  // The key lives only in this private file, never in the synced notes data
  fs.writeFileSync(tpConfigPath(), JSON.stringify(cfg, null, 2), {
    mode: 0o600,
  });
  return cfg;
}

async function mintRealtimeSecret(cfg, hint) {
  if (!cfg.openaiKey) throw new Error("No OpenAI API key set. Add it in Settings.");
  const transcription = { model: "gpt-live-transcribe" };
  if (cfg.language && cfg.language !== "auto")
    transcription.language = cfg.language;
  const attempt = async (withPrompt) => {
    const t = Object.assign({}, transcription);
    if (withPrompt && hint) t.prompt = hint;
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + cfg.openaiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "transcription",
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24000 },
              transcription: t,
              turn_detection: null,
            },
          },
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.value) {
      const msg =
        (json.error && json.error.message) || "OpenAI error " + res.status;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return json.value;
  };
  try {
    return await attempt(true);
  } catch (e) {
    if (hint && e.status === 400) return attempt(false);
    throw e;
  }
}

function createFloatWindow(note) {
  const existing = floatWindows.get(note.id);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    existing.webContents.send("float-note", note);
    return;
  }
  const cfg = readTpConfig();
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  const w = 560,
    h = 230;
  let bounds = {
    x: Math.round(wa.x + (wa.width - w) / 2),
    y: wa.y,
    width: w,
    height: h,
  };
  if (cfg.bounds && cfg.bounds.width) {
    const b = cfg.bounds;
    const onScreen = screen
      .getAllDisplays()
      .some(
        (d) =>
          b.x < d.bounds.x + d.bounds.width &&
          b.x + b.width > d.bounds.x &&
          b.y < d.bounds.y + d.bounds.height &&
          b.y + 40 > d.bounds.y,
      );
    if (onScreen) bounds = b;
  }
  // Cascade when several floating notes are open
  const offset = floatWindows.size * 24;
  const win = new BrowserWindow({
    x: bounds.x + offset,
    y: bounds.y + offset,
    width: bounds.width,
    height: bounds.height,
    minWidth: 200,
    minHeight: 70,
    frame: false,
    hasShadow: true,
    alwaysOnTop: true,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: "#0e0e0e",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });
  win.loadFile("floating.html", { query: { id: note.id } });
  win.once("ready-to-show", () => win.show());
  win.webContents.on("before-input-event", (event, input) => {
    if (input.meta && input.alt && input.key.toLowerCase() === "i") {
      win.webContents.toggleDevTools();
    }
  });
  let saveT = null;
  const remember = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      if (!win.isDestroyed()) writeTpConfig({ bounds: win.getBounds() });
    }, 400);
  };
  win.on("moved", remember);
  win.on("resized", remember);
  win.on("closed", () => {
    clearTimeout(saveT);
    floatWindows.delete(note.id);
  });
  floatWindows.set(note.id, win);
}

ipcMain.handle("float-open", (_, note) => {
  if (!note || !note.id) return false;
  floatNotes.set(note.id, note);
  createFloatWindow(note);
  return true;
});

ipcMain.handle("float-note-updated", (_, note) => {
  if (!note || !note.id) return false;
  floatNotes.set(note.id, note);
  const win = floatWindows.get(note.id);
  if (win && !win.isDestroyed()) win.webContents.send("float-note", note);
  return true;
});

ipcMain.handle("float-get-note", (_, id) => floatNotes.get(id) || null);

ipcMain.handle("float-close", (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && win !== mainWindow) win.close();
});

ipcMain.handle("float-get-bounds", (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  return win ? win.getBounds() : null;
});

ipcMain.on("float-move", (e, x, y) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && win !== mainWindow) win.setPosition(Math.round(x), Math.round(y));
});

ipcMain.handle("tp-get-config", (e) => {
  const cfg = readTpConfig();
  // Only the main window (settings) may read the key itself
  const isMain =
    mainWindow && !mainWindow.isDestroyed() && e.sender === mainWindow.webContents;
  if (!isMain) {
    const { openaiKey, ...rest } = cfg;
    return Object.assign(rest, { hasKey: !!openaiKey });
  }
  return cfg;
});

ipcMain.handle("tp-set-config", (e, patch) => {
  const clean = {};
  const p = patch || {};
  const isMain =
    mainWindow && !mainWindow.isDestroyed() && e.sender === mainWindow.webContents;
  if (isMain && typeof p.openaiKey === "string")
    clean.openaiKey = p.openaiKey.trim();
  if (typeof p.language === "string") clean.language = p.language;
  if (Number.isFinite(p.wpm)) clean.wpm = Math.max(40, Math.min(400, p.wpm));
  if (Number.isFinite(p.fontSize))
    clean.fontSize = Math.max(10, Math.min(72, p.fontSize));
  if (typeof p.mode === "string") clean.mode = p.mode;
  const cfg = writeTpConfig(clean);
  for (const w of floatWindows.values()) {
    if (!w.isDestroyed() && w.webContents !== e.sender) {
      const { openaiKey, ...rest } = cfg;
      w.webContents.send("tp-config", Object.assign(rest, { hasKey: !!openaiKey }));
    }
  }
  return true;
});

ipcMain.handle("tp-test-key", async (_, key) => {
  try {
    await mintRealtimeSecret(
      Object.assign(readTpConfig(), { openaiKey: String(key || "").trim() }),
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("tp-ensure-mic", async () => {
  if (process.platform !== "darwin") return true;
  if (app.commandLine.hasSwitch("notes-skip-mic-check")) return true;
  const status = systemPreferences.getMediaAccessStatus("microphone");
  if (status === "granted") return true;
  if (status === "denied" || status === "restricted") return false;
  return systemPreferences.askForMediaAccess("microphone");
});

ipcMain.handle("tp-realtime-secret", async (_, hint) => {
  try {
    const value = await mintRealtimeSecret(
      readTpConfig(),
      String(hint || "").slice(0, 900),
    );
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    // Briefly hide dock to get accessory process type (for fullscreen overlay)
    // then show it again so the dock icon and running dot appear
    app.dock.hide();
    setTimeout(() => {
      app.dock.show();
    }, 200);
  }
  // Only our own pages may use the microphone (floating note voice following)
  const ownPage = (url) => String(url || "").startsWith("file://");
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    const url = (details && details.requestingUrl) || (wc && wc.getURL());
    cb(permission === "media" && ownPage(url));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => {
    return permission === "media" && (ownPage(origin) || ownPage(wc && wc.getURL()));
  });
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
