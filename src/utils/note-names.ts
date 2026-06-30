/** Nettoie la description pour en faire un nom de fichier valide (sans dépendance Obsidian). */
export function sanitizeNoteBaseName(description: string): string {
	const cleaned = description
		.trim()
		.replace(/[\\/:*?"<>|#]/g, '-')
		.replace(/\s+/g, ' ')
		.replace(/^\.+/, '')
		.replace(/\.+$/, '')
		.slice(0, 120)
		.trim();
	return cleaned || 'Transaction';
}
