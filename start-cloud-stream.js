const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const WORKER_ENDPOINT = 'https://stream.dutamik.id/api/gateway/update';
const PORT = 3000;

function checkPort(port) {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${port}/health`, res => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function postToD1Worker(tunnelUrl) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      id: 'active_tunnel',
      name: 'Live Cloud Stream Bridge',
      type: 'tunnel',
      url: tunnelUrl
    });

    const url = new URL(WORKER_ENDPOINT);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          resolve({ status: 'raw', data });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function startServerProxy() {
  const isRunning = await checkPort(PORT);
  if (isRunning) {
    console.log(`[Proxy] Server lokal aktif di port ${PORT}.`);
    return null;
  }

  console.log(`[Proxy] Menjalankan server-proxy.js di port ${PORT}...`);
  const srv = spawn('node', ['server-proxy.js'], {
    stdio: 'inherit',
    detached: false
  });

  await new Promise(r => setTimeout(r, 2000));
  return srv;
}

let activeChildProcess = null;
let registeredUrl = null;

async function startCloudflaredTunnel() {
  const cfBinary = path.join(__dirname, 'cloudflared.exe');
  if (!fs.existsSync(cfBinary)) {
    return false;
  }

  console.log('[Tunnel] Menjalankan Cloudflare Tunnel via cloudflared.exe...');
  const proc = spawn(cfBinary, ['tunnel', '--url', `http://127.0.0.1:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  activeChildProcess = proc;

  const handleOutput = async (data) => {
    const str = data.toString();
    const match = str.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i);
    if (match && match[0] && match[0] !== registeredUrl) {
      registeredUrl = match[0];
      console.log(`\n======================================================`);
      console.log(`[Live Cloud Stream] Cloudflare Tunnel Aktif: ${registeredUrl}`);
      console.log(`[D1 Cloud Sync] Menyinkronkan ke Cloudflare D1 (stream.dutamik.id)...`);
      try {
        const resp = await postToD1Worker(registeredUrl);
        console.log(`[D1 Cloud Sync] SUKSES! Database D1 diperbarui:`, resp.message || 'OK');
        console.log(`[Web Live] geospasi.dutamik.id langsung menampilkan persil tanpa input manual.`);
        console.log(`======================================================\n`);
      } catch (err) {
        console.error(`[D1 Cloud Sync] Gagal memperbarui D1:`, err.message);
      }
    }
  };

  proc.stdout.on('data', handleOutput);
  proc.stderr.on('data', handleOutput);

  proc.on('close', code => {
    console.log(`[Tunnel] Cloudflare Tunnel ditutup (code ${code}). Menyambung ulang dalam 5 detik...`);
    registeredUrl = null;
    setTimeout(startCloudflaredTunnel, 5000);
  });

  return true;
}

async function startLocaltunnelFallback() {
  console.log('[Tunnel] Membuka LocalTunnel fallback...');
  try {
    const localtunnel = require('localtunnel');
    const tunnel = await localtunnel({ port: PORT });
    console.log(`\n======================================================`);
    console.log(`[Live Cloud Stream] LocalTunnel Aktif: ${tunnel.url}`);
    console.log(`[D1 Cloud Sync] Menyinkronkan ke Cloudflare D1 (stream.dutamik.id)...`);
    const resp = await postToD1Worker(tunnel.url);
    console.log(`[D1 Cloud Sync] SUKSES! Database D1 diperbarui:`, resp.message || 'OK');
    console.log(`[Web Live] geospasi.dutamik.id langsung menampilkan persil tanpa input manual.`);
    console.log(`======================================================\n`);

    tunnel.on('close', () => {
      console.log('[Tunnel] LocalTunnel terputus. Menyambung ulang dalam 5 detik...');
      setTimeout(startLocaltunnelFallback, 5000);
    });
  } catch (err) {
    console.error('[Tunnel Error]', err.message);
    setTimeout(startLocaltunnelFallback, 5000);
  }
}

async function main() {
  console.log('=== Duta GeoSpasi - Cloud Stream & D1 Tunnel Bridge ===');
  await startServerProxy();
  const cfStarted = await startCloudflaredTunnel();
  if (!cfStarted) {
    await startLocaltunnelFallback();
  }
}

process.on('SIGINT', () => {
  console.log('\n[Shutting down] Mematikan tunnel...');
  if (activeChildProcess) activeChildProcess.kill();
  process.exit(0);
});

main().catch(err => {
  console.error('[Fatal Error]', err);
});