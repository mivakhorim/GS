let activeSessionCookie = '';
let lastHarvestTime = 0;

async function getOrHarvestCookie() {
  const now = Date.now();
  if (activeSessionCookie && (now - lastHarvestTime < 10 * 60 * 1000)) {
    return activeSessionCookie;
  }

  try {
    const res = await fetch('https://bhumi.atrbpn.go.id/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      activeSessionCookie = setCookie.split(',').map(c => c.split(';')[0].trim()).join('; ');
      lastHarvestTime = now;
    }
  } catch (e) {}

  return activeSessionCookie;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    if (url.pathname === '/health' || url.pathname === '/api/status') {
      const cookie = await getOrHarvestCookie();
      return new Response(JSON.stringify({
        status: 'online',
        proxy: 'Zero-Leak Cloudflare Edge Proxy ATR/BPN',
        environment: 'Cloudflare Workers (Global Edge)',
        sessionActive: !!cookie,
        timestamp: new Date().toISOString()
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        }
      });
    }

    if (url.pathname === '/proxy-wms' || url.pathname.startsWith('/proxy-wms')) {
      let upstreamBase = url.searchParams.get('upstream');
      const searchParams = new URLSearchParams(url.search);
      searchParams.delete('upstream');

      const layersParam = searchParams.get('layers') || '';
      if (!upstreamBase) {
        if (layersParam.includes('bhumi_persil')) {
          upstreamBase = 'https://bhumi.atrbpn.go.id/mprx/service';
        } else {
          upstreamBase = 'https://bhumi.atrbpn.go.id/bhumigs/umum';
        }
      }

      const cookie = await getOrHarvestCookie();
      const headers = {
        'Referer': 'https://bhumi.atrbpn.go.id/',
        'Origin': 'https://bhumi.atrbpn.go.id',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      };
      if (cookie) headers['Cookie'] = cookie;

      let targetUrl = upstreamBase + (upstreamBase.includes('?') ? '&' : '?') + searchParams.toString();

      try {
        let upstreamRes = await fetch(targetUrl, { method: 'GET', headers: headers });

        if (!upstreamRes.ok && layersParam.includes('Persil') && upstreamBase.includes('bhumigs')) {
          const fallbackParams = new URLSearchParams(searchParams);
          fallbackParams.set('LAYERS', 'bhumi_persil');
          fallbackParams.set('layers', 'bhumi_persil');
          targetUrl = 'https://bhumi.atrbpn.go.id/mprx/service?' + fallbackParams.toString();
          upstreamRes = await fetch(targetUrl, { method: 'GET', headers: headers });
        }

        const newHeaders = new Headers(upstreamRes.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        newHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');

        return new Response(upstreamRes.body, {
          status: upstreamRes.status,
          headers: newHeaders
        });
      } catch (err) {
        return new Response(JSON.stringify({
          error: 'Gagal memuat tile WMS upstream',
          target: targetUrl,
          message: err.message
        }), {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    const tileMatch = url.pathname.match(/^\/proxy-tile\/(\d+)\/(\d+)\/(\d+)/);
    if (tileMatch) {
      const z = tileMatch[1];
      const x = tileMatch[2];
      const y = tileMatch[3];
      const upstreamBase = url.searchParams.get('upstream') || 'https://bhumi.atrbpn.go.id/petadasartmi';
      const targetUrl = `${upstreamBase}/${z}/${x}/${y}.png`;
      const cookie = await getOrHarvestCookie();

      try {
        const headers = {
          'Referer': 'https://bhumi.atrbpn.go.id/',
          'Origin': 'https://bhumi.atrbpn.go.id',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        if (cookie) headers['Cookie'] = cookie;

        const upstreamRes = await fetch(targetUrl, { headers });

        const newHeaders = new Headers(upstreamRes.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');

        return new Response(upstreamRes.body, {
          status: upstreamRes.status,
          headers: newHeaders
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    return new Response(JSON.stringify({
      message: 'Zero-Leak Geoportal Proxy ATR/BPN is Active',
      endpoints: ['/health', '/api/status', '/proxy-wms', '/proxy-tile/:z/:x/:y']
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
