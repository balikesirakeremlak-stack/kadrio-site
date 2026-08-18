const { spawn } = require('child_process');
const fs = require('fs');

async function start() {
  // start the server
  const out = fs.createWriteStream('reeloram.out.log', { flags: 'a' });
  const err = fs.createWriteStream('reeloram.err.log', { flags: 'a' });

  const server = spawn(process.execPath, ['server.js'], { cwd: process.cwd() });
  server.stdout.pipe(out);
  server.stderr.pipe(err);

  server.on('exit', (code) => {
    console.error('server exited', code);
    process.exit(code || 0);
  });

  // create localtunnel programmatically
  try {
    const localtunnel = require('localtunnel');
    const tunnel = await localtunnel({ port: 3000 });
    console.log('public url:', tunnel.url);
    fs.writeFileSync('tunnel.url', tunnel.url);
    tunnel.on('close', () => console.log('tunnel closed'));
  } catch (e) {
    console.error('localtunnel failed:', e);
  }
}

start();
