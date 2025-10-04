const AdmZip = require('adm-zip');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
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

function openCSLolManager(installedPath) {
  const exePath = path.join(path.dirname(installedPath), 'cs_lol_manager.exe');
  console.log('[CSLOL] Intentando abrir:', exePath);
  execFile(exePath, (err) => {
    if (err) {
      console.error('[CSLOL] Error al abrir cs_lol_manager.exe:', err);
    } else {
      console.log('[CSLOL] cs_lol_manager.exe abierto correctamente.');
    }
  });
}

async function selectInstalledDirectory() {
  const result = await dialog.showOpenDialog({
    title: 'Selecciona la carpeta "installed"',
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
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
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#181a20',
    show: false, // Oculta la ventana hasta que esté lista
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: false
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile("index.html");

  // Directorio de descarga (no confundir con installedPath)
  let config = loadConfig();
  if (!config.downloadDir) {
    const dir = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (!dir.canceled && dir.filePaths.length > 0) {
      config.downloadDir = dir.filePaths[0];
      saveConfig(config);
    }
  }

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('config', loadConfig());
  });

  // Muestra la ventana solo cuando está lista para evitar parpadeos
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Elimina el menú por defecto para un arranque más limpio
  mainWindow.setMenu(null);

  // Opcional: abre devtools solo en desarrollo
  // mainWindow.webContents.openDevTools(); // Solo en desarrollo
}

app.whenReady().then(async () => {
  console.log('[CSLOL] app.whenReady ejecutado');
  let config = loadConfig();
  let installedPath = config.installedPath;

  if (!installedPath) {
    installedPath = await selectInstalledDirectory();
    if (installedPath) {
      config.installedPath = installedPath;
      saveConfig(config);
      console.log('[CSLOL] Ruta instalada guardada:', installedPath);
    } else {
      console.log('[CSLOL] Selección de carpeta cancelada.');
    }
  } else {
    console.log('[CSLOL] Ruta instalada leída:', installedPath);
  }

  if (installedPath) {
    openCSLolManager(installedPath);
  } else {
    console.log('[CSLOL] No se tiene ruta instalada.');
  }

  await createWindow();

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
  
    // Handler para obtener el campeón pickeado desde la LCU API
    ipcMain.handle('get-picked-champion', async () => {
      // La LCU API usa HTTPS y requiere autenticación básica
      // Detectar el puerto y token del cliente
      // Normalmente se obtiene de los argumentos del proceso de LeagueClientUx.exe
      // Aquí intentamos leer el lockfile
  // Usar la ruta proporcionada por el usuario
  const lockfilePath = 'C:\\Riot Games\\League of Legends\\lockfile';
      try {
        const lockfile = fs.readFileSync(lockfilePath, 'utf8');
        const [name, pid, port, password, protocol] = lockfile.split(':');
        const options = {
          hostname: '127.0.0.1',
          port: port,
          path: '/lol-champ-select/v1/session',
          method: 'GET',
          rejectUnauthorized: false,
          auth: `riot:${password}`
        };
        return new Promise((resolve, reject) => {
          const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
              try {
                const json = JSON.parse(data);
                console.log('[LCU API] Conexión exitosa con la API LCU. Respuesta:', json);
                // Buscar el campeón pickeado por el usuario
                const myPick = (json.myTeam || []).find(p => p.summonerId === json.localPlayerCellId || p.cellId === json.localPlayerCellId);
                if (myPick && myPick.championId) {
                  resolve({ championId: myPick.championId });
                } else {
                  resolve({ championId: null });
                }
              } catch (err) {
                console.error('[LCU API] Error al parsear la respuesta:', err);
                resolve({ championId: null });
              }
            });
          });
          req.on('error', err => {
            console.error('[LCU API] Error de conexión con la API LCU:', err);
            resolve({ championId: null });
          });
          req.end();
        });
      } catch (e) {
        console.error('[LCU API] Error al leer el lockfile o inicializar la conexión:', e);
        return { championId: null };
      }
    });

  const configPath = path.join(app.getPath('userData'), 'config.json');

  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath));
    installedPath = config.installedPath;
    console.log('[CSLOL] Ruta instalada leída:', installedPath);
  } else {
    const result = await dialog.showOpenDialog({
      title: 'Selecciona la carpeta "installed"',
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      installedPath = result.filePaths[0];
      fs.writeFileSync(configPath, JSON.stringify({ installedPath }));
      console.log('[CSLOL] Ruta instalada guardada:', installedPath);
    } else {
      console.log('[CSLOL] Selección de carpeta cancelada.');
    }
  }
  if (installedPath) {
    openCSLolManager(installedPath);
  } else {
    console.log('[CSLOL] No se tiene ruta instalada.');
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Manejo de errores global para evitar bloqueos por promesas no manejadas
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
