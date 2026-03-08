const fs = require('fs')
const path = require('path')

const prebuildsDir = path.join('node_modules', 'node-pty', 'prebuilds')
try {
  fs.readdirSync(prebuildsDir).forEach((dir) => {
    try {
      fs.chmodSync(path.join(prebuildsDir, dir, 'spawn-helper'), 0o755)
    } catch {}
  })
} catch {}

try {
  fs.rmSync(path.join('node_modules', 'node-pty', 'build'), { recursive: true, force: true })
} catch {}
