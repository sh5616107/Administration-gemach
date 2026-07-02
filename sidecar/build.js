/**
 * Build the bank scraper sidecar executable expected by the Rust backend.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '..', 'src-tauri', 'binaries');

const targetsByPlatform = {
  win32: {
    target: 'node18-win-x64',
    fileName: 'bank-scraper-x86_64-pc-windows-msvc.exe',
    magic: Buffer.from('MZ'),
  },
  linux: {
    target: 'node18-linux-x64',
    fileName: 'bank-scraper-x86_64-unknown-linux-gnu',
    magic: Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
  },
  darwin: {
    target: process.arch === 'arm64' ? 'node18-macos-arm64' : 'node18-macos-x64',
    fileName: 'bank-scraper-universal-apple-darwin',
    magic: Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
  },
};

const buildTarget = targetsByPlatform[process.platform];

if (!buildTarget) {
  console.error(`Unsupported platform: ${process.platform}`);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

const outputPath = path.join(outputDir, buildTarget.fileName);

if (fs.existsSync(outputPath)) {
  fs.unlinkSync(outputPath);
}

console.log('Building sidecar binary...');
console.log('Target:', buildTarget.target);
console.log('Output:', outputPath);

const pkgBin = path.join(__dirname, 'node_modules', '@yao-pkg', 'pkg', 'lib-es5', 'bin.js');

if (!fs.existsSync(pkgBin)) {
  console.error('Missing @yao-pkg/pkg. Run npm install in the sidecar directory.');
  process.exit(1);
}

const args = [
  pkgBin,
  '.',
  '--targets',
  buildTarget.target,
  '--output',
  outputPath,
  '--compress',
  'GZip',
];

const result = spawnSync(process.execPath, args, {
  cwd: __dirname,
  stdio: 'inherit',
  shell: false,
});

if (result.status !== 0) {
  if (result.error) {
    console.error('Failed to launch pkg:', result.error);
  }
  console.error(`Sidecar build failed with exit code ${result.status}`);
  process.exit(result.status || 1);
}

if (!fs.existsSync(outputPath)) {
  console.error(`Sidecar build did not create expected file: ${outputPath}`);
  process.exit(1);
}

const stat = fs.statSync(outputPath);
const fd = fs.openSync(outputPath, 'r');
const header = Buffer.alloc(buildTarget.magic.length);
fs.readSync(fd, header, 0, buildTarget.magic.length, 0);
fs.closeSync(fd);

if (stat.size < 1024 * 1024 || !header.subarray(0, buildTarget.magic.length).equals(buildTarget.magic)) {
  console.error(`Invalid sidecar binary: ${outputPath}`);
  console.error(`Size: ${stat.size} bytes`);
  console.error(`Header: ${header.toString('hex')}`);
  process.exit(1);
}

console.log(`Sidecar build complete: ${outputPath}`);
console.log(`Size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
