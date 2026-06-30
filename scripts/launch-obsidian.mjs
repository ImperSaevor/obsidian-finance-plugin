import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { loadDevConfig, resolveObsidianPath, getRoot } from './dev-config.mjs';
import { ensureDevVault, getDevPluginDir } from './setup-dev-vault.mjs';

const DEBUG_PORT = 9222;
const ROOT = getRoot();

ensureDevVault();
const pluginDir = getDevPluginDir();
if (!fs.existsSync(path.join(pluginDir, 'main.js'))) {
	console.log('Compilation initiale vers le coffre de dev...');
	execSync('node esbuild.config.mjs dev-once', { cwd: ROOT, stdio: 'inherit' });
}
const config = loadDevConfig();
const obsidianPath = resolveObsidianPath(config);
const vaultPath = path.resolve(config.vaultPath);

console.log('── Obsidian — mode debug ──');
console.log(`Coffre   : ${vaultPath}`);
console.log(`Debug    : port ${DEBUG_PORT}`);
console.log('Plugin   : compilé dans le coffre de dev (aucune copie au lancement)');
console.log('');
console.log('Dans Obsidian : Ctrl+Shift+I pour les DevTools');
console.log('Dans Cursor   : lancer "Attacher le débogueur Obsidian" si besoin');

spawn(
	obsidianPath,
	[vaultPath, `--remote-debugging-port=${DEBUG_PORT}`],
	{ detached: true, stdio: 'ignore' },
).unref();
