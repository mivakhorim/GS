const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400'
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/health' || url.pathname === '/api/status') {
      let activeLink = null;
      try {
        if (env.DB) {
          activeLink = await env.DB.prepare(
            "SELECT * FROM gateway_links WHERE status = 'active' ORDER BY priority ASC LIMIT 1"
          ).first();
        }
      } catch (e) {}

      return jsonResponse({
        status: 'online',
        service: 'Geospasial D1 Cloud Stream Bridge',
        active_link: activeLink,
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname === '/api/gateway' || url.pathname === '/api/gateway/active') {
      try {
        const activeLink = await env.DB.prepare(
          "SELECT * FROM gateway_links WHERE status = 'active' ORDER BY priority ASC LIMIT 1"
        ).first();

        const allLinks = await env.DB.prepare(
          "SELECT * FROM gateway_links ORDER BY priority ASC"
        ).all();

        return jsonResponse({
          status: 'success',
          active_link: activeLink,
          all_links: allLinks.results || []
        });
      } catch (err) {
        return jsonResponse({ status: 'error', message: err.message }, 500);
      }
    }

    if (url.pathname === '/api/gateway/update' && (request.method === 'POST' || request.method === 'PUT')) {
      try {
        const body = await request.json();
        const { id, url: linkUrl, type, name } = body;

        if (!linkUrl) {
          return jsonResponse({ status: 'error', message: 'URL gateway harus diisi' }, 400);
        }

        const targetId = id || 'active_tunnel';
        const targetName = name || 'Dynamic Live Cloud Stream';
        const targetType = type || 'tunnel';

        await env.DB.prepare(
          "INSERT INTO gateway_links (id, name, type, url, status, priority, error_count, updated_at) " +
          "VALUES (?, ?, ?, ?, 'active', 1, 0, CURRENT_TIMESTAMP) " +
          "ON CONFLICT(id) DO UPDATE SET url = excluded.url, status = 'active', error_count = 0, updated_at = CURRENT_TIMESTAMP"
        ).bind(targetId, targetName, targetType, linkUrl).run();

        await env.DB.prepare(
          "UPDATE gateway_links SET status = 'standby' WHERE id != ?"
        ).bind(targetId).run();

        return jsonResponse({
          status: 'success',
          message: 'Tautan gateway berhasil diperbarui ke D1',
          active_id: targetId,
          active_url: linkUrl
        });
      } catch (err) {
        return jsonResponse({ status: 'error', message: err.message }, 500);
      }
    }

    if (url.pathname === '/api/gateway/failover' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const failedId = body.failed_id || 'active_tunnel';

        await env.DB.prepare(
          "UPDATE gateway_links SET error_count = error_count + 1 WHERE id = ?"
        ).bind(failedId).run();

        const currentActive = await env.DB.prepare(
          "SELECT * FROM gateway_links WHERE id = 'active_tunnel' LIMIT 1"
        ).first();

        return jsonResponse({
          status: 'success',
          message: 'Status error tercatat',
          new_active: currentActive
        });
      } catch (err) {
        return jsonResponse({ status: 'error', message: err.message }, 500);
      }
    }

    let activeLink = null;
    try {
      if (env.DB) {
        activeLink = await env.DB.prepare(
          "SELECT * FROM gateway_links WHERE status = 'active' ORDER BY priority ASC LIMIT 1"
        ).first();
      }
    } catch (e) {}

    const tunnelBase = (activeLink && activeLink.url) ? activeLink.url.replace(/\/+$/, '') : null;

    if (url.pathname === '/proxy-wms' || url.pathname.startsWith('/proxy-wms')) {
      let targetBase = tunnelBase || 'https://bhumi.atrbpn.go.id/mprx/service';
      const searchParams = new URLSearchParams(url.search);

      if (url.searchParams.get('upstream')) {
        targetBase = url.searchParams.get('upstream');
        searchParams.delete('upstream');
      }

      const isDirectBpn = targetBase.includes('bhumi.atrbpn.go.id');
      const isTunnel = targetBase.startsWith('http://') || targetBase.includes('trycloudflare.com') || targetBase.includes('loca.lt');

      let targetUrl = targetBase;
      if (isTunnel) {
        targetUrl = `${targetBase}/proxy-wms?` + searchParams.toString();
      } else {
        targetUrl = targetBase + (targetBase.includes('?') ? '&' : '?') + searchParams.toString();
      }

      try {
        const forwardHeaders = {
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'bypass-tunnel-reminder': 'true'
        };

        if (isDirectBpn) {
          forwardHeaders['Referer'] = 'https://bhumi.atrbpn.go.id/';
          forwardHeaders['Origin'] = 'https://bhumi.atrbpn.go.id';
          forwardHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
        }

        let upstreamRes = await fetch(targetUrl, {
          method: 'GET',
          headers: forwardHeaders
        });

        if ((!upstreamRes.ok || upstreamRes.status >= 500) && isTunnel) {
          if (env.DB) {
            ctx.waitUntil(
              env.DB.prepare("UPDATE gateway_links SET error_count = error_count + 1 WHERE id = 'active_tunnel'").run()
            );
          }
          const fallbackBase = 'https://bhumi.atrbpn.go.id/mprx/service';
          const fallbackUrl = fallbackBase + (fallbackBase.includes('?') ? '&' : '?') + searchParams.toString();
          const fbHeaders = {
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Referer': 'https://bhumi.atrbpn.go.id/',
            'Origin': 'https://bhumi.atrbpn.go.id',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          };
          try {
            const fbRes = await fetch(fallbackUrl, { method: 'GET', headers: fbHeaders });
            if (fbRes.ok) {
              upstreamRes = fbRes;
            }
          } catch (_) {}
        }

        const respHeaders = new Headers(upstreamRes.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => respHeaders.set(k, v));
        respHeaders.set('Cache-Control', 'public, max-age=86400');

        return new Response(upstreamRes.body, {
          status: upstreamRes.status,
          headers: respHeaders
        });
      } catch (err) {
        if (isTunnel) {
          const fallbackBase = 'https://bhumi.atrbpn.go.id/mprx/service';
          const fallbackUrl = fallbackBase + (fallbackBase.includes('?') ? '&' : '?') + searchParams.toString();
          try {
            const fbRes = await fetch(fallbackUrl, {
              headers: {
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Referer': 'https://bhumi.atrbpn.go.id/',
                'Origin': 'https://bhumi.atrbpn.go.id',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            if (fbRes.ok) {
              const respHeaders = new Headers(fbRes.headers);
              Object.entries(CORS_HEADERS).forEach(([k, v]) => respHeaders.set(k, v));
              respHeaders.set('Cache-Control', 'public, max-age=86400');
              return new Response(fbRes.body, { status: fbRes.status, headers: respHeaders });
            }
          } catch (_) {}
        }
        return jsonResponse({
          error: 'Gagal memuat stream data peta',
          target: targetUrl,
          message: err.message
        }, 502);
      }
    }

    if (url.pathname.startsWith('/proxy-tile/')) {
      if (tunnelBase) {
        const forwardUrl = `${tunnelBase}${url.pathname}${url.search}`;
        try {
          const upstreamRes = await fetch(forwardUrl, {
            headers: { 'bypass-tunnel-reminder': 'true' }
          });
          const respHeaders = new Headers(upstreamRes.headers);
          Object.entries(CORS_HEADERS).forEach(([k, v]) => respHeaders.set(k, v));
          return new Response(upstreamRes.body, { status: upstreamRes.status, headers: respHeaders });
        } catch (e) {}
      }
      return jsonResponse({ error: 'Tunnel offline' }, 502);
    }

    if (url.pathname === '/api/persil-info' || url.pathname === '/api/viewport-parcels') {
      if (tunnelBase) {
        const forwardUrl = `${tunnelBase}${url.pathname}${url.search}`;
        try {
          const upstreamRes = await fetch(forwardUrl, {
            headers: { 'bypass-tunnel-reminder': 'true', 'Accept': 'application/json' }
          });
          const data = await upstreamRes.json();
          return jsonResponse(data, upstreamRes.status);
        } catch (e) {
          return jsonResponse({ error: 'Gagal terhubung ke tunnel' }, 502);
        }
      }
      return jsonResponse({ error: 'Tunnel belum aktif di D1' }, 503);
    }

    return jsonResponse({
      message: 'Geospasial D1 Cloud Stream Bridge is Active',
      d1_status: !!env.DB,
      endpoints: [
        '/health',
        '/api/status',
        '/api/gateway',
        '/api/gateway/update',
        '/api/gateway/failover',
        '/proxy-wms',
        '/proxy-tile/:z/:x/:y',
        '/api/persil-info',
        '/api/viewport-parcels'
      ]
    });
  }
};