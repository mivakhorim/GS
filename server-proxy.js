const express = require('express');
const axios = require('axios');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

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

app.use(express.static(__dirname));

async function refreshBhumiSession() {
  try {
    const res = await axios.get('https://bhumi.atrbpn.go.id/', {
      httpsAgent,
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
      httpsAgent,
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
      httpsAgent,
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

app.get('/api/persil-info', async (req, res) => {
  if (Date.now() - lastHarvestTime > 12 * 60 * 1000) {
    await refreshBhumiSession();
  }

  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ found: false, message: 'Parameter lat dan lng tidak valid' });
  }

  const delta = 0.0004;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  const gfiUrl = `https://bhumi.atrbpn.go.id/bhumigs/umum?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&FORMAT=image/png&TRANSPARENT=true&QUERY_LAYERS=umum:Persil&LAYERS=umum:Persil&INFO_FORMAT=application/json&I=50&X=50&J=50&Y=50&SRS=EPSG:4326&WIDTH=101&HEIGHT=101&BBOX=${bbox}`;

  try {
    const upstream = await axios.get(gfiUrl, {
      httpsAgent,
      headers: {
        'Referer': 'https://bhumi.atrbpn.go.id/',
        'Origin': 'https://bhumi.atrbpn.go.id',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': activeSessionCookie
      },
      timeout: 8000
    });

    res.json(upstream.data);
  } catch (err) {
    res.status(502).json({
      found: false,
      message: 'Gagal menghubungi server BPN',
      error: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`[Zero-Leak Proxy] Aktif di port ${PORT}`);
  console.log(`[Zero-Leak Proxy] Endpoint WMS: http://localhost:${PORT}/proxy-wms`);
});
