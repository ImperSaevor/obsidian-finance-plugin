import { syncToVault } from './sync-to-vault.mjs';

try {
	syncToVault();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exit(1);
}
