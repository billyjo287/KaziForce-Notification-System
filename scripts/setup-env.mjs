// Copies each .env.example to .env the first time you set up the project.
// An existing .env is never overwritten, so your own changes are safe.
import { copyFileSync, existsSync } from 'node:fs';

const folders = ['.', 'backend', 'frontend', 'ml-service'];

for (const folder of folders) {
  const example = `${folder}/.env.example`;
  const target = `${folder}/.env`;
  if (!existsSync(example)) continue;
  if (existsSync(target)) {
    console.log(`kept     ${target} (already exists)`);
  } else {
    copyFileSync(example, target);
    console.log(`created  ${target}`);
  }
}
