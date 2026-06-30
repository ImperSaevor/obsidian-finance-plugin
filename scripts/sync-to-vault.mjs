import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
	getDefaultDevVaultPath,
	getPluginLinkPath,
	getRoot,
	loadDevConfig,
} from './dev-config.mjs';
import { getDevPluginDir } from './setup-dev-vault.mjs';

const ROOT = getRoot();
const RELEASE_FILES = ['manifest.json', 'main.js', 'styles.css'];

function isWindowsJunction(dirPath, pluginsDir) {
	try {
		const out = execSync(`cmd /c dir "${pluginsDir}"`, { encoding: 'utf-8' });
		const folderName = path.basename(dirPath);
		return out.includes('<JUNCTION>') && out.includes(folderName);
	} catch {
		return false;
	}
}

function removeLinkTarget(targetDir, pluginsDir) {
	if (!fs.existsSync(targetDir)) return;

	const stat = fs.lstatSync(targetDir);
	if (stat.isSymbolicLink()) {
		fs.rmSync(targetDir, { recursive: true, force: true });
		console.log('Lien symbolique supprimé.');
		return;
	}

	if (isWindowsJunction(targetDir, pluginsDir)) {
		fs.rmSync(targetDir, { recursive: true, force: true });
		console.log('Jonction supprimée.');
	}
}

export function getVaultPaths(config) {
	const paths = [config.vaultPath, ...(config.extraVaults ?? [])];
	if (!paths.includes(getDefaultDevVaultPath())) {
		paths.push(getDefaultDevVaultPath());
	}
	return [...new Set(paths.map(p => path.resolve(p)))];
}

function resolveSourceDir(preferredDir) {
	if (preferredDir && fs.existsSync(path.join(preferredDir, 'main.js'))) {
		return preferredDir;
	}
	if (fs.existsSync(path.join(ROOT, 'main.js'))) {
		return ROOT;
	}
	const devDir = getDevPluginDir();
	if (fs.existsSync(path.join(devDir, 'main.js'))) {
		return devDir;
	}
	throw new Error('main.js introuvable — lancez "npm run build:dev" d\'abord.');
}

export function syncToVault(vaultPath, sourceDir) {
	const targetDir = getPluginLinkPath(vaultPath);
	const pluginsDir = path.dirname(targetDir);

	if (!fs.existsSync(path.join(vaultPath, '.obsidian'))) {
		throw new Error(`Coffre Obsidian invalide : ${vaultPath}`);
	}

	if (!fs.existsSync(pluginsDir)) {
		fs.mkdirSync(pluginsDir, { recursive: true });
	}

	removeLinkTarget(targetDir, pluginsDir);

	if (!fs.existsSync(targetDir)) {
		fs.mkdirSync(targetDir, { recursive: true });
	}

	const src = sourceDir ?? resolveSourceDir(getDevPluginDir());

	for (const file of RELEASE_FILES) {
		const srcFile = path.join(src, file);
		const dest = path.join(targetDir, file);
		if (!fs.existsSync(srcFile)) {
			throw new Error(`Fichier manquant : ${file}`);
		}
		const content = fs.readFileSync(srcFile).toString('utf-8').replace(/^\uFEFF/, '');
		fs.writeFileSync(dest, content, { encoding: 'utf8' });
	}

	return targetDir;
}

export function syncToAllVaults(sourceDir) {
	const config = loadDevConfig();
	const src = sourceDir ?? resolveSourceDir(getDevPluginDir());
	const targets = [];

	for (const vaultPath of getVaultPaths(config)) {
		const target = syncToVault(vaultPath, src);
		targets.push(target);
		console.log(`Plugin synchronisé : ${target}`);
	}

	return targets;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
	syncToAllVaults();
}
