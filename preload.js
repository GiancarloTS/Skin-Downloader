const { contextBridge } = require('electron');
const { ipcRenderer } = require('electron');

let githubToken = null; // Token dinámico

// Cache local
let championsCache = null;
let skinsCache = {};

contextBridge.exposeInMainWorld('skinsAPI', {
	setToken(token) {
		githubToken = token;
	},
	async getChampions() {
		if (championsCache) return championsCache;
		const response = await fetch('https://api.github.com/repos/lingyRTX/lol-skins/contents/skins', {
			headers: githubToken ? { Authorization: `token ${githubToken}` } : {}
		});
		const data = await response.json();
		championsCache = Array.isArray(data) ? data.filter(item => item.type === 'dir').map(item => item.name) : [];
		return championsCache;
	},
	async getSkins(champion) {
		if (skinsCache[champion]) return skinsCache[champion];
		const url = `https://api.github.com/repos/lingyRTX/lol-skins/contents/skins/${champion}`;
		const response = await fetch(url, {
			headers: githubToken ? { Authorization: `token ${githubToken}` } : {}
		});
		const data = await response.json();
		skinsCache[champion] = Array.isArray(data) ? data.filter(item => item.type === 'file').map(item => ({
			name: item.name,
			download_url: item.download_url
		})) : [];
		return skinsCache[champion];
	},
	async downloadSkin(url, filename) {
		return ipcRenderer.invoke('download-skin', url, filename);
	},
	async changeDownloadDir() {
		return ipcRenderer.invoke('select-download-dir');
	}
});
