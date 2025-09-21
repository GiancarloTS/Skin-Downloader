const { contextBridge } = require('electron');
const fs = require('fs');
const path = require('path');

contextBridge.exposeInMainWorld('statusAPI', {
  async getChampionStatus() {
    const filePath = path.join(__dirname, 'skin_status.json');
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return {};
    }
  }
});
