// Modules to control application life and create native browser window
const {app, ipcMain, BrowserWindow, Menu, dialog, nativeImage} = require("electron");
const os = require("os");
const path = require("path");

exports.log = function(o) {
  return console.log(o);
}

function openFiles(files) {
  mainWindow.webContents.send("addFiles", files);
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createWindow () {
  let t=[
    { label: "File",
      submenu: [
        { label: "Open",
          accelerator: "CmdOrCtrl+O",
          click: function(m,w,e){
            dialog.showOpenDialog({title: "Select File(s)",
                                   properties: ["openFile", "multiSelections"]},
                                  openFiles)
          }},
        { label: "Import entire directory",
          accelerator: "CmdOrCtrl+I",
          click: function(m,w,e){
            dialog.showOpenDialog({title: "Select Directory",
                                   properties: ["openDirectory"]},
                                  openFiles)
          }},
        { label: "Generate Padding Files",
          click: function(m,w,e){
            mainWindow.webContents.send("generate_padding_files");
          }},
        { type: "separator" },
        { role: "quit" },
      ]},

  ];
  if (!app.isPackaged) {
    t.push(
    { label: "View",
      submenu: [
        { label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click (item, focusedWindow) {
            if (focusedWindow) focusedWindow.reload()
          }
        },
        { label: "Toggle Developer Tools",
          accelerator: os.platform() === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
          click (item, focusedWindow) {
            if (focusedWindow) focusedWindow.webContents.toggleDevTools()
          }
        }]});
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
  
  // Create the browser window.
  mainWindow = new BrowserWindow({width: 800, height: 600});
  if (os.platform()=="linux") {
    mainWindow.setIcon(nativeImage.createFromPath(path.join(__dirname, "icon.png")));
  }

  // and load the index.html of the app.
  mainWindow.loadFile("ltcsync.html")

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
  mainWindow.on("console-message", function(event, level, message, line, sourceId) {
    console.log(message);
  });

  // Emitted when the window is closed.
  mainWindow.on("closed", function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed.
app.on("window-all-closed", function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
})

app.on("activate", function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
