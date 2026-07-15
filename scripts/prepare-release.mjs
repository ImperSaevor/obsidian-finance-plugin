import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'release');

function readUtf8NoBom(filePath) {
	return readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function writeUtf8NoBom(filePath, content) {
	writeFileSync(filePath, content.replace(/^\uFEFF/, ''), { encoding: 'utf8' });
}

mkdirSync(OUT, { recursive: true });

for (const file of ['main.js', 'styles.css']) {
	copyFileSync(path.join(ROOT, file), path.join(OUT, file));
}

const manifest = JSON.parse(readUtf8NoBom(path.join(ROOT, 'manifest.json')));
writeUtf8NoBom(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, '\t')}\n`);

console.log(`Fichiers de release prêts dans : ${OUT}`);
console.log('Uploadez main.js, manifest.json et styles.css sur la release GitHub.');
