const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("notesAPI", {
  toggleAlwaysOnTop: () => ipcRenderer.invoke("toggle-always-on-top"),
  getAlwaysOnTop: () => ipcRenderer.invoke("get-always-on-top"),
  collapse: () => ipcRenderer.invoke("collapse"),
  expand: () => ipcRenderer.invoke("expand"),
  isCollapsed: () => ipcRenderer.invoke("is-collapsed"),
  getPosition: () => ipcRenderer.invoke("get-position"),
  setPosition: (x, y) => ipcRenderer.invoke("set-position", x, y),
  captureSnapshot: () => ipcRenderer.invoke("capture-snapshot"),
  restoreSnapshot: (snapshot) =>
    ipcRenderer.invoke("restore-snapshot", snapshot),

  // Windows opened by dragging a tab out of the main window
  detachTab: (tab, x, y) => ipcRenderer.invoke("tab-detach", tab, x, y),
  moveDetached: (id, x, y) => ipcRenderer.send("tab-detach-move", id, x, y),
  cancelDetach: (id) => ipcRenderer.send("tab-detach-cancel", id),
  finishDetach: (id) => ipcRenderer.send("tab-detach-finish", id),
  closeDetached: (id) => ipcRenderer.send("tab-window-close", id),
  detachedTab: (id) => ipcRenderer.sendSync("tab-window-data", id),
  pushTab: (tab) => ipcRenderer.send("tab-push", tab),
  sendTabEdit: (tab) => ipcRenderer.send("tab-edit", tab),
  onTabUpdate: (cb) => ipcRenderer.on("tab-update", (_, tab) => cb(tab)),
  onTabEdit: (cb) => ipcRenderer.on("tab-edit", (_, tab) => cb(tab)),
  onTabWindows: (cb) => ipcRenderer.on("tab-windows", (_, ids) => cb(ids)),

  // Hide / show toolbars
  setChromeHidden: (hidden) => ipcRenderer.invoke("set-chrome-hidden", hidden),
  closeWindow: () => ipcRenderer.invoke("close-window"),
  onCornerPeek: (cb) => ipcRenderer.on("corner-peek", (_, on) => cb(on)),

  // Floating note (teleprompter)
  openFloating: (note) => ipcRenderer.invoke("float-open", note),
  noteUpdated: (note) => ipcRenderer.invoke("float-note-updated", note),
  getFloatingNote: (id) => ipcRenderer.invoke("float-get-note", id),
  closeFloating: () => ipcRenderer.invoke("float-close"),
  getFloatBounds: () => ipcRenderer.invoke("float-get-bounds"),
  moveFloating: (x, y) => ipcRenderer.send("float-move", x, y),
  onFloatingNote: (cb) =>
    ipcRenderer.on("float-note", (_, note) => cb(note)),
  getTeleprompterConfig: () => ipcRenderer.invoke("tp-get-config"),
  setTeleprompterConfig: (patch) => ipcRenderer.invoke("tp-set-config", patch),
  onTeleprompterConfig: (cb) =>
    ipcRenderer.on("tp-config", (_, cfg) => cb(cfg)),
  testOpenAIKey: (key) => ipcRenderer.invoke("tp-test-key", key),
  ensureMicrophone: () => ipcRenderer.invoke("tp-ensure-mic"),
  getRealtimeSecret: (hint) => ipcRenderer.invoke("tp-realtime-secret", hint),
});
