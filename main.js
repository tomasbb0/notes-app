const { app, BrowserWindow, ipcMain } = require("electron");
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

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    // Briefly hide dock to get accessory process type (for fullscreen overlay)
    // then show it again so the dock icon and running dot appear
    app.dock.hide();
    setTimeout(() => {
      app.dock.show();
    }, 200);
  }
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
