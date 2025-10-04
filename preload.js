
const { contextBridge, ipcRenderer } = require('electron');

let githubToken = null; // Token dinámico

// Cache local
let championsCache = null;
let skinsCache = {};


function cleanToken(token) {
	// Elimina espacios accidentales y saltos de línea
	return token ? token.trim().replace(/^token\s+/i, '') : '';
}


async function fetchGithub(url) {
	const token = cleanToken(githubToken);
	const headers = token ? { Authorization: `token ${token}` } : {};
	const response = await fetch(url, { headers });
	// Leemos el body como texto para poder reenviarlo
	const text = await response.text();
	// Intentamos parsear como JSON si es posible
	let json = null;
	try {
		json = JSON.parse(text);
	} catch (e) {}
	// Devolvemos un objeto plano serializable
	return {
		status: response.status,
		ok: response.ok,
		json: () => Promise.resolve(json),
		text: () => Promise.resolve(text)
	};
}

contextBridge.exposeInMainWorld('skinsAPI', {
	setToken(token) {
		githubToken = cleanToken(token);
	},
	async getChampions() {
		if (championsCache) return championsCache;
		const response = await fetchGithub('https://api.github.com/repos/lingyRTX/lol-skins/contents/skins');
		const data = await response.json();
		championsCache = Array.isArray(data) ? data.filter(item => item.type === 'dir').map(item => item.name) : [];
		return championsCache;
	},
	async getSkins(champion) {
		if (skinsCache[champion]) return skinsCache[champion];
		const url = `https://api.github.com/repos/lingyRTX/lol-skins/contents/skins/${champion}`;
		const response = await fetchGithub(url);
		const data = await response.json();
		skinsCache[champion] = Array.isArray(data) ? data.filter(item => item.type === 'file').map(item => ({
			name: item.name,
			download_url: item.download_url
		})) : [];
		return skinsCache[champion];
	},
	async fetchGithub(url) {
		return fetchGithub(url);
	},
	async downloadSkin(url, filename) {
		return ipcRenderer.invoke('download-skin', url, filename);
	},
	async changeDownloadDir() {
		return ipcRenderer.invoke('select-download-dir');
	},
	async getChampionStatus() {
		// Usar el raw de GitHub para obtener el JSON actualizado
		const url = 'https://raw.githubusercontent.com/GiancarloTS/Skin-Downloader/main/skin_status.json';
		try {
			const response = await fetch(url, { cache: "no-store" });
			if (!response.ok) return {};
			return await response.json();
		} catch (e) {
			return {};
		}
	}
,
    async getPickedChampion() {
        // Consulta al backend por el campeón pickeado
        return await ipcRenderer.invoke('get-picked-champion');
    }
	});
