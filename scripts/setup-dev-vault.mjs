import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRoot, getDefaultDevVaultPath } from './dev-config.mjs';

const ROOT = getRoot();
const PLUGIN_ID = 'obsidian-finance-plugin';
const DEV_VAULT = getDefaultDevVaultPath();
const PLUGIN_DIR = path.join(DEV_VAULT, '.obsidian', 'plugins', PLUGIN_ID);
const STATIC_FILES = ['manifest.json', 'styles.css'];

function readUtf8NoBom(filePath) {
	return fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
}

function writeUtf8NoBom(filePath, content) {
	fs.writeFileSync(filePath, content.replace(/^\uFEFF/, ''), { encoding: 'utf8' });
}

export function getDevVaultPath() {
	return DEV_VAULT;
}

export function getDevPluginDir() {
	return PLUGIN_DIR;
}

function ensureDir(dir) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

function removeIfLink(dir) {
	if (!fs.existsSync(dir)) return;
	try {
		const stat = fs.lstatSync(dir);
		if (stat.isSymbolicLink()) {
			fs.rmSync(dir, { recursive: true, force: true });
			return;
		}
		if (fs.existsSync(path.join(dir, 'package.json'))) {
			fs.rmSync(dir, { recursive: true, force: true });
			console.log('Ancienne jonction supprimée — Obsidian ne la détecte pas.');
		}
	} catch {
		// ignore
	}
}

export function copyStaticFiles() {
	for (const file of STATIC_FILES) {
		const content = readUtf8NoBom(path.join(ROOT, file));
		writeUtf8NoBom(path.join(PLUGIN_DIR, file), content);
	}
}

export function ensureDevVault() {
	ensureDir(DEV_VAULT);
	ensureDir(path.join(DEV_VAULT, '.obsidian', 'plugins'));
	removeIfLink(PLUGIN_DIR);
	ensureDir(PLUGIN_DIR);
	copyStaticFiles();

	const welcome = path.join(DEV_VAULT, 'Bienvenue.md');
	if (!fs.existsSync(welcome)) {
		fs.writeFileSync(
			welcome,
			'# Coffre de développement Finance\n\nCe coffre sert au debug du plugin.\n',
			'utf-8',
		);
	}

	const communityPlugins = path.join(DEV_VAULT, '.obsidian', 'community-plugins.json');
	fs.writeFileSync(communityPlugins, JSON.stringify([PLUGIN_ID], null, 2), 'utf-8');

	return DEV_VAULT;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
	ensureDevVault();
	console.log(`Coffre de dev : ${DEV_VAULT}`);
	console.log(`Plugin    : ${PLUGIN_DIR}`);
	console.log('Fichiers  : manifest.json, styles.css, main.js (compilé)');
}
