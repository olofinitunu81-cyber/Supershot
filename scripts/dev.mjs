// Dev mode: rebuild client on change and restart the server on server/shared changes.
import { spawn } from 'node:child_process';
const build = spawn(process.execPath, ['scripts/build.mjs', '--watch'], { stdio: 'inherit' });
const server = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', '--watch-path=server', '--watch-path=shared', 'server/index.js'], { stdio: 'inherit' });
const stop = () => { build.kill(); server.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
