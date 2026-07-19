#!/usr/bin/env node
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svg = readFileSync(join(root, "public", "icon.svg"));

async function generate() {
  await sharp(svg).resize(192, 192).png().toFile(join(root, "public", "icon-192.png"));
  await sharp(svg).resize(512, 512).png().toFile(join(root, "public", "icon-512.png"));
  await sharp(svg).resize(180, 180).png().toFile(join(root, "public", "apple-touch-icon.png"));
  console.log("Generated PWA icons");
}

generate().catch((error) => {
  console.error(error);
  process.exit(1);
});
