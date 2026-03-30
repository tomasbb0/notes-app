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
});
