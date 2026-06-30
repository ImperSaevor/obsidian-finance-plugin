import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'obsidian-dev.json');
const EXAMPLE_FILE = path.join(ROOT, 'obsidian-dev.example.json');

const DEFAULT_OBSIDIAN_PATHS = [
	path.join(process.env.LOCALAPPDATA ?? '', 'Obsidian', 'Obsidian.exe'),
	path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'obsidian', 'Obsidian.exe'),
];

export function getRoot() {
	return ROOT;
}

export function getDefaultDevVaultPath() {
	return path.resolve(ROOT, '..', 'finance-dev-vault');
}

export function loadDevConfig() {
	if (!fs.existsSync(CONFIG_FILE)) {
		if (fs.existsSync(EXAMPLE_FILE)) {
			fs.copyFileSync(EXAMPLE_FILE, CONFIG_FILE);
			console.log(`Fichier créé : ${CONFIG_FILE}`);
		} else {
			throw new Error(`Fichier de config introuvable : ${CONFIG_FILE}`);
		}
	}

	const raw = fs.readFileSync(CONFIG_FILE, 'utf-8').replace(/^\uFEFF/, '');
	const config = JSON.parse(raw);

	if (!config.vaultPath) {
		config.vaultPath = getDefaultDevVaultPath();
	}

	return config;
}

export function resolveObsidianPath(config) {
	if (config.obsidianPath && fs.existsSync(config.obsidianPath)) {
		return config.obsidianPath;
	}

	for (const candidate of DEFAULT_OBSIDIAN_PATHS) {
		if (candidate && fs.existsSync(candidate)) {
			return candidate;
		}
	}

	throw new Error(
		'Obsidian.exe introuvable. Définissez obsidianPath dans obsidian-dev.json',
	);
}

export function getPluginLinkPath(vaultPath) {
	return path.join(vaultPath, '.obsidian', 'plugins', 'obsidian-finance-plugin');
}
