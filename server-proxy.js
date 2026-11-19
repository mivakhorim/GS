const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

let activeSessionCookie = '';
let lastHarvestTime = 0;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

async function refreshBhumiSession() {
  try {
    const res = await axios.get('https://bhumi.atrbpn.go.id/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 8000
    });
    const setCookies = res.headers['set-cookie'];
    if (setCookies && Array.isArray(setCookies)) {
      activeSessionCookie = setCookies.map(c => c.split(';')[0]).join('; ');
      lastHarvestTime = Date.now();
      console.log('[Zero-Leak Proxy] Sesi WAF berhasil dipanen:', activeSessionCookie.substring(0, 30) + '...');
    }
  } catch (err) {
    console.warn('[Zero-Leak Proxy] Peringatan panen sesi:', err.message);
  }
}

refreshBhumiSession();
setInterval(refreshBhumiSession, 10 * 60 * 1000);

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    proxy: 'Zero-Leak Reverse Proxy ATR/BPN',
    sessionActive: !!activeSessionCookie,
    lastHarvestTime: lastHarvestTime ? new Date(lastHarvestTime).toISOString() : null,
    uptimeSeconds: Math.floor(process.uptime())
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    proxy: 'Zero-Leak Reverse Proxy ATR/BPN',
    sessionActive: !!activeSessionCookie,
    lastHarvestTime: lastHarvestTime ? new Date(lastHarvestTime).toISOString() : null,
    uptimeSeconds: Math.floor(process.uptime())
  });
});

app.use('/proxy-wms', async (req, res) => {
  if (Date.now() - lastHarvestTime > 12 * 60 * 1000) {
    await refreshBhumiSession();
  }

  let upstreamBase = 'https://bhumi.atrbpn.go.id/bhumigs/umum';
  const queryParams = { ...req.query };

  if (queryParams.upstream) {
    upstreamBase = queryParams.upstream;
    delete queryParams.upstream;
  }

  const qs = new URLSearchParams(queryParams).toString();
  const targetUrl = upstreamBase + (upstreamBase.includes('?') ? '&' : '?') + qs;

  try {
    const upstream = await axios({
      method: 'GET',
      url: targetUrl,
      responseType: 'stream',
      headers: {
        'Referer': 'https://bhumi.atrbpn.go.id/',
        'Origin': 'https://bhumi.atrbpn.go.id',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': activeSessionCookie
      },
      timeout: 12000
    });

    const contentType = upstream.headers['content-type'] || 'image/webp';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    upstream.data.pipe(res);
  } catch (err) {
    res.status(502).json({
      error: 'Gagal memuat tile peta upstream',
      target: upstreamBase,
      message: err.message
    });
  }
});

app.use('/proxy-tile/:z/:x/:y', async (req, res) => {
  if (Date.now() - lastHarvestTime > 12 * 60 * 1000) {
    await refreshBhumiSession();
  }

  const { z, x, y } = req.params;
  const upstreamBase = req.query.upstream || 'https://bhumi.atrbpn.go.id/petadasartmi';
  const targetUrl = `${upstreamBase}/${x}/${y}/${z}`;

  try {
    const upstream = await axios({
      method: 'GET',
      url: targetUrl,
      responseType: 'stream',
      headers: {
        'Referer': 'https://bhumi.atrbpn.go.id/',
        'Origin': 'https://bhumi.atrbpn.go.id',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': activeSessionCookie
      },
      timeout: 10000
    });

    const contentType = upstream.headers['content-type'] || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    upstream.data.pipe(res);
  } catch (err) {
    res.status(502).json({
      error: 'Gagal memuat tile peta upstream',
      target: targetUrl,
      message: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`[Zero-Leak Proxy] Aktif di port ${PORT}`);
  console.log(`[Zero-Leak Proxy] Endpoint WMS: http://localhost:${PORT}/proxy-wms`);
});
