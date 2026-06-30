import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, "..");
const repoRoot = resolve(frontendDir, "..");
const sourcePath = resolve(repoRoot, "underscore-humaneval-prd.html");
const targetPath = resolve(frontendDir, "dist", "prd", "index.html");

if (!existsSync(sourcePath)) {
  throw new Error(`PRD source file not found: ${sourcePath}`);
}

mkdirSync(dirname(targetPath), { recursive: true });
cpSync(sourcePath, targetPath);

// Copy PRD assets so they resolve from /prd/
const assetsToCopy = ["SAMMY2.0_04-removebg-preview.png"];
for (const asset of assetsToCopy) {
  const src = resolve(frontendDir, "src", "assets", asset);
  if (existsSync(src)) {
    cpSync(src, resolve(frontendDir, "dist", "prd", asset));
  }
}
