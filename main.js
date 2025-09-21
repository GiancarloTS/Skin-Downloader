
const AdmZip = require('adm-zip');
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require('https');

// Handler para exponer skin_status.json (debe ir después de require)
ipcMain.handle('get-champion-status', async () => {
  try {
    const filePath = path.join(__dirname, 'skin_status.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
});

let CONFIG_PATH;
let mainWindow;

function loadConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config));
}

async function selectDirectory(win) {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile("index.html");

  let config = loadConfig();
  if (!config.downloadDir) {
    const dir = await selectDirectory(mainWindow);
    if (dir) {
      config.downloadDir = dir;
      saveConfig(config);
    }
  }

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('config', loadConfig());
  });
}

app.whenReady().then(() => {
  CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  ipcMain.handle('download-skin', async (event, url, filename) => {
    const config = loadConfig();
    const downloadDir = config.downloadDir;
    if (!downloadDir) throw new Error('Directorio de descarga no configurado');
    const filePath = path.join(downloadDir, filename);
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(filePath);
      https.get(url, response => {
        if (response.statusCode !== 200) {
          reject(new Error('Error al descargar: ' + response.statusCode));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(async () => {
            // Si es zip, extraer en carpeta
            if (filename.endsWith('.zip')) {
              try {
                const extractDir = path.join(downloadDir, filename.replace(/\.zip$/, ''));
                fs.mkdirSync(extractDir, { recursive: true });
                const zip = new AdmZip(filePath);
                zip.extractAllTo(extractDir, true);
                resolve('Extraído en: ' + extractDir);
              } catch (err) {
                reject(new Error('Descargado pero error al extraer: ' + err.message));
              }
            } else {
              resolve('Descargado: ' + filePath);
            }
          });
        });
      }).on('error', err => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
    });
  });

  ipcMain.handle('select-download-dir', async () => {
    const dir = await selectDirectory(mainWindow);
    if (dir) {
      let config = loadConfig();
      config.downloadDir = dir;
      saveConfig(config);
      return dir;
    }
    return null;
  });

  // Mover aquí el handler de status
  ipcMain.handle('get-champion-status', async () => {
    try {
      const filePath = path.join(__dirname, 'skin_status.json');
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return {};
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
