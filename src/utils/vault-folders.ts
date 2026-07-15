import { App, TFolder, normalizePath } from 'obsidian';

function isAlreadyExistsError(error: unknown): boolean {
	const msg = error instanceof Error ? error.message : String(error);
	return msg.toLowerCase().includes('already exists');
}

export async function vaultFolderExists(app: App, folderPath: string): Promise<boolean> {
	const folder = normalizePath(folderPath);
	if (!folder || folder === '.') return false;

	const entry = app.vault.getAbstractFileByPath(folder);
	if (entry instanceof TFolder) return true;
	if (entry !== null) return false;

	return app.vault.adapter.exists(folder);
}

/** Crée un dossier (et ses parents) sans échouer s'il existe déjà. */
export async function ensureVaultFolder(app: App, folderPath: string): Promise<void> {
	const normalized = normalizePath(folderPath);
	if (!normalized || normalized === '.') return;

	const parts = normalized.split('/').filter(Boolean);
	let current = '';

	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		if (await vaultFolderExists(app, current)) continue;

		try {
			await app.vault.createFolder(current);
		} catch (error) {
			if (isAlreadyExistsError(error) || await vaultFolderExists(app, current)) {
				continue;
			}
			throw error;
		}
	}
}
