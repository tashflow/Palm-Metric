import AdmZip from 'adm-zip';
import path from 'node:path';
import fs from 'node:fs';

const zip = new AdmZip();
const rootDir = process.cwd();

const excludedDirs = new Set(['node_modules', 'dist', '.git', '.firebase', 'tmp', '.agents', '.aistudio', '.github']);
const excludedExts = new Set(['.zip']);

function addRecursive(dir, zipFolder) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (excludedDirs.has(entry.name) || entry.name.startsWith('.')) continue;
      addRecursive(fullPath, path.posix.join(zipFolder, entry.name));
    } else if (entry.isFile()) {
      if (
        excludedExts.has(path.extname(entry.name)) ||
        entry.name.startsWith('.env') ||
        entry.name.includes('private')
      ) {
        continue;
      }
      zip.addLocalFile(fullPath, zipFolder);
    }
  }
}

addRecursive(rootDir, '');
const outPath = path.join(rootDir, 'palm-metric-stage04m1-runnable.zip');
zip.writeZip(outPath);

const verifiedZip = new AdmZip(outPath);
const entries = verifiedZip.getEntries().filter((e) => !e.isDirectory);
const stats = fs.statSync(outPath);
console.log(`Successfully created ${outPath} (${entries.length} files, ${stats.size} bytes)`);
