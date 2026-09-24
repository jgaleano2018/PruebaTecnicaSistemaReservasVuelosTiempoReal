// Ejecuta un comando npm (install | build | test) en el orden de dependencias:
// cliente/shared -> shared-kernel -> monolito -> FMS -> Payment -> Realtime Gateway
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const task = process.argv[2] ?? 'build';
const libs = ['../cliente/shared', 'shared-kernel'];
const services = ['Backend', 'FMS', 'PS', 'RG'].map((s) => `PruebaTecnicaSistemaReservasVuelosTiempoReal_${s}`);

for (const dir of [...libs, ...services]) {
  const cmd = task === 'install' ? 'npm install' : task === 'test' && libs.includes(dir) ? null : `npm run ${task}`;
  if (!cmd) continue;
  console.log(`\n▶ ${dir}: ${cmd}`);
  execSync(cmd, { cwd: resolve(root, dir), stdio: 'inherit' });
  if (task === 'install' && libs.includes(dir)) execSync('npm run build', { cwd: resolve(root, dir), stdio: 'inherit' });
}
