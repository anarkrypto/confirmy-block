// Modules to control application life and create native browser window
const { app, ipcMain, BrowserWindow } = require('electron')
const path = require('path')
const ps = require('ps-node');


let pids = []

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 860,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // and load the index.html of the app.
  mainWindow.loadFile('index.html')

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Listen the 'app_quit' event
ipcMain.on('app_quit', (event, info) => {
  app.quit()
})

//Child Processes
ipcMain.on('pid_message', function (event, arg) {
  console.log('Added Child Process PID:', arg);
  pids.push(arg);
});

function killPID(pid){
  return new Promise((resolve, reject) => {
    ps.kill(pid, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(`Child Process ${pid} has been killed!`);
      }
    })
  })
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  pid_kill_promises = []
  pids.forEach(function (pid) {
    // A simple pid lookup
    pid_kill_promises.push(
      killPID(pid)
      .then((res) => { console.info(res) } )
      .catch((err) => { throw new Error(err) } )
    )
  })
  Promise.allSettled(pid_kill_promises)
    .then(() => {
      if (process.platform !== 'darwin') app.quit()
    })

})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
