const DEFAULT_CLOUD_STREAM_GATEWAY = 'https://stream.dutamik.id';
let cachedD1ActiveLink = null;
let lastFailoverTriggerTime = 0;

function getBpnGatewayBase() {
  const custom = localStorage.getItem('custom_bpn_gateway_url');
  if (custom && custom.trim()) {
    const trimmed = custom.trim().replace(/\/+$/, '');
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
      return trimmed;
    }
  }
  if (typeof window !== 'undefined' && window.location) {
    const port = String(window.location.port || '');
    if (port === '3000' || port === '8085' || port === '8089') {
      return window.location.origin;
    }
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:') {
      return 'http://127.0.0.1:3000';
    }
  }
  return DEFAULT_CLOUD_STREAM_GATEWAY;
}

async function syncGatewayFromD1() {
  const base = getBpnGatewayBase();
  try {
    const res = await fetch(`${base}/api/gateway`, { mode: 'cors' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.active_link) {
        cachedD1ActiveLink = data.active_link;
        return data.active_link;
      }
    }
  } catch (e) {}
  return null;
}

async function triggerD1Failover() {
  if (Date.now() - lastFailoverTriggerTime < 10000) return;
  lastFailoverTriggerTime = Date.now();
  const base = getBpnGatewayBase();
  try {
    const res = await fetch(`${base}/api/gateway/failover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failed_id: 'active_tunnel' })
    });
    if (res.ok) {
      const result = await res.json();
      if (result && result.new_active) {
        cachedD1ActiveLink = result.new_active;
        if (persilLayer && map && map.hasLayer(persilLayer)) {
          persilLayer.redraw();
        }
      }
    }
  } catch (e) {}
}

    function saveBpnGatewayUrlFromInput() {
      const input = document.getElementById('inputBpnGatewayUrl');
      if (!input) return;
      const val = input.value.trim();
      if (val) {
        localStorage.setItem('custom_bpn_gateway_url', val);
        showToast('URL Gateway Geospasial disimpan: ' + val, 'success');
      } else {
        localStorage.removeItem('custom_bpn_gateway_url');
        showToast('URL Gateway dikembalikan ke bawaan.', 'info');
      }
      checkProxyHealth();
      if (persilLayer && map.hasLayer(persilLayer)) {
        map.removeLayer(persilLayer);
        setupPersilLayer();
      }
      Object.keys(cekingLayers).forEach(k => {
        const isActive = cekingLayers[k] && map.hasLayer(cekingLayers[k]);
        if (isActive) map.removeLayer(cekingLayers[k]);
        cekingLayers[k] = createThematicLayer(k);
        if (isActive && cekingLayers[k]) map.addLayer(cekingLayers[k]);
      });
    }

    const CadastreWmsLayer = L.TileLayer.WMS.extend({
      getTileUrl: function(coords) {
        const originalUrl = L.TileLayer.WMS.prototype.getTileUrl.call(this, coords);
        const cleanUrl = originalUrl.replace(/^https?:\/\//i, '');
        return 'https://images.weserv.nl/?url=' + encodeURIComponent(cleanUrl);
      }
    });

    const CachedWmsTileLayer = L.TileLayer.WMS.extend({
      createTile: function(coords, done) {
        const tile = document.createElement('img');
        const tileUrl = this.getTileUrl(coords);
        const transparent1x1 = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        tile.crossOrigin = 'anonymous';

        tile.onerror = () => {
          tile.src = transparent1x1;
          done(null, tile);
        };

        if (typeof window !== 'undefined' && window.caches) {
          window.caches.open('geospasi-wms-v1').then(cache => {
            cache.match(tileUrl).then(match => {
              if (match) {
                match.blob().then(blob => {
                  const objUrl = URL.createObjectURL(blob);
                  tile.onload = () => {
                    setTimeout(() => { try { URL.revokeObjectURL(objUrl); } catch (_) {} }, 20000);
                    done(null, tile);
                  };
                  tile.src = objUrl;
                });
              } else {
                fetch(tileUrl, { mode: 'cors' })
                  .then(res => {
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    const cloned = res.clone();
                    cache.put(tileUrl, cloned).catch(() => {});
                    return res.blob();
                  })
                  .then(blob => {
                    const objUrl = URL.createObjectURL(blob);
                    tile.onload = () => {
                      setTimeout(() => { try { URL.revokeObjectURL(objUrl); } catch (_) {} }, 20000);
                      done(null, tile);
                    };
                    tile.src = objUrl;
                  })
                  .catch(() => {
                    tile.src = transparent1x1;
                    done(null, tile);
                  });
              }
            }).catch(() => {
              tile.src = transparent1x1;
              done(null, tile);
            });
          }).catch(() => {
            tile.src = transparent1x1;
            done(null, tile);
          });
        } else {
          tile.src = tileUrl;
          done(null, tile);
        }
        return tile;
      }
    });

    function createCadastreProxyLayer() {
      const slider = document.getElementById('persilOpacity');
      const currentOpacity = slider ? (parseFloat(slider.value) / 100) : 0.90;
      const persilBase = getBpnGatewayBase();
      const mode = (typeof getCadastreServerMode === 'function') ? getCadastreServerMode() : 'server1';
      const layerName = (mode === 'server2') ? 'bhumi_persil' : 'umum:Persil';
      const wmsBase = persilBase ? `${persilBase}/proxy-wms` : 'https://stream.dutamik.id/proxy-wms';
      return new CachedWmsTileLayer(wmsBase, {
        layers: layerName,
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        crs: L.CRS.EPSG3857,
        pane: 'persilPane',
        minZoom: 15,
        maxNativeZoom: 19,
        maxZoom: 26,
        opacity: currentOpacity,
        zIndex: 360,
        keepBuffer: 2,
        updateWhenZooming: true,
        updateWhenIdle: false,
        updateInterval: 150,
        attribution: 'Kementerian ATR/BPN'
      });
    }

    function createAuthTileLayer(url, options) {
      const CustomTileLayer = L.TileLayer.extend({
        createTile: function(coords, done) {
          const tile = document.createElement('img');
          const tileUrl = this.getTileUrl(coords);
          const headers = this.options.headers || {};
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 20000);

          function fetchWithRetry(retriesLeft) {
            fetch(tileUrl, { headers: headers, mode: 'cors', signal: controller.signal })
              .then(res => {
                clearTimeout(tid);
                if (!res.ok) throw new Error('Status ' + res.status);
                return res.blob();
              })
              .then(blob => {
                const objUrl = URL.createObjectURL(blob);
                tile.onload = () => {
                  setTimeout(() => {
                    try { URL.revokeObjectURL(objUrl); } catch (_) {}
                  }, 15000);
                  done(null, tile);
                };
                tile.onerror = () => {
                  try { URL.revokeObjectURL(objUrl); } catch (_) {}
                  done(null, tile);
                };
                tile.src = objUrl;
              })
              .catch(err => {
                if (retriesLeft > 0 && err.name !== 'AbortError') {
                  setTimeout(() => fetchWithRetry(retriesLeft - 1), 500);
                } else {
                  clearTimeout(tid);
                  tile.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                  done(null, tile);
                }
              });
          }

          fetchWithRetry(1);
          return tile;
        }
      });
      return new CustomTileLayer(url, options);
    }

    var cadastreSvgRenderer = null;
    var cadastreVectorParcelCache = new Map();
    var isViewportVectorLoading = false;
    var cadastreVectorLayer = null;
    var viewportFetchController = null;

    function setupCadastreVectorLayer() {
      if (!map) return;
      if (!map.getPane('cadastreVectorPane')) {
        const cvp = map.createPane('cadastreVectorPane');
        cvp.style.zIndex = 375;
        cvp.style.pointerEvents = 'auto';
      }
      if (!cadastreSvgRenderer) {
        cadastreSvgRenderer = L.svg({ padding: 0.25, pane: 'cadastreVectorPane' });
      }
      if (!cadastreVectorLayer) {
        cadastreVectorLayer = L.featureGroup([], { pane: 'cadastreVectorPane' }).addTo(map);
        window.cadastreVectorLayer = cadastreVectorLayer;
      }
      setupViewportCadastreListener();
    }

    function setupViewportCadastreListener() {
    }

    var vectorizedViewportSet = new Set();
    var isViewportVectorizing = false;

    async function loadViewportCadastreSvgParcels() {
    }

    function removeCollinearVertices(coords, minDeflectionDeg = 4.5) {
      if (!coords || coords.length <= 3) return coords;
      let current = coords.slice();
      let changed = true;
      while (changed && current.length > 3) {
        changed = false;
        const n = current.length;
        const nextList = [];
        for (let i = 0; i < n; i++) {
          const prev = current[(i - 1 + n) % n];
          const curr = current[i];
          const next = current[(i + 1) % n];
          const cosLat = Math.cos(curr.lat * Math.PI / 180);
          const ax = (curr.lng - prev.lng) * cosLat;
          const ay = curr.lat - prev.lat;
          const bx = (next.lng - curr.lng) * cosLat;
          const by = next.lat - curr.lat;
          const lenA = Math.hypot(ax, ay);
          const lenB = Math.hypot(bx, by);
          if (lenA === 0 || lenB === 0) {
            changed = true;
            continue;
          }
          const dot = (ax * bx + ay * by) / (lenA * lenB);
          const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
          if (angleDeg < minDeflectionDeg) {
            changed = true;
            continue;
          }
          nextList.push(curr);
        }
        if (nextList.length >= 3) {
          current = nextList;
        } else {
          break;
        }
      }
      return current;
    }

    function harmonizeCadastralTopology(parcelList, snapTolMeters = 2.2) {
      if (!Array.isArray(parcelList) || parcelList.length <= 1) return parcelList;
      const r = 6378137.0;
      function toM(lat, lng) {
        const x = r * (lng * Math.PI / 180.0);
        const y = r * Math.log(Math.tan(Math.PI / 4.0 + (lat * Math.PI / 180.0) / 2.0));
        return { x, y };
      }
      function toLatLng(x, y) {
        const lat = (2.0 * Math.atan(Math.exp(y / r)) - Math.PI / 2.0) * 180.0 / Math.PI;
        const lng = (x / r) * 180.0 / Math.PI;
        return { lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) };
      }

      const allNodes = [];
      parcelList.forEach((poly, polyIdx) => {
        const coords = poly.polygon_coords || poly.coords || poly.coordinates;
        if (!coords || !Array.isArray(coords)) return;
        coords.forEach((c, vIdx) => {
          const m = toM(c.lat, c.lng);
          allNodes.push({ polyIdx, vIdx, mx: m.x, my: m.y, lat: c.lat, lng: c.lng });
        });
      });

      const visited = new Uint8Array(allNodes.length);
      for (let i = 0; i < allNodes.length; i++) {
        if (visited[i]) continue;
        visited[i] = 1;
        const group = [allNodes[i]];
        for (let j = i + 1; j < allNodes.length; j++) {
          if (visited[j]) continue;
          if (allNodes[i].polyIdx === allNodes[j].polyIdx) continue;
          const d = Math.hypot(allNodes[i].mx - allNodes[j].mx, allNodes[i].my - allNodes[j].my);
          if (d <= snapTolMeters) {
            visited[j] = 1;
            group.push(allNodes[j]);
          }
        }
        if (group.length > 1) {
          const avgLat = group.reduce((s, n) => s + n.lat, 0) / group.length;
          const avgLng = group.reduce((s, n) => s + n.lng, 0) / group.length;
          const unified = { lat: Number(avgLat.toFixed(7)), lng: Number(avgLng.toFixed(7)) };
          group.forEach(n => {
            const poly = parcelList[n.polyIdx];
            const coords = poly.polygon_coords || poly.coords || poly.coordinates;
            coords[n.vIdx] = { ...unified };
          });
        }
      }

      parcelList.forEach((polyA, pIdxA) => {
        const coordsA = polyA.polygon_coords || polyA.coords || polyA.coordinates;
        if (!coordsA) return;
        coordsA.forEach(ptA => {
          const pAm = toM(ptA.lat, ptA.lng);
          parcelList.forEach((polyB, pIdxB) => {
            if (pIdxA === pIdxB) return;
            const coordsB = polyB.polygon_coords || polyB.coords || polyB.coordinates;
            if (!coordsB || coordsB.length < 3) return;
            const nB = coordsB.length;
            for (let i = 0; i < nB; i++) {
              const b1 = coordsB[i];
              const b2 = coordsB[(i + 1) % nB];
              if ((ptA.lat === b1.lat && ptA.lng === b1.lng) || (ptA.lat === b2.lat && ptA.lng === b2.lng)) continue;
              const b1m = toM(b1.lat, b1.lng);
              const b2m = toM(b2.lat, b2.lng);
              const dx = b2m.x - b1m.x, dy = b2m.y - b1m.y;
              const l2 = dx * dx + dy * dy;
              if (l2 === 0) continue;
              let t = ((pAm.x - b1m.x) * dx + (pAm.y - b1m.y) * dy) / l2;
              if (t > 0.08 && t < 0.92) {
                const projX = b1m.x + t * dx, projY = b1m.y + t * dy;
                const dist = Math.hypot(pAm.x - projX, pAm.y - projY);
                if (dist <= snapTolMeters) {
                  const snapped = toLatLng(projX, projY);
                  ptA.lat = snapped.lat;
                  ptA.lng = snapped.lng;
                  coordsB.splice(i + 1, 0, snapped);
                  break;
                }
              }
            }
          });
        });
      });

      return parcelList;
    }

    function snapParcelToCachedVectorParcels(targetCoords, snapTolMeters = 2.2) {
      if (!targetCoords || targetCoords.length < 3 || !cadastreVectorParcelCache || cadastreVectorParcelCache.size === 0) {
        return targetCoords;
      }
      const r = 6378137.0;
      function toM(lat, lng) {
        const x = r * (lng * Math.PI / 180.0);
        const y = r * Math.log(Math.tan(Math.PI / 4.0 + (lat * Math.PI / 180.0) / 2.0));
        return { x, y };
      }
      function toLatLng(x, y) {
        const lat = (2.0 * Math.atan(Math.exp(y / r)) - Math.PI / 2.0) * 180.0 / Math.PI;
        const lng = (x / r) * 180.0 / Math.PI;
        return { lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) };
      }

      const cachedPolys = [];
      cadastreVectorParcelCache.forEach(layer => {
        if (layer && layer._parcelData) {
          const c = layer._parcelData.polygon_coords || layer._parcelData.coordinates;
          if (c && c.length >= 3) cachedPolys.push(c);
        }
      });
      if (cachedPolys.length === 0) return targetCoords;

      targetCoords.forEach(pt => {
        const ptm = toM(pt.lat, pt.lng);
        let snapped = false;
        for (const cPoly of cachedPolys) {
          for (const cPt of cPoly) {
            const cPtm = toM(cPt.lat, cPt.lng);
            if (Math.hypot(ptm.x - cPtm.x, ptm.y - cPtm.y) <= snapTolMeters) {
              pt.lat = cPt.lat;
              pt.lng = cPt.lng;
              snapped = true;
              break;
            }
          }
          if (snapped) break;
        }
        if (!snapped) {
          for (const cPoly of cachedPolys) {
            const nC = cPoly.length;
            for (let i = 0; i < nC; i++) {
              const b1 = cPoly[i], b2 = cPoly[(i + 1) % nC];
              const b1m = toM(b1.lat, b1.lng), b2m = toM(b2.lat, b2.lng);
              const dx = b2m.x - b1m.x, dy = b2m.y - b1m.y;
              const l2 = dx * dx + dy * dy;
              if (l2 === 0) continue;
              let t = ((ptm.x - b1m.x) * dx + (ptm.y - b1m.y) * dy) / l2;
              if (t > 0.08 && t < 0.92) {
                const projX = b1m.x + t * dx, projY = b1m.y + t * dy;
                if (Math.hypot(ptm.x - projX, ptm.y - projY) <= snapTolMeters) {
                  const projected = toLatLng(projX, projY);
                  pt.lat = projected.lat;
                  pt.lng = projected.lng;
                  snapped = true;
                  break;
                }
              }
            }
            if (snapped) break;
          }
        }
      });
      return targetCoords;
    }

    async function vectorizeViewportParcelsToSvg() {
      if (!map || isViewportVectorizing) return;
      const zoom = map.getZoom();
      if (zoom < 16) return;

      const center = map.getCenter();
      const vpKey = `${center.lat.toFixed(4)},${center.lng.toFixed(4)},${zoom}`;
      if (vectorizedViewportSet.has(vpKey)) return;
      vectorizedViewportSet.add(vpKey);

      if (vectorizedViewportSet.size > 80) {
        const first = vectorizedViewportSet.values().next().value;
        vectorizedViewportSet.delete(first);
      }

      const bounds = map.getBounds();
      const distM = map.distance(bounds.getNorthEast(), center);
      const span = Math.min(140.0, Math.max(45.0, distM * 0.90));

      const r = 6378137.0;
      const cx = r * (center.lng * Math.PI / 180.0);
      const cy = r * Math.log(Math.tan(Math.PI / 4.0 + (center.lat * Math.PI / 180.0) / 2.0));
      const minx = cx - span, maxx = cx + span;
      const miny = cy - span, maxy = cy + span;
      const bbox = `${minx.toFixed(4)},${miny.toFixed(4)},${maxx.toFixed(4)},${maxy.toFixed(4)}`;

      const persilBase = getBpnGatewayBase();
      const streamBase = (persilBase && (persilBase.startsWith('http://') || persilBase.startsWith('https://'))) ? persilBase : DEFAULT_CLOUD_STREAM_GATEWAY;
      const mode = (typeof getCadastreServerMode === 'function') ? getCadastreServerMode() : 'server1';
      const layerName = (mode === 'server2') ? 'bhumi_persil' : 'umum:Persil';
      const tileUrl = `${streamBase}/proxy-wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=${layerName}&STYLES=&CRS=EPSG:3857&WIDTH=512&HEIGHT=512&BBOX=${bbox}`;

      isViewportVectorizing = true;
      try {
        let blob = null;
        if (typeof window !== 'undefined' && window.caches) {
          try {
            const cache = await window.caches.open('geospasi-wms-v1');
            const match = await cache.match(tileUrl);
            if (match) {
              blob = await match.blob();
            } else {
              const res = await fetch(tileUrl, { mode: 'cors' });
              if (res.ok) {
                const cloned = res.clone();
                cache.put(tileUrl, cloned).catch(() => {});
                blob = await res.blob();
              }
            }
          } catch (_) {}
        }
        if (!blob) {
          const res = await fetch(tileUrl, { mode: 'cors' });
          if (res.ok) blob = await res.blob();
        }
        if (!blob) return;

        const objUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject();
          img.src = objUrl;
        });
        setTimeout(() => { try { URL.revokeObjectURL(objUrl); } catch (_) {} }, 10000);

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, 512, 512);
        const data = imgData.data;

        const w = 512, h = 512;
        const isWall = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
          const rowOffset = y * w * 4;
          for (let x = 0; x < w; x++) {
            const px = rowOffset + x * 4;
            const a = data[px + 3];
            const r = data[px], g = data[px + 1], b = data[px + 2];
            if (a < 60 || a >= 165) {
              isWall[y * w + x] = 1;
            } else {
              const isOrange = Math.hypot(r - 255, g - 170, b - 0) < 26;
              const isGreen = Math.hypot(r - 75, g - 183, b - 72) < 26;
              if (!isOrange && !isGreen) isWall[y * w + x] = 1;
            }
          }
        }
        for (let y = 1; y < h - 1; y++) {
          const row = y * w;
          for (let x = 1; x < w - 1; x++) {
            const idx = row + x;
            if (isWall[idx] === 0) {
              if ((isWall[idx - 1] === 1 && isWall[idx + 1] === 1) ||
                  (isWall[idx - w] === 1 && isWall[idx + w] === 1)) {
                isWall[idx] = 1;
              }
            }
          }
        }

        const parcelMap = new Int16Array(w * h);
        let parcelCount = 0;
        const parcels = [];
        const dirD = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

        function distToSeg(pt, a, b) {
          const dx = b.x - a.x, dy = b.y - a.y;
          if (dx === 0 && dy === 0) return Math.hypot(pt.x - a.x, pt.y - a.y);
          return Math.abs(dy * pt.x - dx * pt.y + b.x * a.y - b.y * a.x) / Math.hypot(dx, dy);
        }

        function simplifyRdp(pts, eps) {
          if (pts.length < 3) return pts;
          let maxD = 0, idx = 0;
          for (let i = 1; i < pts.length - 1; i++) {
            const d = distToSeg(pts[i], pts[0], pts[pts.length - 1]);
            if (d > maxD) { maxD = d; idx = i; }
          }
          if (maxD > eps) {
            const left = simplifyRdp(pts.slice(0, idx + 1), eps);
            const right = simplifyRdp(pts.slice(idx), eps);
            return left.slice(0, -1).concat(right);
          }
          return [pts[0], pts[pts.length - 1]];
        }

        for (let y = 5; y < h - 5; y += 4) {
          for (let x = 5; x < w - 5; x += 4) {
            const idx = y * w + x;
            if (isWall[idx] === 1 || parcelMap[idx] > 0) continue;

            parcelCount++;
            const currentId = parcelCount;

            const queueX = new Int16Array(w * h);
            const queueY = new Int16Array(w * h);
            let head = 0, tail = 0;

            parcelMap[idx] = currentId;
            queueX[tail] = x; queueY[tail] = y; tail++;

            let minPx = x, maxPx = x, minPy = y, maxPy = y;

            while (head < tail) {
              const qx = queueX[head], qy = queueY[head]; head++;
              if (qx < minPx) minPx = qx; if (qx > maxPx) maxPx = qx;
              if (qy < minPy) minPy = qy; if (qy > maxPy) maxPy = qy;

              const nb = [[qx - 1, qy], [qx + 1, qy], [qx, qy - 1], [qx, qy + 1]];
              for (let i = 0; i < 4; i++) {
                const nx = nb[i][0], ny = nb[i][1];
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  const nidx = ny * w + nx;
                  if (parcelMap[nidx] === 0 && isWall[nidx] === 0) {
                    parcelMap[nidx] = currentId;
                    queueX[tail] = nx; queueY[tail] = ny; tail++;
                  }
                }
              }
            }

            if (tail < 120 || tail > (w * h * 0.85) || minPx <= 4 || maxPx >= w - 5 || minPy <= 4 || maxPy >= h - 5) {
              for (let i = 0; i < tail; i++) parcelMap[queueY[i] * w + queueX[i]] = -1;
              parcelCount--;
            }
          }
        }

        const dilateQueue = [];
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const id = parcelMap[y * w + x];
            if (id > 0) {
              const nbs = [y * w + x - 1, y * w + x + 1, (y - 1) * w + x, (y + 1) * w + x];
              for (let nidx of nbs) {
                if (isWall[nidx] === 1 && parcelMap[nidx] === 0) {
                  parcelMap[nidx] = id;
                  dilateQueue.push({ x: nidx % w, y: Math.floor(nidx / w), id, dist: 1 });
                }
              }
            }
          }
        }
        let dqHead = 0;
        while (dqHead < dilateQueue.length) {
          const item = dilateQueue[dqHead++];
          if (item.dist >= 3) continue;
          const { x: dx, y: dy, id: did, dist: ddist } = item;
          const nbs = [[dx - 1, dy], [dx + 1, dy], [dx, dy - 1], [dx, dy + 1]];
          for (let i = 0; i < 4; i++) {
            const nx = nbs[i][0], ny = nbs[i][1];
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const nidx = ny * w + nx;
              if (isWall[nidx] === 1 && parcelMap[nidx] === 0) {
                parcelMap[nidx] = did;
                dilateQueue.push({ x: nx, y: ny, id: did, dist: ddist + 1 });
              }
            }
          }
        }

        for (let id = 1; id <= parcelCount; id++) {
          let firstX = -1, firstY = -1;
          let minPx = w, maxPx = 0, minPy = h, maxPy = 0;
          for (let py = 0; py < h; py++) {
            for (let px = 0; px < w; px++) {
              if (parcelMap[py * w + px] === id) {
                if (firstX === -1) { firstX = px; firstY = py; }
                if (px < minPx) minPx = px; if (px > maxPx) maxPx = px;
                if (py < minPy) minPy = py; if (py > maxPy) maxPy = py;
              }
            }
          }
          if (firstX === -1) continue;
          if (minPx <= 4 || maxPx >= w - 5 || minPy <= 4 || maxPy >= h - 5) continue;

          const contour = [{ x: firstX, y: firstY }];
          let currX = firstX, currY = firstY, backtrack = 6;
          for (let step = 0; step < 4000; step++) {
            let found = false;
            for (let i = 0; i < 8; i++) {
              const cd = (backtrack + i) % 8;
              const nx = currX + dirD[cd][0], ny = currY + dirD[cd][1];
              if (nx >= minPx && nx <= maxPx && ny >= minPy && ny <= maxPy && parcelMap[ny * w + nx] === id) {
                currX = nx; currY = ny; contour.push({ x: currX, y: currY });
                backtrack = (cd + 5) % 8; found = true; break;
              }
            }
            if (!found || (currX === firstX && currY === firstY && contour.length > 8)) break;
          }

          if (contour.length < 8) continue;

          const nContour = contour.length;
          const kWin = Math.min(5, Math.floor(nContour / 4));
          const curvatures = new Float32Array(nContour);
          for (let i = 0; i < nContour; i++) {
            const prev = contour[(i - kWin + nContour) % nContour];
            const curr = contour[i];
            const next = contour[(i + kWin) % nContour];
            const ax = curr.x - prev.x, ay = curr.y - prev.y;
            const bx = next.x - curr.x, by = next.y - curr.y;
            const lenA = Math.hypot(ax, ay), lenB = Math.hypot(bx, by);
            if (lenA > 0 && lenB > 0) {
              const dot = (ax * bx + ay * by) / (lenA * lenB);
              curvatures[i] = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
            }
          }

          let maxAngle = 0, bestCornerIdx = 0;
          for (let i = 0; i < nContour; i++) {
            if (curvatures[i] > maxAngle) { maxAngle = curvatures[i]; bestCornerIdx = i; }
          }

          const rotated = contour.slice(bestCornerIdx).concat(contour.slice(0, bestCornerIdx));
          let maxOppDist = 0, oppCornerIdx = Math.floor(nContour / 2);
          for (let i = Math.floor(nContour / 4); i < Math.floor(3 * nContour / 4); i++) {
            const d = Math.hypot(rotated[i].x - rotated[0].x, rotated[i].y - rotated[0].y);
            if (d > maxOppDist) { maxOppDist = d; oppCornerIdx = i; }
          }

          const p1 = simplifyRdp(rotated.slice(0, oppCornerIdx + 1), 1.2);
          const p2 = simplifyRdp(rotated.slice(oppCornerIdx), 1.2);
          const simplified = p1.slice(0, -1).concat(p2.slice(0, -1));
          if (simplified.length < 3) continue;

          const rawPolyCoords = simplified.map(pt => {
            const mx = minx + ((pt.x + 0.5) / 512.0) * (maxx - minx);
            const my = maxy - ((pt.y + 0.5) / 512.0) * (maxy - miny);
            const pLat = (2.0 * Math.atan(Math.exp(my / r)) - Math.PI / 2.0) * 180.0 / Math.PI;
            const pLng = (mx / r) * 180.0 / Math.PI;
            return { lat: Number(pLat.toFixed(7)), lng: Number(pLng.toFixed(7)) };
          });

          const polyCoords = removeCollinearVertices(rawPolyCoords, 6.0);
          if (polyCoords.length < 3) continue;

          let area = 0;
          const n = polyCoords.length;
          for (let i = 0; i < n; i++) {
            const pa = polyCoords[i], pb = polyCoords[(i + 1) % n];
            const x1 = pa.lng * (Math.PI / 180) * r * Math.cos(pa.lat * Math.PI / 180);
            const y1 = pa.lat * (Math.PI / 180) * r;
            const x2 = pb.lng * (Math.PI / 180) * r * Math.cos(pb.lat * Math.PI / 180);
            const y2 = pb.lat * (Math.PI / 180) * r;
            area += (x1 * y2 - x2 * y1);
          }
          area = Math.abs(area) * 0.5;

          if (area >= 15) {
            const cLat = polyCoords.reduce((s, c) => s + c.lat, 0) / polyCoords.length;
            const cLng = polyCoords.reduce((s, c) => s + c.lng, 0) / polyCoords.length;
            const fid = 'PERSIL-' + Math.round(cLat * 100000) + '-' + Math.round(cLng * 100000);
            parcels.push({
              found: true,
              is_official_cadastre: true,
              is_auto_traced: true,
              fid: fid,
              nib: '-',
              tipe_hak: '-',
              luas_m2: Math.round(area),
              luas_ukur_m2: Math.round(area),
              luas_terdaftar_m2: 0,
              polygon_coords: polyCoords,
              status_validasi: 'Batas Bidang Kadaster Terdeteksi (SVG)',
              source: 'VEKTOR PERSIL SVG PRESISI'
            });
          }
        }

        if (parcels.length > 0) {
          harmonizeCadastralTopology(parcels, 2.2);
          renderCadastreVectorParcels(parcels);
        }
      } catch (e) {
      } finally {
        isViewportVectorizing = false;
      }
    }

    function renderCadastreVectorParcels(parcelsList) {
      if (!map || !cadastreVectorLayer || !Array.isArray(parcelsList)) return;
      if (cadastreVectorLayer) {
        cadastreVectorLayer.clearLayers();
      }
      cadastreVectorParcelCache.clear();

      parcelsList.forEach(parcel => {
        const coords = parcel.polygon_coords || parcel.coordinates;
        if (!coords || coords.length < 3 || coords.length > 200) return;
        const pid = String(parcel.persilpasifid || parcel.fid || parcel.nib || '');
        if (cadastreVectorParcelCache.has(pid)) return;

        const latlngs = coords.map(c => [c.lat, c.lng]);
        const polyLayer = L.polygon(latlngs, {
          renderer: cadastreSvgRenderer,
          stroke: true,
          color: '#d97706',
          weight: 1.6,
          opacity: 0.92,
          fillColor: '#f59e0b',
          fillOpacity: 0.14,
          pane: 'cadastreVectorPane',
          interactive: true
        });
        polyLayer._parcelData = parcel;

        const nibLabel = (parcel.nib && parcel.nib !== '-') ? `NIB: ${parcel.nib}` : 'Bidang Terdaftar';
        let tooltipContent = `<strong>${nibLabel}</strong>`;
        const luasUkur = parcel.luas_ukur_m2 || parcel.luas_m2;
        const luasData = parcel.luas_terdaftar_m2;
        if (luasUkur) {
          tooltipContent += `<br><span>Luas Gambar: ${Math.round(luasUkur).toLocaleString('id-ID')} m²</span>`;
        }
        if (luasData && Math.abs(luasData - (luasUkur || 0)) >= 1) {
          tooltipContent += `<br><span style="color:#16a34a; font-weight:700;">Luas Data BPN: ${Math.round(luasData).toLocaleString('id-ID')} m²</span>`;
        }
        polyLayer.bindTooltip(tooltipContent, {
          sticky: true,
          direction: 'auto',
          opacity: 0.95
        });

        polyLayer.on('mouseover', function() {
          this.setStyle({
            color: '#0284c7',
            weight: 2.4,
            opacity: 1,
            fillColor: '#38bdf8',
            fillOpacity: 0.25
          });
          if (map.getContainer()) {
            map.getContainer().style.cursor = 'pointer';
          }
        });

        polyLayer.on('mouseout', function() {
          this.setStyle({
            color: '#d97706',
            weight: 1.6,
            opacity: 0.92,
            fillColor: '#f59e0b',
            fillOpacity: 0.14
          });
          if (map.getContainer()) {
            map.getContainer().style.cursor = '';
          }
        });

        polyLayer.on('click', function(e) {
          L.DomEvent.stopPropagation(e);
          if (window.isBoundaryEditingActive) {
            showToast('Sedang dalam Mode Pengeditan Bidang: Selesaikan penataan patok atau klik Atur Ulang jika ingin memilih bidang lain.', 'warn');
            return;
          }
          if (typeof isMergeMode !== 'undefined' && isMergeMode) {
            if (typeof handleMergeParcelClick === 'function') {
              handleMergeParcelClick(e.latlng.lat, e.latlng.lng, parcel);
            }
            return;
          }
          selectCadastreVectorParcel(parcel, e.latlng);
        });

        polyLayer.addTo(cadastreVectorLayer);
        cadastreVectorParcelCache.set(pid, polyLayer);
      });
    }

    function selectCadastreVectorParcel(parcel, clickLatLng) {
      if (!parcel) return;
      if (window.isBoundaryEditingActive) {
        showToast('Sedang dalam Mode Pengeditan Bidang: Selesaikan penataan patok atau klik Atur Ulang jika ingin memilih bidang lain.', 'warn');
        return;
      }
      const coords = parcel.polygon_coords || parcel.coordinates;
      if (!coords || coords.length < 3) return;

      const lat = clickLatLng ? clickLatLng.lat : (coords.reduce((s, c) => s + c.lat, 0) / coords.length);
      const lng = clickLatLng ? clickLatLng.lng : (coords.reduce((s, c) => s + c.lng, 0) / coords.length);
      const exactArea = calculatePolygonArea(coords);

      isParcelLocked = false;
      isGeometryManuallyEdited = false;
      rawInitialBboxCoords = coords;

      if (activePinMarker) {
        map.removeLayer(activePinMarker);
      }
      const pinIcon = L.divIcon({
        className: 'custom-pin-marker',
        html: `<div style="background-color:var(--accent); width:20px; height:20px; border-radius:50%; border:2px solid #ffffff; box-shadow:0 3px 8px rgba(10,46,92,0.35); display:flex; align-items:center; justify-content:center;"><div style="width:6px; height:6px; border-radius:50%; background:#ffffff;"></div></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });
      activePinMarker = L.marker([lat, lng], {
        icon: pinIcon,
        draggable: true
      }).addTo(map);
      activePinMarker.on('dragend', function(ev) {
        const pos = ev.target.getLatLng();
        handleMapClick(pos.lat, pos.lng, false);
      });

      const registeredArea = (parcel.luas_m2 && parcel.luas_m2 > 0) ? parcel.luas_m2 : exactArea;

      activePinData = {
        lat: lat,
        lng: lng,
        fid: parcel.fid || parcel.persilpasifid || ('BIDANG-' + (parcel.nib || 'TERDAFTAR')),
        nib: parcel.nib && parcel.nib !== '-' ? parcel.nib : '-',
        nib_lengkap: parcel.nib_lengkap || parcel.nib || '-',
        luas_m2: exactArea,
        luas_terdaftar_m2: registeredArea,
        luas_ha: roundAreaHa6(exactArea),
        luas_bpn: registeredArea,
        tipe_hak: parcel.tipe_hak || 'TERDAFTAR ATR/BPN',
        nomor_hak: parcel.nomor_hak || '-',
        nomor_hak_raw: parcel.nomor_hak || '-',
        nosu: parcel.nosu || '-',
        tahun: parcel.tahun || '-',
        wilayah: parcel.wilayah || '-',
        desa: parcel.desa || parcel.kelurahan || '-',
        kecamatan: parcel.kecamatan || '-',
        kabkot: parcel.kabkot || parcel.kabupaten || '-',
        provinsi: parcel.provinsi || '-',
        kodepos: parcel.kodepos || '-',
        kantah: parcel.kantah || 'Kantor Pertanahan ATR/BPN',
        polygon_coords: coords,
        all_parcels: parcel.all_parcels || [parcel],
        is_official_cadastre: true,
        status_validasi: 'Kadaster Resmi Presisi',
        source: 'VEKTOR PERSIL SVG PRESISI',
        alamat: parcel.alamat || '-'
      };

      const lokasiUtama = (activePinData.desa !== '-' && activePinData.kecamatan !== '-')
        ? `${activePinData.desa}, ${activePinData.kecamatan}`
        : (activePinData.desa !== '-' ? activePinData.desa : (activePinData.kabkot !== '-' ? activePinData.kabkot : (activePinData.nib !== '-' ? `NIB ${activePinData.nib}` : 'Bidang Tanah')));

      const elCoords = document.getElementById('pinCoordsText');
      if (elCoords) elCoords.innerText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      const elDms = document.getElementById('pinDmsText');
      if (elDms) elDms.innerText = toDMS(lat, lng);
      const elUtm = document.getElementById('pinUtmText');
      if (elUtm) elUtm.innerText = getUtmZone(lat, lng);
      const elMercator = document.getElementById('pinMercatorText');
      if (elMercator) {
        const merc = toWebMercator(lat, lng);
        elMercator.innerText = `X: ${Math.round(merc.x)}, Y: ${Math.round(merc.y)}`;
      }

      const elLokasi = document.getElementById('pinLokasiUtamaText');
      if (elLokasi) elLokasi.innerText = lokasiUtama;

      const elLuasBpn = document.getElementById('pinLuasBpnText');
      if (elLuasBpn) {
        elLuasBpn.className = 'stat-value emerald';
        elLuasBpn.innerText = `${Math.round(registeredArea).toLocaleString('id-ID')} m²`;
      }
      const elTipeHak = document.getElementById('pinTipeHakText');
      if (elTipeHak) elTipeHak.innerText = activePinData.tipe_hak;
      renderCadastralProFields();

      fetchSpatialStatusData(lat, lng).then(status => {
        if (activePinData && Math.abs(activePinData.lat - lat) < 0.001 && Math.abs(activePinData.lng - lng) < 0.001) {
          Object.assign(activePinData, status);
          renderCadastralProFields();
        }
      });

      const elStatusValidasi = document.getElementById('pinStatusValidasiText');
      if (elStatusValidasi) {
        elStatusValidasi.className = 'spec-value emerald';
        elStatusValidasi.innerText = activePinData.status_validasi || 'Kadaster Resmi Presisi';
      }
      const elPinServer = document.getElementById('pinServerDataText') || document.getElementById('pinServerAktifText');
      if (elPinServer) {
        elPinServer.innerText = (getCadastreServerMode() === 'server2') ? 'Server 2' : 'Server 1';
      }

      const badgeEl = document.getElementById('badgeTipeHak');
      if (badgeEl) badgeEl.innerText = activePinData.tipe_hak;

      const elLegalitas = document.getElementById('legalitasSummaryText');
      if (elLegalitas) {
        elLegalitas.innerText = `Terverifikasi Resmi : Status ${activePinData.tipe_hak || 'Hak Milik'}`;
      }

      const elAlamatGmaps = document.getElementById('pinAlamatGmapsText');
      if (elAlamatGmaps) {
        elAlamatGmaps.innerText = activePinData.alamat !== '-' ? activePinData.alamat : `${activePinData.kabkot}, ${activePinData.provinsi}`;
      }

      const elShpProv = document.getElementById('shpProvinsi');
      if (elShpProv && activePinData.provinsi !== '-') elShpProv.value = activePinData.provinsi.toUpperCase();

      const elShpKeterangan = document.getElementById('shpKeterangan');
      if (elShpKeterangan) {
        const rawKet = activePinData.alamat !== '-' ? activePinData.alamat : `Bidang ${activePinData.kabkot}`;
        elShpKeterangan.value = rawKet.toUpperCase();
      }
      if (typeof updateShpLuasDisplay === 'function') updateShpLuasDisplay();

      const elKab = document.getElementById('pinKabkotText'); if (elKab) elKab.innerText = activePinData.kabkot;
      const elProv = document.getElementById('pinProvinsiText'); if (elProv) elProv.innerText = activePinData.provinsi;
      const elKodePos = document.getElementById('pinKodePosText'); if (elKodePos) elKodePos.innerText = activePinData.kodepos;

      const bhumiUrl = `https://bhumi.atrbpn.go.id/peta?latitude=${lat.toFixed(6)}&longitude=${lng.toFixed(6)}&zoom=19`;
      const btnBhumi = document.getElementById('btnLinkBhumi');
      if (btnBhumi) btnBhumi.href = bhumiUrl;
      const btnGmaps = document.getElementById('btnLinkGoogleMaps');
      if (btnGmaps) btnGmaps.href = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

      const foundBox = document.getElementById('persilFoundBox');
      const notFoundBox = document.getElementById('persilNotFoundBox');
      const noPin = document.getElementById('noPinAlert');
      if (noPin) noPin.style.display = 'none';
      if (foundBox) foundBox.style.display = 'flex';
      if (notFoundBox) notFoundBox.style.display = 'none';

      const hud = document.getElementById('canvasHud');
      if (hud) {
        hud.style.display = 'flex';
        const elHudNib = document.getElementById('hudNib');
        if (elHudNib) elHudNib.innerText = lokasiUtama;
        const elHudArea = document.getElementById('hudBpnArea');
        if (elHudArea) elHudArea.innerText = registeredArea > 0 ? `${Math.round(registeredArea).toLocaleString('id-ID')} m²` : '-';
      }

      if (parcel.tahun && parseInt(parcel.tahun)) {
        const elShpTahun = document.getElementById('shpTahun');
        if (elShpTahun) elShpTahun.value = parseInt(parcel.tahun);
      }

      initCanvasRebuilder(lat, lng, registeredArea, coords);

      const badge = document.getElementById('badgeRebuildStatus');
      if (badge) {
        badge.className = 'badge-pill green';
        badge.innerText = 'Kadaster Resmi Presisi';
      }
      showToast('Data batas bidang persil ATR/BPN terdeteksi dan aktif.', 'success');
    }

    function setupPersilLayer() {
      if (!map) return;
      if (!map.getPane('persilPane')) {
        const pp = map.createPane('persilPane');
        pp.style.zIndex = 360;
        pp.style.pointerEvents = 'none';
      }
      setupCadastreVectorLayer();
      const persilBase = getBpnGatewayBase();
      const slider = document.getElementById('persilOpacity');
      const currentOpacity = slider ? (parseFloat(slider.value) / 100) : 0.90;

      if (slider && !slider._vectorListenerAttached) {
        slider._vectorListenerAttached = true;
        slider.addEventListener('input', function() {
          const val = parseFloat(this.value) / 100;
          if (persilLayer && typeof persilLayer.setOpacity === 'function') {
            persilLayer.setOpacity(val);
          }
          if (cadastreVectorLayer) {
            cadastreVectorLayer.eachLayer(layer => {
              if (layer && typeof layer.setStyle === 'function') {
                layer.setStyle({ opacity: val, fillOpacity: val * 0.15 });
              }
            });
          }
        });
      }

      if (persilLayer && map.hasLayer(persilLayer)) {
        map.removeLayer(persilLayer);
      }

      const sbKey = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY) ? SUPABASE_ANON_KEY : 'sb_publishable_NBReVvac6_FUBe969fLbOw_ZGZjcwKM';

      persilLayer = createCadastreProxyLayer();

      const chk = document.getElementById('chkPersil');
      if (!chk || chk.checked) {
        persilLayer.addTo(map);
      }

      loadViewportCadastreSvgParcels();
    }

    async function refreshPersilTiles() {
      if (persilLayer && typeof persilLayer.redraw === 'function') {
        persilLayer.redraw();
      }
      if (cadastreVectorLayer) {
        cadastreVectorLayer.clearLayers();
      }
      cadastreVectorParcelCache.clear();
      const persilBase = getBpnGatewayBase();
      if (persilBase) {
        try {
          await fetch(`${persilBase}/api/clear-cache`, { method: 'POST' });
        } catch (e) {}
        await loadViewportCadastreSvgParcels();
      }
      showToast('Peta bidang persil diperbarui.', 'success');
    }

    var cekingLayers = {
      lppb: null,
      rtrw_kabkot: null,
      rtrw_provinsi: null,
      lsd_8_provinsi: null,
      lsd_12_provinsi: null,
      lahan_baku_sawah_2024: null,
      tanah_ulayat: null,
      area_penggunaan_lain: null,
      kawasan_hutan: null,
      pippib_2025: null,
      penggunaan_tanah: null,
      nilai_bidang_tanah: null,
      zona_nilai_tanah: null,
      toponim: null,
      index_peta_dasar: null,
      ptpr: null
    };

    const BHUMI_RED_BOX_LAYERS = {
      lppb: {
        id: 'layer_lppb',
        name: 'Lahan Pertanian Pangan Berkelanjutan (LPPB)',
        category: 'Dataset Utama Pertanahan',
        update: '12-11-2026',
        wmsLayer: 'rtr-online:lp2b_lp2b_10112026',
        endpoint: 'https://gistaru-app.atrbpn.go.id/interoppublic/api/wms/7d3b3f29-baec-4bda-aee0-e408bd2537fb',
        type: 'wms',
        color: '#16a34a'
      },
      rtrw_kabkot: {
        id: 'layer_rtrw_kabkot',
        name: 'RTRW Kab/Kota (Rencana Tata Ruang Wilayah)',
        category: 'Rencana Tata Ruang',
        update: '06-10-2026',
        wmsLayer: 'rtr-online:rtrw_kabkot_1_indonesia',
        endpoint: 'https://gistaru-app.atrbpn.go.id/interoppublic/api/wms/78abbda6-8c02-403e-baa9-2c470e647e6b',
        type: 'wms',
        color: '#f97316'
      },
      rtrw_provinsi: {
        id: 'layer_rtrw_provinsi',
        name: 'RTRW Provinsi (Rencana Tata Ruang Wilayah)',
        category: 'Rencana Tata Ruang',
        update: '06-10-2026',
        wmsLayer: 'rtr-online:rtrw_provinsi_1_indonesia',
        endpoint: 'https://gistaru-app.atrbpn.go.id/interoppublic/api/wms/ed3223bb-7a26-408f-9b55-3fd39c1b901f',
        type: 'wms',
        color: '#ea580c'
      },
      lsd_8_provinsi: {
        id: 'layer_lsd_8_provinsi',
        name: 'Lahan Sawah Dilindungi 8 Provinsi',
        category: 'Dataset Utama Pertanahan',
        update: '30-09-2026',
        wmsLayer: 'umum:lsd_merge_8_provinsi',
        endpoint: 'https://bhumi.atrbpn.go.id/bhumigs/umum',
        type: 'wms',
        color: '#10b981'
      },
      lsd_12_provinsi: {
        id: 'layer_lsd_12_provinsi',
        name: 'Lahan Sawah Dilindungi 12 Provinsi',
        category: 'Dataset Utama Pertanahan',
        update: '25-09-2026',
        wmsLayer: 'umum:lsd_merge',
        endpoint: 'https://bhumi.atrbpn.go.id/bhumigs/umum',
        type: 'wms',
        color: '#059669'
      },
      lahan_baku_sawah_2024: {
        id: 'layer_lahan_baku_sawah_2024',
        name: 'Lahan Baku Sawah 2024',
        category: 'Dataset Utama Pertanahan',
        update: '25-09-2026',
        wmsLayer: 'umum:lahanbakusawah_new',
        endpoint: 'https://bhumi.atrbpn.go.id/bhumigs/umum',
        type: 'wms',
        color: '#84cc16'
      },
      tanah_ulayat: {
        id: 'layer_tanah_ulayat',
        name: 'Tanah Ulayat',
        category: 'Dataset Utama Pertanahan',
        update: '24-09-2026',
        wmsLayer: 'umum:tanahulayatnew',
        endpoint: 'https://bhumi.atrbpn.go.id/bhumigs/umum',
        type: 'wms',
        color: '#a855f7'
      },
      area_penggunaan_lain: {
        id: 'layer_area_penggunaan_lain',
        name: 'Area Penggunaan Lain (APL)',
        category: 'Dataset Utama Pertanahan',
        update: '14-07-2026',
        wmsLayer: 'umum:area_penggunaan_lain',
        endpoint: 'https://bhumi.atrbpn.go.id/bhumigs/umum',
        type: 'wms',
        color: '#06b6d4'
      },
      kawasan_hutan: {
        id: 'layer_kawasan_hutan',
        name: 'Kawasan Hutan',
        category: 'Dataset Utama Pertanahan',
        update: '06-07-2026',
        wmsLayer: 'umum:penunjukan_kawasan_hutan',
        endpoint: 'https://bhumi.atrbpn.go.id/bhumigs/umum',
        type: 'wms',
        color: '#15803d'
      },
      pippib_2025: {
        id: 'layer_pippib_2025',
        name: 'Peta PIPPIB Tahun 2025 (Hutan Primer & Gambut)',
        category: 'Dataset Utama Pertanahan',
        update: '19-06-2026',
        wmsLayer: 'umum:pippib_2025',
        endpoint: 'https://bhumi.atrbpn.go.id/bhumigs/umum',
        type: 'wms',
        color: '#047857'
      },
      penggunaan_tanah: {
        id: 'layer_penggunaan_tanah',
        name: 'Penggunaan Tanah',
        category: 'Dataset Utama Pertanahan',
        update: '19-06-2026',
        wmsLayer: 'umum:PenggunaanTanah',
        endpoint: 'https://bhumi.atrbpn.go.id/bhumigs/umum',
        type: 'wms',
        color: '#3b82f6'
      },
      nilai_bidang_tanah: {
        id: 'layer_nilai_bidang_tanah',
        name: 'Peta Nilai Bidang Tanah',
        category: 'Dataset Utama Pertanahan',
        update: '19-06-2026',
        wmsLayer: 'umum:nbt3',
        endpoint: 'https://bhumi.atrbpn.go.id/bhumigs/umum',
        type: 'wms',
        color: '#eab308'
      },
      zona_nilai_tanah: {
        id: 'layer_zona_nilai_tanah',
        name: 'Zona Nilai Tanah (ZNT)',
        category: 'Dataset Utama Pertanahan',
        update: '19-06-2026',
        wmsLayer: 'umum:ZNTRANGE',
        endpoint: 'https://bhumi.atrbpn.go.id/bhumigs/umum',
        type: 'wms',
        color: '#ef4444'
      },
      toponim: {
        id: 'layer_toponim',
        name: 'Toponim Geospasial',
        category: 'Dataset Utama Pertanahan',
        update: '19-06-2026',
        wmsLayer: 'umum:toponimi',
        endpoint: 'https://bhumi.atrbpn.go.id/bhumigs/umum',
        type: 'wms',
        color: '#64748b'
      },
      index_peta_dasar: {
        id: 'layer_index_peta_dasar',
        name: 'Index Peta Dasar',
        category: 'Dataset Utama Pertanahan',
        update: '19-06-2026',
        wmsLayer: 'Index',
        endpoint: 'https://bhumi.atrbpn.go.id/petadasartmi/{x}/{y}/{z}',
        type: 'xyz',
        color: '#0284c7'
      },
      ptpr: {
        id: 'layer_ptpr',
        name: 'Peta Tematik Pertanahan dan Ruang (PTPR)',
        category: 'Dataset Turunan',
        update: '19-06-2026',
        wmsLayer: 'geoportal:PTPRPublish',
        endpoint: 'https://geoportaltematik.atrbpn.go.id/geoserver/geoportal',
        type: 'wms',
        color: '#6366f1'
      }
    };

    function getLayerCapKey(layerKey) {
      return layerKey.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    }

    function createThematicLayer(layerKey) {
      if (typeof map !== 'undefined' && map && !map.getPane('thematicPane')) {
        map.createPane('thematicPane');
        const p = map.getPane('thematicPane');
        if (p) p.style.zIndex = '450';
      }

      const def = BHUMI_RED_BOX_LAYERS[layerKey];
      if (!def) return null;

      const persilBase = getBpnGatewayBase();
      const hasProxy = isProxyActive && persilBase;

      if (def.type === 'xyz') {
        const tileUrl = hasProxy
          ? `${persilBase}/proxy-tile/{z}/{x}/{y}?upstream=${encodeURIComponent('https://bhumi.atrbpn.go.id/petadasartmi')}`
          : 'https://bhumi.atrbpn.go.id/petadasartmi/{z}/{x}/{y}';
        return L.tileLayer(tileUrl, {
          pane: 'thematicPane',
          maxZoom: 26,
          maxNativeZoom: 19,
          opacity: 0.75,
          zIndex: 450,
          attribution: 'Kementerian ATR/BPN'
        });
      }

      let wmsUrl = def.endpoint;
      const isGistaru = def.endpoint && def.endpoint.includes('gistaru-app.atrbpn.go.id');
      if (hasProxy && !isGistaru) {
        wmsUrl = `${persilBase}/proxy-wms`;
        if (def.endpoint && def.endpoint !== 'https://bhumi.atrbpn.go.id/bhumigs/umum') {
          wmsUrl += `?upstream=${encodeURIComponent(def.endpoint)}`;
        }
      }

      return L.tileLayer.wms(wmsUrl, {
        layers: def.wmsLayer,
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        crs: L.CRS.EPSG3857,
        pane: 'thematicPane',
        minZoom: 10,
        maxZoom: 26,
        opacity: 0.75,
        zIndex: 450,
        keepBuffer: 4,
        updateWhenZooming: false,
        attribution: 'Kementerian ATR/BPN'
      });
    }

    function updateDynamicMapLegend() {
      const body = document.getElementById('legendBody');
      if (!body) return;

      const isPersilActive = !document.getElementById('chkPersil') || !!document.getElementById('chkPersil')?.checked;
      let html = '';

      if (isPersilActive) {
        html += '<div class="legend-category-title">Batas &amp; Patok Kadastral (Dataset Utama)</div>';
        html += '<div class="legend-item"><span class="legend-swatch polygon-active"></span><span>Bidang Terpilih (Aktif Presisi)</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch polygon-bpn"></span><span>Batas Bidang Kadastral Resmi umum:Persil (Oranye)</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch node-patok"></span><span>Titik Patok Batas (Sudut Koordinat)</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch dist-label">12m</span><span>Dimensi Jarak Batas (Meter)</span></div>';
      }

      let hasThematic = false;
      const keys = Object.keys(cekingLayers);

      keys.forEach(k => {
        const capKey = getLayerCapKey(k);
        const cb = document.getElementById('chkCeking' + capKey) || document.getElementById('ceking' + capKey);
        const isChecked = cb && cb.checked;
        const def = BHUMI_RED_BOX_LAYERS[k];
        if (isChecked && def) {
          hasThematic = true;
          html += `<div class="legend-category-title">${def.category}: ${def.name}</div>`;
          html += `<div class="legend-item"><span class="legend-swatch" style="background-color:${def.color};border:1px solid ${def.color};"></span><span>Layer: ${def.wmsLayer} (Update: ${def.update})</span></div>`;
        }
      });

      if (!hasThematic) {
        html += '<div style="font-size: 0.67rem; color: var(--text-muted); padding: 5px 8px; background-color: var(--bg-subtle); border-radius: 4px; border: 1px dashed var(--border-light); margin-top: 6px; line-height: 1.35;">Aktifkan lapisan tematik resmi BHUMI di sidebar untuk melihat klasifikasi warna objek pada peta.</div>';
      }

      body.innerHTML = html;
    }

    function initCekingLayers() {
      if (!map.getPane('thematicPane')) {
        const tp = map.createPane('thematicPane');
        tp.style.zIndex = 340;
        tp.style.pointerEvents = 'none';
      }
      const keys = Object.keys(cekingLayers);
      keys.forEach(k => {
        cekingLayers[k] = createThematicLayer(k);
      });
      updateDynamicMapLegend();
    }

    function toggleCekingLayer(layerKey, checked) {
      if (checked) {
        if (typeof window.isFeatureOrLayerPermitted === 'function' && !window.isFeatureOrLayerPermitted(layerKey)) {
          if (typeof showToast === 'function') {
            showToast('Akses lapisan ' + String(layerKey).toUpperCase() + ' dibatasi oleh Administrator untuk role akun Anda.', 'warn');
          }
          const capKey = getLayerCapKey(layerKey);
          const cb = document.getElementById(`chkCeking${capKey}`) || document.getElementById(`ceking${capKey}`);
          if (cb) cb.checked = false;
          return;
        }
      }
      if (!cekingLayers[layerKey]) {
        cekingLayers[layerKey] = createThematicLayer(layerKey);
      }
      const layer = cekingLayers[layerKey];
      if (!layer) return;
      const capKey = getLayerCapKey(layerKey);
      const badge = document.getElementById(`badgeCeking${capKey}`);
      if (checked) {
        if (!map.hasLayer(layer)) map.addLayer(layer);
        if (persilLayer && map.hasLayer(persilLayer)) persilLayer.bringToFront();
        if (badge) { badge.className = 'badge-pill green'; badge.innerText = 'Aktif'; }
      } else {
        if (map.hasLayer(layer)) map.removeLayer(layer);
        if (badge) { badge.className = 'badge-pill'; badge.innerText = 'Off'; }
      }
      updateDynamicMapLegend();
    }

    function changeCekingOpacity(layerKey, val) {
      if (!cekingLayers[layerKey]) {
        cekingLayers[layerKey] = createThematicLayer(layerKey);
      }
      if (!cekingLayers[layerKey]) return;
      const opacity = val / 100;
      cekingLayers[layerKey].setOpacity(opacity);
      const capKey = getLayerCapKey(layerKey);
      const label = document.getElementById(`opacityLabel${capKey}`);
      if (label) label.innerText = `${val}%`;
    }

    function syncAdminMejaKerjaVisibility(isAdmin) {
      const card = document.getElementById('adminMejaKerjaCard');
      if (card) {
        card.style.display = isAdmin ? 'block' : 'none';
      }
    }

    function toggleMobileSidebar(forceClose = false) {
      const sb = document.getElementById('sidebar');
      const ov = document.getElementById('mobileOverlay');
      const fab = document.getElementById('mapSidebarFab');
      if (!sb || !ov) return;
      if (forceClose || sb.classList.contains('mobile-open')) {
        sb.classList.remove('mobile-open');
        ov.classList.remove('active');
        if (fab) fab.style.display = 'flex';
      } else {
        sb.classList.add('mobile-open');
        ov.classList.add('active');
        if (fab) fab.style.display = 'none';
      }
      setTimeout(() => map && map.invalidateSize(), 300);
    }

    function togglePersilLayer(checked) {
      if (!persilLayer) {
        setupPersilLayer();
      }
      if (checked) {
        if (!map.hasLayer(persilLayer)) map.addLayer(persilLayer);
        if (cadastreVectorLayer && !map.hasLayer(cadastreVectorLayer)) map.addLayer(cadastreVectorLayer);
        loadViewportCadastreSvgParcels();
      } else {
        if (map.hasLayer(persilLayer)) map.removeLayer(persilLayer);
        if (cadastreVectorLayer) cadastreVectorLayer.clearLayers();
        cadastreVectorParcelCache.clear();
      }
      const badge = document.getElementById('badgePersil');
      if (badge) {
        badge.className = checked ? 'badge-pill green' : 'badge-pill';
        badge.innerText = checked ? 'Aktif' : 'Nonaktif';
      }
    }

    function changePersilOpacity(val) {
      const opacity = val / 100;
      if (persilLayer && typeof persilLayer.setOpacity === 'function') {
        persilLayer.setOpacity(opacity);
      }
      const label = document.getElementById('opacityLabel');
      if (label) label.innerText = `${val}%`;
    }

    function getCadastreServerMode() {
      const mode = localStorage.getItem('cadastre_server_mode');
      return mode === 'server2' ? 'server2' : 'server1';
    }

    function switchCadastreServer(mode) {
      if (mode === 'server2') {
        localStorage.setItem('cadastre_server_mode', 'server2');
        showToast('Lapisan Server 2 Aktif (bhumi_persil - MPRX ATR/BPN)', 'success');
      } else {
        localStorage.setItem('cadastre_server_mode', 'server1');
        showToast('Lapisan Server 1 Aktif (umum:Persil - Bhumi Geos)', 'info');
      }
      if (typeof cadastreVectorParcelCache !== 'undefined' && cadastreVectorParcelCache) {
        cadastreVectorParcelCache.clear();
      }
      if (typeof cadastreVectorLayer !== 'undefined' && cadastreVectorLayer) {
        cadastreVectorLayer.clearLayers();
      }
      if (typeof persilClientCache !== 'undefined' && persilClientCache) {
        persilClientCache.clear();
      }
      if (typeof setupPersilLayer === 'function') {
        setupPersilLayer();
      } else if (typeof persilLayer !== 'undefined' && persilLayer && typeof persilLayer.redraw === 'function') {
        persilLayer.redraw();
      }
      if (typeof loadViewportCadastreSvgParcels === 'function') {
        loadViewportCadastreSvgParcels();
      }
      updateCadastreServerUI();
      return true;
    }

    function updateScaleTransitionUI() {
      if (!map) return;
      const z = map.getZoom();
      const scaleBadge = document.getElementById('scaleLevelBadge');
      const scaleHint = document.getElementById('scaleLevelHint');
      const zoomAlert = document.getElementById('zoomAlert');
      const zoomText = document.getElementById('currentZoomText');
      const badgeStatusBidang = document.getElementById('badgeStatusBidang');
      if (zoomText) zoomText.innerText = z;
      if (z < 15) {
        if (scaleBadge) {
          scaleBadge.className = 'badge-pill blue';
          scaleBadge.innerText = `Skala Makro (Zoom ${z})`;
        }
        if (scaleHint) {
          scaleHint.innerHTML = 'Tingkat Makro / Kota: Peta persil tidak dimuat untuk menghemat server. Perbesar ke Zoom &ge; 15 (batas desa/kelurahan) untuk memuat persil.';
        }
        if (zoomAlert) {
          zoomAlert.style.display = 'flex';
        }
        if (badgeStatusBidang) {
          badgeStatusBidang.className = 'badge-pill blue';
          badgeStatusBidang.innerText = 'Standby (< 15)';
        }
      } else {
        if (scaleBadge) {
          scaleBadge.className = 'badge-pill green';
          scaleBadge.innerText = `Skala Desa/Kelurahan (Zoom ${z})`;
        }
        if (scaleHint) {
          scaleHint.innerHTML = 'Tingkat Batas Desa/Kelurahan: Hamparan persil aktif. Klik bidang untuk deteksi Vektor SVG presisi.';
        }
        if (zoomAlert) {
          zoomAlert.style.display = 'none';
        }
        if (badgeStatusBidang) {
          badgeStatusBidang.className = 'badge-pill green';
          badgeStatusBidang.innerText = 'Aktif';
        }
      }
    }

    function toggleQuickThematicLayer(layerType, checked) {
      if (layerType === 'rtrw') {
        toggleCekingLayer('rtrw_kabkot', checked);
        const cbMain = document.getElementById('chkCekingRtrwKabkot');
        if (cbMain) cbMain.checked = checked;
      } else if (layerType === 'lp2b') {
        toggleCekingLayer('lppb', checked);
        const cbMain = document.getElementById('chkCekingLppb');
        if (cbMain) cbMain.checked = checked;
      } else if (layerType === 'lsd') {
        toggleCekingLayer('lsd_12_provinsi', checked);
        const cbMain = document.getElementById('chkCekingLsd12Prov') || document.getElementById('chkCekingLsd');
        if (cbMain) cbMain.checked = checked;
      }
      const badge = document.getElementById(`badgeQuick${layerType.toUpperCase()}`);
      if (badge) {
        badge.className = checked ? 'badge-pill green' : 'badge-pill';
        badge.innerText = checked ? 'Aktif' : 'Off';
      }
    }

    function updateCadastreServerUI() {
      const isAdmin = (typeof isMemberAdminActive === 'function') && isMemberAdminActive();
      const controlBox = document.getElementById('serverKadasterControlBox');
      if (controlBox) {
        controlBox.style.display = 'block';
      }
      const modalBox = document.getElementById('serverKadasterModalBox');
      if (modalBox) {
        modalBox.style.display = 'block';
      }
      const mode = getCadastreServerMode();
      const badge = document.getElementById('badgeServerKadaster');
      const badgeBidang = document.getElementById('badgeServerKadasterBidang');
      const btn1 = document.getElementById('btnServer1');
      const btn2 = document.getElementById('btnServer2');
      const btn1Bidang = document.getElementById('btnServer1Bidang');
      const btn2Bidang = document.getElementById('btnServer2Bidang');
      const pinServerText = document.getElementById('pinServerDataText') || document.getElementById('pinServerAktifText');

      if (mode === 'server2') {
        if (badge) {
          badge.className = 'badge-pill green';
          badge.innerText = 'bhumi_persil';
        }
        if (badgeBidang) {
          badgeBidang.className = 'badge-pill green';
          badgeBidang.innerText = 'bhumi_persil';
        }
        if (btn1) btn1.classList.remove('active');
        if (btn2) btn2.classList.add('active');
        if (btn1Bidang) btn1Bidang.classList.remove('active');
        if (btn2Bidang) btn2Bidang.classList.add('active');
        if (pinServerText) pinServerText.innerText = 'bhumi_persil (Server 2)';
      } else {
        if (badge) {
          badge.className = 'badge-pill blue';
          badge.innerText = 'umum:Persil';
        }
        if (badgeBidang) {
          badgeBidang.className = 'badge-pill blue';
          badgeBidang.innerText = 'umum:Persil';
        }
        if (btn1) btn1.classList.add('active');
        if (btn2) btn2.classList.remove('active');
        if (btn1Bidang) btn1Bidang.classList.add('active');
        if (btn2Bidang) btn2Bidang.classList.remove('active');
        if (pinServerText) pinServerText.innerText = 'umum:Persil (Server 1)';
      }

      const streamBox = document.getElementById('adminCadastreStreamBox');
      if (streamBox) {
        streamBox.style.display = isAdmin ? 'block' : 'none';
      }
      const streamMode = localStorage.getItem('cadastre_stream_mode') || 'vector_geojson';
      const selStream = document.getElementById('selectCadastreStream');
      if (selStream) selStream.value = streamMode;
      const badgeStream = document.getElementById('badgeStreamMode');
      if (badgeStream) badgeStream.innerText = streamMode.toUpperCase().replace('_', ' ');
      if (typeof updateCadastreStreamControlsUI === 'function') {
        updateCadastreStreamControlsUI(streamMode);
      }
      if (typeof updateAdminPolygonCoordsUI === 'function') {
        updateAdminPolygonCoordsUI();
      }
      updateScaleTransitionUI();
    }

    function isAxisAlignedRectangle(coords) {
      if (!coords || !Array.isArray(coords) || coords.length < 3 || coords.length > 5) return false;
      const lats = new Set(coords.map(c => (Number(c.lat) || 0).toFixed(5)));
      const lngs = new Set(coords.map(c => (Number(c.lng) || 0).toFixed(5)));
      return lats.size <= 2 && lngs.size <= 2;
    }

    function findCachedVectorParcelAt(lat, lng) {
      let hit = null;
      let minArea = Infinity;
      let nearest = null;
      let minDist = Infinity;

      if (typeof cadastreVectorParcelCache !== 'undefined' && cadastreVectorParcelCache && cadastreVectorParcelCache.size > 0) {
        for (const [_, layer] of cadastreVectorParcelCache.entries()) {
          if (!layer || !layer._parcelData) continue;
          const p = layer._parcelData;
          const coords = p.polygon_coords || p.coordinates;
          if (!coords || coords.length < 3) continue;

          if (typeof isPointInsideOrNearPolygon === 'function') {
            if (isPointInsideOrNearPolygon(lat, lng, coords, 0.05)) {
              const a = typeof calculatePolygonArea === 'function' ? calculatePolygonArea(coords) : 999999;
              if (a < minArea) {
                minArea = a;
                hit = p;
              }
            } else if (!hit && isPointInsideOrNearPolygon(lat, lng, coords, 4.5)) {
              hit = p;
            }
          }
        }
      }

      if (!hit && cadastreVectorLayer) {
        cadastreVectorLayer.eachLayer(layer => {
          if (!hit && layer && layer._parcelData) {
            const p = layer._parcelData;
            const coords = p.polygon_coords || p.coordinates;
            if (coords && coords.length >= 3 && typeof isPointInsideOrNearPolygon === 'function') {
              if (isPointInsideOrNearPolygon(lat, lng, coords, 3.5)) {
                hit = p;
              }
            }
          }
        });
      }

      return hit;
    }

    function traceParcelFromWmsTile(lat, lng, spanMeters = 45.0) {
      return new Promise((resolve) => {
        const span = Number(spanMeters) || 45.0;
        const r = 6378137.0;
        const cx = r * (lng * Math.PI / 180.0);
        const cy = r * Math.log(Math.tan(Math.PI / 4.0 + (lat * Math.PI / 180.0) / 2.0));
        const minx = cx - span;
        const maxx = cx + span;
        const miny = cy - span;
        const maxy = cy + span;
        const bbox = `${minx.toFixed(4)},${miny.toFixed(4)},${maxx.toFixed(4)},${maxy.toFixed(4)}`;
        const persilBase = getBpnGatewayBase();
        const streamBase = (persilBase && (persilBase.startsWith('http://') || persilBase.startsWith('https://'))) ? persilBase : DEFAULT_CLOUD_STREAM_GATEWAY;
        const mode = (typeof getCadastreServerMode === 'function') ? getCadastreServerMode() : 'server1';
        const layerName = (mode === 'server2') ? 'bhumi_persil' : 'umum:Persil';
        const tileUrl = `${streamBase}/proxy-wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=${layerName}&STYLES=&CRS=EPSG:3857&WIDTH=512&HEIGHT=512&BBOX=${bbox}`;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => resolve(null), 7000);

        img.onload = function() {
          clearTimeout(timer);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) { resolve(null); return; }
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, 512, 512);
            const data = imgData.data;

            const w = 512;
            const h = 512;
            let startX = 256;
            let startY = 256;
            let seedIdx = (startY * w + startX) * 4;
            let seedR = data[seedIdx];
            let seedG = data[seedIdx + 1];
            let seedB = data[seedIdx + 2];
            let seedA = data[seedIdx + 3];

            if (seedA >= 165 || seedA < 60) {
              for (let rad = 1; rad <= 25; rad++) {
                for (let dy = -rad; dy <= rad; dy++) {
                  for (let dx = -rad; dx <= rad; dx++) {
                    const nx = startX + dx;
                    const ny = startY + dy;
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                      const a = data[(ny * w + nx) * 4 + 3];
                      if (a >= 100 && a <= 165) {
                        startX = nx;
                        startY = ny;
                        seedIdx = (ny * w + nx) * 4;
                        seedR = data[seedIdx];
                        seedG = data[seedIdx + 1];
                        seedB = data[seedIdx + 2];
                        seedA = a;
                        break;
                      }
                    }
                  }
                  if (seedA >= 100 && seedA <= 165) break;
                }
                if (seedA >= 100 && seedA <= 165) break;
              }
            }

            if (seedA < 60) {
              resolve(null);
              return;
            }

            const isWall = new Uint8Array(w * h);
            for (let y = 0; y < h; y++) {
              const rowOffset = y * w * 4;
              for (let x = 0; x < w; x++) {
                const pxIdx = rowOffset + x * 4;
                const a = data[pxIdx + 3];
                const r = data[pxIdx], g = data[pxIdx + 1], b = data[pxIdx + 2];
                if (a < 60 || a >= 165) {
                  isWall[y * w + x] = 1;
                } else {
                  const isOrange = Math.hypot(r - 255, g - 170, b - 0) < 26;
                  const isGreen = Math.hypot(r - 75, g - 183, b - 72) < 26;
                  if (!isOrange && !isGreen) isWall[y * w + x] = 1;
                }
              }
            }

            const textVisited = new Uint8Array(w * h);
            const qTxtX = new Int16Array(w * h);
            const qTxtY = new Int16Array(w * h);
            for (let y = 2; y < h - 2; y++) {
              for (let x = 2; x < w - 2; x++) {
                const idx = y * w + x;
                if (isWall[idx] === 1 && textVisited[idx] === 0) {
                  let head = 0, tail = 0;
                  textVisited[idx] = 1;
                  qTxtX[tail] = x; qTxtY[tail] = y; tail++;
                  let minX = x, maxX = x, minY = y, maxY = y;
                  let touchesBorder = false;
                  while (head < tail) {
                    const cx = qTxtX[head], cy = qTxtY[head]; head++;
                    if (cx <= 1 || cx >= w - 2 || cy <= 1 || cy >= h - 2) touchesBorder = true;
                    if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
                    const nbs = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
                    for (let i = 0; i < 4; i++) {
                      const nx = nbs[i][0], ny = nbs[i][1];
                      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                        const nidx = ny * w + nx;
                        if (isWall[nidx] === 1 && textVisited[nidx] === 0) {
                          textVisited[nidx] = 1;
                          qTxtX[tail] = nx; qTxtY[tail] = ny; tail++;
                        }
                      }
                    }
                  }
                  const compW = maxX - minX + 1;
                  const compH = maxY - minY + 1;
                  if (!touchesBorder && compW <= 42 && compH <= 34 && tail < 480) {
                    for (let i = 0; i < tail; i++) {
                      isWall[qTxtY[i] * w + qTxtX[i]] = 0;
                    }
                  }
                }
              }
            }

            for (let y = 1; y < h - 1; y++) {
              const row = y * w;
              for (let x = 1; x < w - 1; x++) {
                const idx = row + x;
                if (isWall[idx] === 0) {
                  if ((isWall[idx - 1] === 1 && isWall[idx + 1] === 1) ||
                      (isWall[idx - w] === 1 && isWall[idx + w] === 1)) {
                    isWall[idx] = 1;
                  }
                }
              }
            }

            const visited = new Uint8Array(w * h);
            const queueX = new Int16Array(w * h);
            const queueY = new Int16Array(w * h);
            let head = 0;
            let tail = 0;

            visited[startY * w + startX] = 1;
            queueX[tail] = startX;
            queueY[tail] = startY;
            tail++;

            let minTracePx = 512, maxTracePx = 0, minTracePy = 512, maxTracePy = 0;
            while (head < tail) {
              const qx = queueX[head];
              const qy = queueY[head];
              head++;
              if (qx < minTracePx) minTracePx = qx;
              if (qx > maxTracePx) maxTracePx = qx;
              if (qy < minTracePy) minTracePy = qy;
              if (qy > maxTracePy) maxTracePy = qy;

              const neighbors = [
                [qx - 1, qy],
                [qx + 1, qy],
                [qx, qy - 1],
                [qx, qy + 1]
              ];
              for (let i = 0; i < 4; i++) {
                const nx = neighbors[i][0];
                const ny = neighbors[i][1];
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  const idx = ny * w + nx;
                  if (visited[idx] === 0 && isWall[idx] === 0) {
                    visited[idx] = 1;
                    queueX[tail] = nx;
                    queueY[tail] = ny;
                    tail++;
                  }
                }
              }
            }

            const totalPixels = tail;
            if (totalPixels < 40) {
              resolve(null);
              return;
            }
            const touchesTileEdge = (minTracePx <= 4 || maxTracePx >= w - 5 || minTracePy <= 4 || maxTracePy >= h - 5);
            if ((touchesTileEdge || totalPixels > (w * h * 0.85)) && span < 240.0) {
              traceParcelFromWmsTile(lat, lng, span * 1.8).then(resolve);
              return;
            }
            if (totalPixels > (w * h * 0.90)) {
              resolve(null);
              return;
            }

            const dilateQueue = [];
            for (let i = 0; i < tail; i++) {
              const qx = queueX[i], qy = queueY[i];
              const nb = [[qx - 1, qy], [qx + 1, qy], [qx, qy - 1], [qx, qy + 1]];
              for (let k = 0; k < 4; k++) {
                const nx = nb[k][0], ny = nb[k][1];
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  const nidx = ny * w + nx;
                  if (visited[nidx] === 0 && isWall[nidx] === 1) {
                    visited[nidx] = 1;
                    dilateQueue.push({ x: nx, y: ny, dist: 1 });
                  }
                }
              }
            }
            let dqHead = 0;
            while (dqHead < dilateQueue.length) {
              const item = dilateQueue[dqHead++];
              if (item.dist >= 2) continue;
              const { x: dx, y: dy, dist: ddist } = item;
              const nb = [[dx - 1, dy], [dx + 1, dy], [dx, dy - 1], [dx, dy + 1]];
              for (let k = 0; k < 4; k++) {
                const nx = nb[k][0], ny = nb[k][1];
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  const nidx = ny * w + nx;
                  if (visited[nidx] === 0 && isWall[nidx] === 1) {
                    visited[nidx] = 1;
                    dilateQueue.push({ x: nx, y: ny, dist: ddist + 1 });
                  }
                }
              }
            }

            let firstX = -1;
            let firstY = -1;
            for (let y = 0; y < h; y++) {
              const rowIdx = y * w;
              for (let x = 0; x < w; x++) {
                if (visited[rowIdx + x] === 1) {
                  firstX = x;
                  firstY = y;
                  break;
                }
              }
              if (firstX !== -1) break;
            }
            if (firstX === -1) { resolve(null); return; }

            const dirD = [
              [0, -1], [1, -1], [1, 0], [1, 1],
              [0, 1], [-1, 1], [-1, 0], [-1, -1]
            ];
            const contour = [{ x: firstX, y: firstY }];
            let currX = firstX;
            let currY = firstY;
            let backtrack = 6;

            for (let step = 0; step < 4000; step++) {
              let foundNext = false;
              for (let i = 0; i < 8; i++) {
                const cd = (backtrack + i) % 8;
                const nx = currX + dirD[cd][0];
                const ny = currY + dirD[cd][1];
                if (nx >= 0 && nx < w && ny >= 0 && ny < h && visited[ny * w + nx] === 1) {
                  currX = nx;
                  currY = ny;
                  contour.push({ x: currX, y: currY });
                  backtrack = (cd + 5) % 8;
                  foundNext = true;
                  break;
                }
              }
              if (!foundNext || (currX === firstX && currY === firstY && contour.length > 8)) break;
            }

            if (contour.length < 6) { resolve(null); return; }

            function distToSegment(pt, a, b) {
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              if (dx === 0 && dy === 0) return Math.hypot(pt.x - a.x, pt.y - a.y);
              return Math.abs(dy * pt.x - dx * pt.y + b.x * a.y - b.y * a.x) / Math.hypot(dx, dy);
            }

            function simplifyRdp(pts, eps) {
              if (pts.length < 3) return pts;
              let maxD = 0;
              let idx = 0;
              const last = pts.length - 1;
              for (let i = 1; i < last; i++) {
                const d = distToSegment(pts[i], pts[0], pts[last]);
                if (d > maxD) {
                  maxD = d;
                  idx = i;
                }
              }
              if (maxD > eps) {
                const left = simplifyRdp(pts.slice(0, idx + 1), eps);
                const right = simplifyRdp(pts.slice(idx), eps);
                return left.slice(0, -1).concat(right);
              }
              return [pts[0], pts[last]];
            }

            let maxDist = 0, pAIdx = 0, pBIdx = 0;
            const nC = contour.length;
            const cStep = nC > 300 ? 2 : 1;
            for (let i = 0; i < nC; i += cStep) {
              for (let j = i + 1; j < nC; j += cStep) {
                const d = Math.hypot(contour[i].x - contour[j].x, contour[i].y - contour[j].y);
                if (d > maxDist) { maxDist = d; pAIdx = i; pBIdx = j; }
              }
            }

            let ch1, ch2;
            if (pAIdx < pBIdx) {
              ch1 = contour.slice(pAIdx, pBIdx + 1);
              ch2 = contour.slice(pBIdx).concat(contour.slice(0, pAIdx + 1));
            } else {
              ch1 = contour.slice(pBIdx, pAIdx + 1);
              ch2 = contour.slice(pAIdx).concat(contour.slice(0, pBIdx + 1));
            }

            const s1 = simplifyRdp(ch1, 1.25);
            const s2 = simplifyRdp(ch2, 1.25);
            let simplified = s1.slice(0, -1).concat(s2.slice(0, -1));

            if (simplified.length < 3) { resolve(null); return; }

            let changedSpikes = true;
            let iterSpikes = 0;
            while (changedSpikes && simplified.length > 3 && iterSpikes < 8) {
              changedSpikes = false;
              iterSpikes++;
              const n = simplified.length;
              const kept = [];
              for (let i = 0; i < n; i++) {
                const prev = simplified[(i - 1 + n) % n];
                const curr = simplified[i];
                const next = simplified[(i + 1) % n];
                const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
                const d2 = Math.hypot(next.x - curr.x, next.y - curr.y);
                if (d1 === 0 || d2 === 0) { changedSpikes = true; continue; }
                const dot = ((curr.x - prev.x) * (next.x - curr.x) + (curr.y - prev.y) * (next.y - curr.y)) / (d1 * d2);
                const defl = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
                if (defl > 135 && (d1 < 4.8 || d2 < 4.8)) {
                  changedSpikes = true;
                  continue;
                }
                kept.push(curr);
              }
              simplified = kept;
            }

            let changedChamfer = true;
            let iterChamfer = 0;
            while (changedChamfer && simplified.length > 3 && iterChamfer < 8) {
              changedChamfer = false;
              iterChamfer++;
              const n = simplified.length;
              const kept = [];
              let skipNext = false;
              for (let i = 0; i < n; i++) {
                if (skipNext) { skipNext = false; continue; }
                const curr = simplified[i];
                const next = simplified[(i + 1) % n];
                const d = Math.hypot(next.x - curr.x, next.y - curr.y);
                if (d < 4.5 && n > 3) {
                  kept.push({
                    x: Math.round((curr.x + next.x) * 0.5),
                    y: Math.round((curr.y + next.y) * 0.5)
                  });
                  skipNext = true;
                  changedChamfer = true;
                } else {
                  kept.push(curr);
                }
              }
              simplified = kept;
            }

            if (simplified.length < 3) { resolve(null); return; }

            const polyCoords = [];
            for (let i = 0; i < simplified.length; i++) {
              const pt = simplified[i];
              if (i === simplified.length - 1 && pt.x === simplified[0].x && pt.y === simplified[0].y) continue;
              const mx = minx + ((pt.x + 0.5) / 512.0) * (maxx - minx);
              const my = maxy - ((pt.y + 0.5) / 512.0) * (maxy - miny);
              const pLat = (2.0 * Math.atan(Math.exp(my / r)) - Math.PI / 2.0) * 180.0 / Math.PI;
              const pLng = (mx / r) * 180.0 / Math.PI;
              polyCoords.push({
                lat: Number(pLat.toFixed(7)),
                lng: Number(pLng.toFixed(7))
              });
            }

            let cleanPolyCoords = removeCollinearVertices(polyCoords, 4.5);
            if (cleanPolyCoords.length < 3) { resolve(null); return; }
            if (typeof cleanAndDeduplicateVertices === 'function') {
              cleanPolyCoords = cleanAndDeduplicateVertices(cleanPolyCoords, 0.40, 4.5);
            }
            if (cleanPolyCoords.length < 3) { resolve(null); return; }

            const exactArea = (typeof calculatePolygonArea === 'function') ? calculatePolygonArea(cleanPolyCoords) : 0;
            if (exactArea < 5.0) { resolve(null); return; }

            const cLat = cleanPolyCoords.reduce((s, c) => s + c.lat, 0) / cleanPolyCoords.length;
            const cLng = cleanPolyCoords.reduce((s, c) => s + c.lng, 0) / cleanPolyCoords.length;
            const parcelFid = 'PERSIL-WMS-' + Math.round(cLat * 100000) + '-' + Math.round(cLng * 100000);
            resolve({
              found: true,
              is_official_cadastre: true,
              is_auto_traced: true,
              fid: parcelFid,
              nib: '-',
              tipe_hak: '-',
              luas_m2: Math.round(exactArea),
              luas_ukur_m2: Math.round(exactArea),
              luas_terdaftar_m2: 0,
              polygon_coords: cleanPolyCoords,
              status_validasi: 'Batas Bidang Kadaster Terdeteksi (SVG)',
              source: 'VEKTOR PERSIL SVG PRESISI'
            });
          } catch (err) {
            resolve(null);
          }
        };

        img.onerror = function() {
          clearTimeout(timer);
          resolve(null);
        };
        img.src = tileUrl;
      });
    }

    async function fetchPersilCadastreData(lat, lng, zoom = 19) {
      const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      const cached = persilClientCache.get(cacheKey);
      if (cached && cached.data && cached.data.found && !cached.data.is_bbox && (Date.now() - cached.time < 600000)) {
        return cached.data;
      }

      const traced = await traceParcelFromWmsTile(lat, lng);
      if (traced && traced.found && Array.isArray(traced.polygon_coords) && traced.polygon_coords.length >= 3) {
        persilClientCache.set(cacheKey, { data: traced, time: Date.now() });
        return traced;
      }

      const mode = getCadastreServerMode();
      const endpointsToTry = [];
      const persilApiBase = getBpnGatewayBase();
      const sbKey = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY) ? SUPABASE_ANON_KEY : 'sb_publishable_NBReVvac6_FUBe969fLbOw_ZGZjcwKM';
      const sbUrl = (typeof SUPABASE_PROJECT_URL !== 'undefined' && SUPABASE_PROJECT_URL) ? SUPABASE_PROJECT_URL : 'https://vezruyffzmabhtylxigc.supabase.co';

      if (persilApiBase) {
        if (persilApiBase.includes('supabase.co')) {
          endpointsToTry.push({
            url: `${persilApiBase}?action=get-persil&lat=${lat.toFixed(7)}&lng=${lng.toFixed(7)}&zoom=${zoom}&server=${mode}`,
            headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey },
            timeout: 3000
          });
        } else {
          endpointsToTry.push({
            url: `${persilApiBase}/api/persil-info?lat=${lat.toFixed(7)}&lng=${lng.toFixed(7)}&zoom=${zoom}&server=${mode}`,
            timeout: 3000
          });
        }
      } else if (typeof window !== 'undefined' && window.location && window.location.protocol === 'http:') {
        endpointsToTry.push({
          url: `/api/persil-info?lat=${lat.toFixed(7)}&lng=${lng.toFixed(7)}&zoom=${zoom}&server=${mode}`,
          timeout: 2000
        });
      }

      endpointsToTry.push({
        url: `${sbUrl}/functions/v1/cadastre-gateway?action=get-persil&lat=${lat.toFixed(7)}&lng=${lng.toFixed(7)}&zoom=${zoom}&server=${mode}`,
        headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey },
        timeout: 3000
      });

      for (const item of endpointsToTry) {
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), item.timeout || 4000);
          const reqOpt = { signal: controller.signal, mode: 'cors' };
          if (item.headers) reqOpt.headers = item.headers;
          const res = await fetch(item.url, reqOpt);
          clearTimeout(tid);
          if (res.ok) {
            const data = await res.json();
            if (data && data.found && Array.isArray(data.polygon_coords) && data.polygon_coords.length >= 3) {
              if (data.polygon_coords.length <= 200) {
                persilClientCache.set(cacheKey, { data, time: Date.now() });
                return data;
              }
            }
            if (data && Array.isArray(data.features) && data.features.length > 0) {
              const parsed = parseGeoServerPersilGeoJson(data, lat, lng);
              if (parsed && parsed.found && Array.isArray(parsed.polygon_coords) && parsed.polygon_coords.length >= 3 && parsed.polygon_coords.length <= 200) {
                persilClientCache.set(cacheKey, { data: parsed, time: Date.now() });
                return parsed;
              }
            }
          }
        } catch (e) {}
      }

      return {
        found: false,
        message: 'Titik koordinat berada di luar bidang tanah terdaftar ATR/BPN.',
        polygon_coords: null
      };
    }

    async function fetchSpatialStatusData(lat, lng) {
      const statusRes = {
        rtrw: '-',
        rdtr: '-',
        lsd: 'Bukan Kawasan LSD',
        lbs: 'Bukan Lahan Baku Sawah',
        hutan: 'Bukan Kawasan Hutan (APL)',
        znt: '-',
        znt_range: '-'
      };

      const endpoints = [];
      const customBase = getBpnGatewayBase();
      if (customBase && (customBase.startsWith('https://') || customBase.startsWith('http://'))) {
        endpoints.push(`${customBase}/api/spatial-status?lat=${lat}&lng=${lng}`);
      }
      const sbKey = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY) ? SUPABASE_ANON_KEY : 'sb_publishable_NBReVvac6_FUBe969fLbOw_ZGZjcwKM';
      const sbUrl = (typeof SUPABASE_PROJECT_URL !== 'undefined' && SUPABASE_PROJECT_URL) ? SUPABASE_PROJECT_URL : 'https://vezruyffzmabhtylxigc.supabase.co';
      endpoints.push({
        url: `${sbUrl}/functions/v1/cadastre-gateway?action=spatial-status&lat=${lat}&lng=${lng}`,
        headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey }
      });

      for (let i = 0; i < endpoints.length; i++) {
        const ep = endpoints[i];
        const targetUrl = typeof ep === 'string' ? ep : ep.url;
        const targetHeaders = (typeof ep === 'object' && ep.headers) ? ep.headers : undefined;
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 6000);
          const opt = { signal: ctrl.signal, mode: 'cors' };
          if (targetHeaders) opt.headers = targetHeaders;
          const resp = await fetch(targetUrl, opt);
          clearTimeout(tid);
          if (resp.ok) {
            const json = await resp.json();
            if (json && (json.lsd || json.lbs || json.rtrw || json.hutan)) {
              return Object.assign(statusRes, json);
            }
          }
        } catch (e) {}
      }

      try {
        const r = 6378137.0;
        const cx = r * (lng * Math.PI / 180);
        const cy = r * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
        const deltaM = 100.0;
        const minX = (cx - deltaM).toFixed(4);
        const maxX = (cx + deltaM).toFixed(4);
        const minY = (cy - deltaM).toFixed(4);
        const maxY = (cy + deltaM).toFixed(4);
        const bbox3857 = `${minX},${minY},${maxX},${maxY}`;
        const wmsBase = 'https://atlas.atrbpn.go.id/geoserver/wms';

        const queryWmsLayer = async (layerName) => {
          const directUrl = `${wmsBase}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&LAYERS=${encodeURIComponent(layerName)}&QUERY_LAYERS=${encodeURIComponent(layerName)}&SRS=EPSG:3857&BBOX=${bbox3857}&WIDTH=101&HEIGHT=101&X=50&Y=50&INFO_FORMAT=application/json&FEATURE_COUNT=5`;
          const proxyUrl = `${sbUrl}/functions/v1/cadastre-gateway?action=proxy-wms&url=${encodeURIComponent(directUrl)}`;
          try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 4000);
            const resp = await fetch(proxyUrl, {
              signal: ctrl.signal,
              headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey }
            });
            clearTimeout(tid);
            if (resp.ok) return await resp.json();
          } catch (e) {}
          return null;
        };

        const queryKlhkDirect = async () => {
          const minLng = (lng - 0.001).toFixed(6);
          const minLat = (lat - 0.001).toFixed(6);
          const maxLng = (lng + 0.001).toFixed(6);
          const maxLat = (lat + 0.001).toFixed(6);
          const klhkUrl = `https://geoportal.planologi.kehutanan.go.id/server/rest/services/Peta_Interaktif_2026/KWSHUTAN_AR_250K/MapServer/identify?geometry=${lng},${lat}&geometryType=esriGeometryPoint&sr=4326&layers=all&tolerance=3&mapExtent=${minLng},${minLat},${maxLng},${maxLat}&imageDisplay=101,101,96&returnGeometry=false&f=json`;
          try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 3500);
            const resp = await fetch(klhkUrl, { signal: ctrl.signal });
            clearTimeout(tid);
            if (resp.ok) return await resp.json();
          } catch (e) {}
          return null;
        };

        const [resLsd, resLbs, resRtrw, resRdtr, resZnt, resHutan] = await Promise.allSettled([
          queryWmsLayer('umum:lsd_merge'),
          queryWmsLayer('geonode:lbs_parsial'),
          queryWmsLayer('rtr-online:rtrw_kabkot'),
          queryWmsLayer('rtr-online:rdtr_kabkot'),
          queryWmsLayer('umum:ZNT'),
          queryKlhkDirect()
        ]);

        if (resLsd.status === 'fulfilled' && resLsd.value && resLsd.value.features && resLsd.value.features.length > 0) {
          const props = resLsd.value.features[0].properties || {};
          const ket = props.lsd || props.layer || 'Dipertahankan';
          statusRes.lsd = `LSD Dipertahankan (${ket})`;
        } else if (resLsd.status === 'fulfilled' && resLsd.value && Array.isArray(resLsd.value.features)) {
          statusRes.lsd = 'Bukan Kawasan LSD';
        } else {
          statusRes.lsd = '-';
        }

        if (resLbs.status === 'fulfilled' && resLbs.value && resLbs.value.features && resLbs.value.features.length > 0) {
          const props = resLbs.value.features[0].properties || {};
          const jswh = props.jswh || props.qname25 || props.namobj || 'Baku Sawah';
          statusRes.lbs = `Lahan Baku Sawah (${jswh})`;
        } else if (resLbs.status === 'fulfilled' && resLbs.value && Array.isArray(resLbs.value.features)) {
          statusRes.lbs = 'Bukan Lahan Baku Sawah';
        } else {
          statusRes.lbs = '-';
        }

        if (resRtrw.status === 'fulfilled' && resRtrw.value && resRtrw.value.features && resRtrw.value.features.length > 0) {
          const props = resRtrw.value.features[0].properties || {};
          statusRes.rtrw = props.namobj || props.jnsrpr || '-';
        } else if (resRtrw.status === 'fulfilled' && resRtrw.value && Array.isArray(resRtrw.value.features)) {
          statusRes.rtrw = 'Belum Terpetakan di RTRW Online';
        } else {
          statusRes.rtrw = '-';
        }

        if (resRdtr.status === 'fulfilled' && resRdtr.value && resRdtr.value.features && resRdtr.value.features.length > 0) {
          const props = resRdtr.value.features[0].properties || {};
          statusRes.rdtr = props.namobj || props.sub_zona || props.zona || '-';
        } else if (resRdtr.status === 'fulfilled' && resRdtr.value && Array.isArray(resRdtr.value.features)) {
          statusRes.rdtr = 'Belum Tersedia RDTR Interaktif';
        } else {
          statusRes.rdtr = '-';
        }

        if (resZnt.status === 'fulfilled' && resZnt.value && resZnt.value.features && resZnt.value.features.length > 0) {
          const props = resZnt.value.features[0].properties || {};
          const nirVal = props.NILAI || props.MEAN;
          const zoneNum = props.NOMORZONE || 'Resmi';
          const rangeText = props.RANGENILAI || '';
          const kelasNum = props.KELASNILAI || '';
          statusRes.znt = nirVal ? `Zona ${zoneNum} (NIR: Rp ${Number(nirVal).toLocaleString('id-ID')} / m²)` : `Zona ${zoneNum}`;
          if (rangeText) {
            const cleanRange = String(rangeText).replace('>', '> Rp ');
            statusRes.znt_range = `${cleanRange} / m²${kelasNum ? ` (Kelas ${kelasNum})` : ''}`;
          } else if (nirVal) {
            const num = Number(nirVal);
            statusRes.znt_range = `Rp ${Math.round(num * 0.85).toLocaleString('id-ID')} - Rp ${Math.round(num * 1.20).toLocaleString('id-ID')} / m²`;
          }
        } else if (resZnt.status === 'fulfilled' && resZnt.value && Array.isArray(resZnt.value.features)) {
          statusRes.znt = 'Belum Dipetakan ZNT';
          statusRes.znt_range = '-';
        } else {
          statusRes.znt = '-';
          statusRes.znt_range = '-';
        }

        if (resHutan.status === 'fulfilled' && resHutan.value && resHutan.value.results && resHutan.value.results.length > 0) {
          statusRes.hutan = resHutan.value.results[0].attributes?.FUNGSIKWS || resHutan.value.results[0].value || 'Kawasan Hutan Negara';
        } else if (resHutan.status === 'fulfilled' && resHutan.value && Array.isArray(resHutan.value.results)) {
          statusRes.hutan = 'Bukan Kawasan Hutan (APL)';
        } else {
          statusRes.hutan = '-';
        }
      } catch (err) {}

      return statusRes;
    }

    window.renderBidangInfoPanel = function(pinData, vertices) {
      const p = pinData || activePinData || {};
      const v = vertices || (typeof activeVertices !== 'undefined' ? activeVertices : []);

      function setRow(rowId, textId, val) {
        const row = document.getElementById(rowId);
        const text = document.getElementById(textId);
        const isValid = val && typeof val === 'string' && val.trim() !== '' && val.trim() !== '-' && val.trim() !== 'null' && val.trim() !== 'undefined' && !val.includes('Memuat') && !val.includes('Memeriksa') && !val.includes('Memverifikasi');
        if (row) {
          row.style.display = isValid ? 'flex' : 'none';
        }
        if (text && isValid) {
          text.innerText = val.trim();
        }
      }

      const elCanvasM2 = document.getElementById('canvasLiveAreaM2');
      const elValHa = document.getElementById('valLuasHa');

      let luasGambar = 0;
      if (v && v.length >= 3 && typeof calculatePolygonArea === 'function') {
        luasGambar = calculatePolygonArea(v);
      } else if (p.luas_ukur_m2 && Number(p.luas_ukur_m2) > 0) {
        luasGambar = Number(p.luas_ukur_m2);
      } else if (p.luas_m2 && Number(p.luas_m2) > 0) {
        luasGambar = Number(p.luas_m2);
      }

      if (elCanvasM2 && luasGambar > 0) {
        elCanvasM2.innerText = (typeof formatAreaM2 === 'function') ? formatAreaM2(luasGambar) : (Math.round(luasGambar).toLocaleString('id-ID') + ' m²');
      }
      if (elValHa && luasGambar > 0) {
        elValHa.innerText = (typeof formatAreaHa === 'function') ? formatAreaHa(luasGambar) : ((luasGambar / 10000.0).toFixed(4) + ' Ha');
      }

      const badgeHak = document.getElementById('badgeTipeHak');
      if (badgeHak) {
        badgeHak.style.display = 'none';
      }

      const nibVal = (p.nib && p.nib !== '-' && !p.is_auto_traced) ? (p.nib_lengkap || p.nib) : null;
      setRow('rowPinNib', 'pinNibText', nibVal);
      setRow('rowPinTipeHak', 'pinTipeHakText', null);
      setRow('rowPinNomorHak', 'pinNomorHakText', (p.nomor_hak && p.nomor_hak !== '-' && !p.is_auto_traced) ? p.nomor_hak : null);
      setRow('rowPinKabkot', 'pinKabkotText', (p.kabkot && p.kabkot !== '-') ? p.kabkot : null);
      setRow('rowPinKecamatan', 'pinKecamatanText', null);
      setRow('rowPinDesa', 'pinDesaText', null);

      if (p.lat && p.lng) {
        setRow('rowPinCoords', 'pinCoordsText', p.lat.toFixed(6) + ', ' + p.lng.toFixed(6));
      } else {
        setRow('rowPinCoords', 'pinCoordsText', null);
      }

      if (v && v.length >= 3) {
        let kelilingM = 0;
        for (let i = 0; i < v.length; i++) {
          const a = v[i], b = v[(i + 1) % v.length];
          kelilingM += L.latLng(a.lat, a.lng).distanceTo(L.latLng(b.lat, b.lng));
        }
        setRow('rowPinKeliling', 'pinKelilingText', kelilingM.toFixed(2) + ' m');
        setRow('rowPinJumlahPatok', 'pinJumlahPatokText', v.length + ' Titik Sudut');
      } else {
        setRow('rowPinKeliling', 'pinKelilingText', null);
        setRow('rowPinJumlahPatok', 'pinJumlahPatokText', null);
      }

      setRow('rowPinStatusValidasi', 'pinStatusValidasiText', (p.status_validasi && p.status_validasi !== '-') ? p.status_validasi : null);
      setRow('rowPinKantah', 'pinKantahText', (p.kantah && p.kantah !== '-' && p.kantah !== 'Kantor Pertanahan') ? p.kantah : null);
      setRow('rowPinKlusterPtsl', 'pinKlusterPtslText', (p.kluster_ptsl && p.kluster_ptsl !== '-') ? p.kluster_ptsl : null);
      setRow('rowPinAkurasiAlat', 'pinAkurasiAlatText', (p.akurasibidang && p.akurasibidang !== '-') ? p.akurasibidang : null);
      setRow('rowPinRtrw', 'pinRtrwText', p.rtrw);
      setRow('rowPinRdtr', 'pinRdtrText', p.rdtr);
      setRow('rowPinLsd', 'pinLsdText', p.lsd);
      setRow('rowPinLbs', 'pinLbsText', p.lbs);
      setRow('rowPinHutan', 'pinHutanText', p.hutan);
      setRow('rowPinZnt', 'pinZntText', p.znt);
      setRow('rowPinZntRange', 'pinZntRangeText', p.znt_range);

      if (typeof updateAdminPolygonCoordsUI === 'function') {
        updateAdminPolygonCoordsUI();
      }
    };

    function renderCadastralProFields() {
      if (typeof window.renderBidangInfoPanel === 'function') {
        window.renderBidangInfoPanel();
      }
    }

    async function handleMapClick(lat, lng, doSwitchTab = true) {
      if (window.isBoundaryEditingActive) {
        showToast('Sedang dalam Mode Pengeditan Bidang: Selesaikan penataan patok atau klik Atur Ulang jika ingin memilih bidang lain.', 'warn');
        return;
      }
      if (typeof isMergeMode !== 'undefined' && isMergeMode) {
        if (typeof handleMergeParcelClick === 'function') {
          handleMergeParcelClick(lat, lng);
        }
        return;
      }

      isParcelLocked = false;
      if (typeof clearCanvasRebuilderLayers === 'function') {
        clearCanvasRebuilderLayers();
      }
      const seq = ++persilFetchSeq;
      const noPin = document.getElementById('noPinAlert');
      const foundBox = document.getElementById('persilFoundBox');
      const notFoundBox = document.getElementById('persilNotFoundBox');
      const loadingBar = document.getElementById('sidebarLoadingBar');

      if (loadingBar) loadingBar.classList.add('active');
      if (noPin) noPin.style.display = 'none';
      if (notFoundBox) notFoundBox.style.display = 'none';
      if (foundBox) {
        foundBox.style.display = 'flex';
        foundBox.classList.add('data-loading');
      }

      const dms = toDMS(lat, lng);
      const utm = getUtmZone(lat, lng);
      const mercator = toWebMercator(lat, lng);

      const elCoords = document.getElementById('pinCoordsText');
      if (elCoords) elCoords.innerText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      const elDms = document.getElementById('pinDmsText');
      if (elDms) elDms.innerText = dms;
      const elUtm = document.getElementById('pinUtmText');
      if (elUtm) elUtm.innerText = utm;
      const elMercator = document.getElementById('pinMercatorText');
      if (elMercator) elMercator.innerText = `X: ${Math.round(mercator.x)}, Y: ${Math.round(mercator.y)}`;

      if (activePinMarker) {
        map.removeLayer(activePinMarker);
      }

      const pinIcon = L.divIcon({
        className: 'custom-pin-marker',
        html: `<div style="background-color:var(--accent); width:20px; height:20px; border-radius:50%; border:2px solid #ffffff; box-shadow:0 3px 8px rgba(10,46,92,0.35); display:flex; align-items:center; justify-content:center;"><div style="width:6px; height:6px; border-radius:50%; background:#ffffff;"></div></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });

      activePinMarker = L.marker([lat, lng], {
        icon: pinIcon,
        draggable: true
      }).addTo(map);

      activePinMarker.on('dragend', function(ev) {
        const pos = ev.target.getLatLng();
        handleMapClick(pos.lat, pos.lng, false);
      });

      if (doSwitchTab) {
        switchTab('tab-bidang');
      }

      try {
        const persilPromise = fetchPersilCadastreData(lat, lng, map.getZoom() || 19);
        const geoPromise = fetchLocationDetails(lat, lng);
        const [persilData, geoData] = await Promise.all([persilPromise, geoPromise]);

        if (seq !== persilFetchSeq) {
          return;
        }

        const effectivePersil = persilData;
        if (effectivePersil && effectivePersil.found && effectivePersil.polygon_coords && effectivePersil.polygon_coords.length >= 3) {
          isGeometryManuallyEdited = false;

          const decoded = (typeof decodeBpnCadastralStructure === 'function')
            ? decodeBpnCadastralStructure({
                nomor: effectivePersil.nomor_hak || effectivePersil.nomor,
                nib: effectivePersil.nib,
                tipehak: effectivePersil.tipe_hak,
                tahun: effectivePersil.tahun,
                nosu: effectivePersil.nosu,
                provinsi: effectivePersil.provinsi || (geoData && geoData.provinsi),
                kabupaten: effectivePersil.kabkot || (geoData && geoData.kabkot),
                kecamatan: effectivePersil.kecamatan || (geoData && geoData.kecamatan),
                desa: effectivePersil.desa || (geoData && geoData.desa),
                kantah: effectivePersil.kantah || (geoData && geoData.kantah)
              }, lat, lng, geoData)
            : null;

          const exactAreaM2 = (typeof calculatePolygonArea === 'function' && effectivePersil.polygon_coords)
            ? calculatePolygonArea(effectivePersil.polygon_coords)
            : (effectivePersil.luas_m2 || 0);

          const registeredAreaM2 = (effectivePersil.luas_terdaftar_m2 && Number(effectivePersil.luas_terdaftar_m2) > 0)
            ? Number(effectivePersil.luas_terdaftar_m2)
            : ((effectivePersil.luas_bpn && Number(effectivePersil.luas_bpn) > 0) ? Number(effectivePersil.luas_bpn) : ((effectivePersil.luas_m2 && Number(effectivePersil.luas_m2) > 0 && !effectivePersil.is_auto_traced) ? Number(effectivePersil.luas_m2) : 0));

          activePinData = {
            lat: lat,
            lng: lng,
            fid: effectivePersil.fid || (decoded ? decoded.nib_lengkap : '-'),
            nib: decoded ? decoded.nib : (effectivePersil.nib || '-'),
            nib_lengkap: decoded ? decoded.nib_lengkap : (effectivePersil.nib_lengkap || effectivePersil.nib || '-'),
            tipe_hak: decoded ? decoded.tipe_hak : (effectivePersil.tipe_hak || '-'),
            nomor_hak: decoded ? decoded.nomor_hak : (effectivePersil.nomor_hak || '-'),
            nomor_hak_raw: decoded ? decoded.nomor_hak_raw : (effectivePersil.nomor_hak_raw || '-'),
            nosu: decoded ? decoded.nosu : (effectivePersil.nosu || '-'),
            tahun: decoded ? decoded.tahun : (effectivePersil.tahun || '-'),
            luas_m2: Math.round(exactAreaM2),
            luas_ukur_m2: Math.round(exactAreaM2),
            luas_terdaftar_m2: registeredAreaM2 > 0 ? Math.round(registeredAreaM2) : 0,
            desa: decoded ? decoded.desa : ((effectivePersil.desa && effectivePersil.desa !== '-') ? effectivePersil.desa : ((geoData && geoData.desa !== '-') ? geoData.desa : '-')),
            kecamatan: decoded ? decoded.kecamatan : ((effectivePersil.kecamatan && effectivePersil.kecamatan !== '-') ? effectivePersil.kecamatan : ((geoData && geoData.kecamatan !== '-') ? geoData.kecamatan : '-')),
            kabkot: decoded ? decoded.kabkot : ((effectivePersil.kabkot && effectivePersil.kabkot !== '-') ? effectivePersil.kabkot : ((geoData && geoData.kabkot !== '-') ? geoData.kabkot : '-')),
            provinsi: decoded ? decoded.provinsi : ((effectivePersil.provinsi && effectivePersil.provinsi !== '-') ? effectivePersil.provinsi : ((geoData && geoData.provinsi !== '-') ? geoData.provinsi : '-')),
            kodepos: (geoData && geoData.kodepos !== '-') ? geoData.kodepos : '-',
            kantah: decoded ? decoded.kantah : ((effectivePersil.kantah && effectivePersil.kantah !== '-') ? effectivePersil.kantah : ((geoData && geoData.kantah && geoData.kantah !== 'Kantor Pertanahan') ? geoData.kantah : '-')),
            kluster_ptsl: decoded ? decoded.kluster_ptsl : '-',
            akurasibidang: decoded ? decoded.akurasibidang : '-',
            alatukur: decoded ? decoded.alatukur : '-',
            status_validasi: decoded ? decoded.status_validasi : (effectivePersil.status_validasi || 'Terdaftar di Basis Data'),
            rtrw: 'Memuat status RTRW...',
            rdtr: 'Memuat status RDTR...',
            lsd: 'Memverifikasi status LSD...',
            lbs: 'Memverifikasi status LBS...',
            hutan: 'Memeriksa status Kawasan Hutan...',
            znt: 'Memuat Zona Nilai Tanah...',
            znt_range: 'Memuat rentang nilai...',
            polygon_coords: effectivePersil.polygon_coords,
            is_bbox: effectivePersil.is_bbox,
            source: effectivePersil.is_bbox ? 'KADASTER BBOX' : 'VEKTOR BPN ASLI',
            alamat: (geoData && geoData.jalan && geoData.jalan !== '-') ? geoData.jalan : [decoded?.desa, decoded?.kecamatan, decoded?.kabkot].filter(v => v && v !== '-').join(', ') || 'Lokasi Titik Bidang'
          };

          const lokasiUtama = (activePinData.desa !== '-' && activePinData.kecamatan !== '-')
            ? `${activePinData.desa}, ${activePinData.kecamatan}`
            : (activePinData.desa !== '-' ? activePinData.desa : (activePinData.kabkot !== '-' ? activePinData.kabkot : 'Bidang Tanah'));

          const elLokasi = document.getElementById('pinLokasiUtamaText');
          if (elLokasi) elLokasi.innerText = lokasiUtama;

          const elTipeHak = document.getElementById('pinTipeHakText');
          if (elTipeHak) elTipeHak.innerText = activePinData.tipe_hak;
          renderCadastralProFields();
          fetchSpatialStatusData(lat, lng).then(status => {
            if (activePinData && Math.abs(activePinData.lat - lat) < 0.001 && Math.abs(activePinData.lng - lng) < 0.001) {
              Object.assign(activePinData, status);
              renderCadastralProFields();
            }
          });
          const elStatusValidasi = document.getElementById('pinStatusValidasiText');
          if (elStatusValidasi) {
            elStatusValidasi.className = 'spec-value emerald';
            elStatusValidasi.innerText = activePinData.status_validasi || 'Kadaster Resmi Presisi';
          }
          const elPinServer = document.getElementById('pinServerDataText') || document.getElementById('pinServerAktifText');
          if (elPinServer) {
            elPinServer.innerText = (getCadastreServerMode() === 'server2') ? 'Server 2' : 'Server 1';
          }

          const badgeEl = document.getElementById('badgeTipeHak');
          if (badgeEl) badgeEl.innerText = activePinData.tipe_hak;

          const elLegalitas = document.getElementById('legalitasSummaryText');
          if (elLegalitas) {
            elLegalitas.innerText = `Terverifikasi Resmi : Status ${activePinData.tipe_hak || 'Hak Milik'}`;
          }

          const elAlamatGmaps = document.getElementById('pinAlamatGmapsText');
          if (elAlamatGmaps) {
            elAlamatGmaps.innerText = activePinData.alamat !== '-' ? activePinData.alamat : `${activePinData.kabkot}, ${activePinData.provinsi}`;
          }

          const elShpProv = document.getElementById('shpProvinsi');
          if (elShpProv && activePinData.provinsi !== '-') elShpProv.value = activePinData.provinsi.toUpperCase();

          const elShpKeterangan = document.getElementById('shpKeterangan');
          if (elShpKeterangan) {
            const rawKet = activePinData.alamat !== '-' ? activePinData.alamat : `Bidang ${activePinData.kabkot}`;
            elShpKeterangan.value = rawKet.toUpperCase();
          }
          if (typeof updateShpLuasDisplay === 'function') updateShpLuasDisplay();

          const elKab = document.getElementById('pinKabkotText'); if (elKab) elKab.innerText = activePinData.kabkot;
          const elProv = document.getElementById('pinProvinsiText'); if (elProv) elProv.innerText = activePinData.provinsi;
          const elKodePos = document.getElementById('pinKodePosText'); if (elKodePos) elKodePos.innerText = activePinData.kodepos;

          const bhumiUrl = `https://bhumi.atrbpn.go.id/peta?latitude=${lat.toFixed(6)}&longitude=${lng.toFixed(6)}&zoom=19`;
          const btnBhumi = document.getElementById('btnLinkBhumi');
          if (btnBhumi) btnBhumi.href = bhumiUrl;
          const btnGmaps = document.getElementById('btnLinkGoogleMaps');
          if (btnGmaps) btnGmaps.href = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

          if (foundBox) foundBox.style.display = 'flex';
          if (notFoundBox) notFoundBox.style.display = 'none';

          const hud = document.getElementById('canvasHud');
          if (hud) {
            hud.style.display = 'flex';
            const elHudNib = document.getElementById('hudNib');
            if (elHudNib) elHudNib.innerText = lokasiUtama;
            const elHudArea = document.getElementById('hudBpnArea');
            if (elHudArea) elHudArea.innerText = activePinData.luas_m2 > 0 ? `${Math.round(activePinData.luas_m2).toLocaleString('id-ID')} m²` : '-';
          }

          if (effectivePersil.tahun && parseInt(effectivePersil.tahun)) {
            const elShpTahun = document.getElementById('shpTahun');
            if (elShpTahun) elShpTahun.value = parseInt(effectivePersil.tahun);
          }

          rawInitialBboxCoords = effectivePersil.polygon_coords;
          initCanvasRebuilder(lat, lng, activePinData.luas_m2 || 60, rawInitialBboxCoords);
          if (typeof updateAdminPolygonCoordsUI === 'function') {
            updateAdminPolygonCoordsUI(effectivePersil.polygon_coords);
          }

          const badge = document.getElementById('badgeRebuildStatus');
          if (badge) {
            badge.className = 'badge-pill green';
            badge.innerText = effectivePersil.is_official_cadastre ? 'Kadaster Resmi Presisi' : (effectivePersil.is_auto_traced ? 'Batas Bidang Terdeteksi' : 'Batas Bidang Aktif');
          }
          showToast('Data batas bidang persil ATR/BPN terdeteksi dan aktif.', 'success');

          if (effectivePersil.is_bbox) {
            setTimeout(() => {
              vectorizePersilFromWmsRaster(lat, lng, effectivePersil);
            }, 350);
          }
        } else {
          startDelineasiMandiriAtClick();
        }
      } catch (err) {
        showToast('Terjadi kesalahan saat memuat data bidang. Silakan coba kembali.', 'warn');
      } finally {
        if (loadingBar) loadingBar.classList.remove('active');
        if (foundBox) foundBox.classList.remove('data-loading');
      }
    }

    function updateFullBidangInfo() {
      const el = document.getElementById('pinNibFullText');
      if (!el) return;
      const fid = activePinData?.fid || '-';
      const desa = (activePinData?.desa && activePinData.desa !== 'Memuat...') ? activePinData.desa : 'DESA';
      const kec = (activePinData?.kecamatan && activePinData.kecamatan !== 'Memuat...') ? activePinData.kecamatan : 'KEC';
      const kab = (activePinData?.kabkot && activePinData.kabkot !== 'Memuat...') ? activePinData.kabkot : 'KAB';
      el.innerText = ` (${desa}, ${kec}, ${kab})`;
    }

    async function fetchLocationDetails(lat, lng) {
      const persilApiBase = getBpnGatewayBase();
      let addr = null;
      let data = null;

      if (isProxyActive && persilApiBase && (persilApiBase.startsWith('https://') || persilApiBase.startsWith('http://'))) {
        try {
          const url = `${persilApiBase}/api/reverse-geocode?lat=${lat}&lng=${lng}`;
          const res = await fetch(url);
          if (res.ok) {
            data = await res.json();
            if (data.address) {
              addr = data.address;
            }
          }
        } catch (e) {
        }
      }

      if (!addr || Object.keys(addr).length === 0) {
        try {
          const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
          const res = await fetch(nomUrl);
          if (res.ok) {
            const nomData = await res.json();
            if (nomData && nomData.address) {
              addr = nomData.address;
              if (!data) data = { alamat_lengkap: nomData.display_name };
            }
          }
        } catch (e) {}
      }

      addr = addr || {};
      const desa = data?.desa || addr.village || addr.suburb || addr.neighbourhood || addr.quarter || '-';
      let kec = data?.kecamatan || addr.subdistrict || addr.city_district || addr.municipality || addr.district || addr.town || '-';
      let prov = data?.provinsi || addr.state || '-';
      if (typeof normalizeIndonesianProvince === 'function') {
        prov = normalizeIndonesianProvince(prov) || prov;
      }

      let kabkot = '-';
      const isJakarta = (addr.city && addr.city.toLowerCase().includes('jakarta')) ||
                        (addr.state && addr.state.toLowerCase().includes('jakarta')) ||
                        (addr.country_code === 'id' && lat >= -6.40 && lat <= -5.20 && lng >= 106.65 && lng <= 107.05);
      if (isJakarta) {
        prov = 'DKI Jakarta';
        const combined = ((addr.city_district || '') + ' ' + (addr.county || '') + ' ' + (addr.subdistrict || '') + ' ' + (addr.suburb || '') + ' ' + (addr.city || '')).toLowerCase();
        if (combined.includes('seribu') || combined.includes('thousand') || (lat > -5.95 && lat < -5.0)) {
          kabkot = 'Kabupaten Administrasi Kepulauan Seribu';
        } else if (combined.includes('timur') || combined.includes('east') || (lng > 106.87 && lat < -6.18 && lat > -6.38)) {
          kabkot = 'Kota Administrasi Jakarta Timur';
        } else if (combined.includes('selatan') || combined.includes('south') || (lat < -6.23 && lng <= 106.87 && lng >= 106.75)) {
          kabkot = 'Kota Administrasi Jakarta Selatan';
        } else if (combined.includes('barat') || combined.includes('west') || (lng < 106.79 && lat >= -6.24)) {
          kabkot = 'Kota Administrasi Jakarta Barat';
        } else if (combined.includes('utara') || combined.includes('north') || (lat > -6.18 && lat < -6.08 && lng >= 106.72 && lng <= 106.98)) {
          kabkot = 'Kota Administrasi Jakarta Utara';
        } else {
          kabkot = 'Kota Administrasi Jakarta Pusat';
        }
      } else {
        let rawKab = data?.kabupaten || addr.city || addr.town || addr.county || addr.state_district || addr.municipality || addr.city_district || '';
        if (rawKab && rawKab !== '-') {
          rawKab = rawKab.replace(/^(City of|Regency of|Kota Administrasi|Kota|Kabupaten|Kab\.|Kotamadya)\s{0,}/i, '').trim();
          if (/^(Surakarta|Bandung|Surabaya|Semarang|Medan|Makassar|Yogyakarta|Depok|Bekasi|Bogor|Tangerang|Tangerang Selatan|Malang|Batam|Palembang|Pekanbaru|Bandar Lampung|Padang|Denpasar|Samarinda|Banjarmasin|Balikpapan|Pontianak|Manado|Cimahi|Salatiga|Magelang|Pekalongan|Tegal|Cirebon|Sukabumi|Tasikmalaya|Probolinggo|Pasuruan|Mojokerto|Madiun|Kediri|Blitar|Batu)/i.test(rawKab)) {
            kabkot = 'Kota ' + rawKab;
          } else {
            kabkot = 'Kabupaten ' + rawKab;
          }
        }
      }
      if ((!prov || prov === '-') && (desa.toLowerCase().includes('jakarta') || kec.toLowerCase().includes('menteng') || kec.toLowerCase().includes('gambir'))) {
        prov = 'DKI Jakarta';
      }
      const kodepos = addr.postcode || '-';
      const jalan = data?.alamat_lengkap || addr.road || addr.amenity || data?.display_name || '-';
      const cleanKab = kabkot !== '-' ? kabkot.replace(/^Kabupaten\s{0,}/i, '').replace(/^Kota\s{0,}/i, '').trim() : '';
      const kantah = data?.kantah || (cleanKab ? `Kantor Pertanahan ${cleanKab}` : '-');

      return { desa, kecamatan: kec, kabkot, provinsi: prov, kodepos, kantah, jalan };
    }

    function quickFlyTo(lat, lon, zoom = 17, name = '') {
      flyToLoc(lat, lon, zoom, name);
    }

    function locateUserGPS() {
      if (!navigator.geolocation) {
        showToast('Perangkat tidak mendukung fitur Geolocation GPS.', 'warn');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          flyToLoc(latitude, longitude, 18, 'Lokasi GPS Anda');
        },
        (err) => {
          showToast('Gagal mengambil lokasi GPS: ' + err.message, 'error');
        },
        { enableHighAccuracy: true }
      );
    }

    function copyBidangIdentitas() {
      const fid = activePinData?.fid;
      if (!fid || fid === '-') {
        showToast('Data identifikasi belum tersedia pada bidang ini.', 'warn');
        return;
      }
      navigator.clipboard.writeText(fid).then(() => {
        showToast('Data bidang berhasil disalin!', 'success');
      });
    }

    function copyBidangData() {
      if (!activePinData) {
        showToast('Pilih bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }
      const isPro = (typeof isMemberProActive === 'function') ? isMemberProActive() : false;
      let summary = `DATA RESMI BIDANG TANAH KADASTRAL\n\n`;
      summary += `Tipe Hak: ${activePinData.tipe_hak || 'Hak Milik'}\n`;
      summary += `Luas Terdaftar: ${Math.round(activePinData.luas_m2 || 0).toLocaleString('id-ID')} m²\n`;
      summary += `Kabupaten: ${activePinData.kabkot || '-'}\n`;
      summary += `Provinsi: ${activePinData.provinsi || '-'}\n`;
      summary += `Koordinat: ${activePinData.lat.toFixed(6)}, ${activePinData.lng.toFixed(6)}\n`;
      summary += `Status Validasi: ${activePinData.status_validasi || 'Terdaftar di Basis Data'}\n`;

      if (isPro) {
        summary += `\nDATA DETAIL KADASTER & TATA RUANG (PRO):\n`;
        summary += `NIB Lengkap: ${activePinData.nib_lengkap || activePinData.nib || '-'}\n`;
        summary += `Kantah: ${activePinData.kantah || '-'}\n`;
        summary += `Kluster PTSL: ${activePinData.kluster_ptsl || '-'}\n`;
        summary += `Akurasi & Alat: ${activePinData.akurasibidang || '-'}\n`;
        summary += `RTRW Kab/Kota: ${activePinData.rtrw || '-'}\n`;
        summary += `RDTR (Detail): ${activePinData.rdtr || '-'}\n`;
        summary += `Status LSD: ${activePinData.lsd || '-'}\n`;
        summary += `Status LBS: ${activePinData.lbs || '-'}\n`;
        summary += `Kawasan Hutan (KLHK): ${activePinData.hutan || '-'}\n`;
        summary += `Zona Nilai Tanah: ${activePinData.znt || '-'}\n`;
        summary += `Rentang Nilai ZNT: ${activePinData.znt_range || '-'}\n`;
      }

      navigator.clipboard.writeText(summary).then(() => {
        showToast(isPro ? 'Data lengkap kadaster dan tata ruang berhasil disalin!' : 'Data dasar bidang berhasil disalin ke clipboard!', 'success');
      });
    }

    function removeActivePin() {
      window.isBoundaryEditingActive = false;
      if (isDrawingPolygon) {
        cancelCustomPolygonDraw();
      }
      if (isMergeMode) {
        cancelMergeMode();
      }
      if (activePinMarker) {
        map.removeLayer(activePinMarker);
        activePinMarker = null;
      }
      clearCanvasRebuilderLayers();
      isParcelLocked = false;
      activePinData = null;
      window.lastImportedShpData = null;
      const shpBadge = document.getElementById('importedShpAttributesBadge');
      if (shpBadge) shpBadge.style.display = 'none';
      const boxGabungan = document.getElementById('boxDaftarBidangGabungan');
      if (boxGabungan) boxGabungan.style.display = 'none';
      window.currentCadastreParcelsPool = [];

      const noPin = document.getElementById('noPinAlert');
      const foundBox = document.getElementById('persilFoundBox');
      const notFoundBox = document.getElementById('persilNotFoundBox');
      const loadingBox = document.getElementById('persilLoadingBox');

      if (noPin) noPin.style.display = 'block';
      if (foundBox) foundBox.style.display = 'none';
      if (notFoundBox) notFoundBox.style.display = 'none';
      if (loadingBox) loadingBox.style.display = 'none';

      const elNib = document.getElementById('pinNibText'); if (elNib) elNib.innerText = '-';
      const elTipeHak = document.getElementById('pinTipeHakText'); if (elTipeHak) elTipeHak.innerText = '-';
      const elNomorHak = document.getElementById('pinNomorHakText'); if (elNomorHak) elNomorHak.innerText = '-';
      const elKab = document.getElementById('pinKabkotText'); if (elKab) elKab.innerText = '-';
      const elProv = document.getElementById('pinProvinsiText'); if (elProv) elProv.innerText = '-';
      const elKantah = document.getElementById('pinKantahText'); if (elKantah) elKantah.innerText = '-';
      const elCoords = document.getElementById('pinCoordsText'); if (elCoords) elCoords.innerText = '-';
      const elStatusValidasi = document.getElementById('pinStatusValidasiText'); if (elStatusValidasi) elStatusValidasi.innerText = '-';
      const elKluster = document.getElementById('pinKlusterPtslText'); if (elKluster) elKluster.innerText = '-';
      const elAkurasi = document.getElementById('pinAkurasiAlatText'); if (elAkurasi) elAkurasi.innerText = '-';
      const elRtrw = document.getElementById('pinRtrwText'); if (elRtrw) elRtrw.innerText = '-';
      const elRdtr = document.getElementById('pinRdtrText'); if (elRdtr) elRdtr.innerText = '-';
      const elLsd = document.getElementById('pinLsdText'); if (elLsd) elLsd.innerText = '-';
      const elLbs = document.getElementById('pinLbsText'); if (elLbs) elLbs.innerText = '-';
      const elHutan = document.getElementById('pinHutanText'); if (elHutan) elHutan.innerText = '-';
      const elZnt = document.getElementById('pinZntText'); if (elZnt) elZnt.innerText = '-';
      const elZntRange = document.getElementById('pinZntRangeText'); if (elZntRange) elZntRange.innerText = '-';

      const hud = document.getElementById('canvasHud');
      if (hud) hud.style.display = 'none';
      showToast('Pilihan bidang dibatalkan. Peta siap untuk memilih atau mendigitasi bidang baru.', 'info');
    }

    function shrinkActivePolygon(pct = 0.04) {
      if (!activeVertices || activeVertices.length < 3) return;
      const cx = activeVertices.reduce((s, v) => s + v.lng, 0) / activeVertices.length;
      const cy = activeVertices.reduce((s, v) => s + v.lat, 0) / activeVertices.length;
      const factor = 1.0 - pct;
      activeVertices = activeVertices.map(v => ({
        lat: cy + (v.lat - cy) * factor,
        lng: cx + (v.lng - cx) * factor
      }));
      renderCanvasPolygon(true);
    }

    function expandActivePolygon(pct = 0.04) {
      shrinkActivePolygon(-pct);
    }

    function snapToPersilBorder() {
      if (rawInitialBboxCoords && rawInitialBboxCoords.length >= 4) {
        activeVertices = rawInitialBboxCoords.map(c => ({ lat: c.lat, lng: c.lng }));
        renderCanvasPolygon(true);
      }
    }

    function clearCanvasRebuilderLayers() {
      isParcelLocked = false;
      isGeometryManuallyEdited = false;
      activeMultiParts = null;
      if (activePolygonLayer) {
        map.removeLayer(activePolygonLayer);
        activePolygonLayer = null;
      }
      activeVertices = [];
      vertexMarkers.forEach(m => map.removeLayer(m));
      vertexMarkers = [];
      vertexAddMarkers.forEach(m => map.removeLayer(m));
      vertexAddMarkers = [];
      edgeDistMarkers.forEach(m => map.removeLayer(m));
      edgeDistMarkers = [];
      const tb = document.getElementById('mapPrecisionToolbar');
      if (tb) tb.style.display = 'none';
      if (typeof renderCoordinatesTable === 'function') renderCoordinatesTable();
    }

    function cleanAndDeduplicateVertices(coords, minMeters = 0.40, maxDeg = 4.5) {
      if (!coords || coords.length < 3) return coords;
      let pts = coords.map(p => Array.isArray(p) ? { lat: p[1], lng: p[0] } : { lat: p.lat, lng: p.lng });
      if (pts.length > 1 && Math.abs(pts[0].lat - pts[pts.length - 1].lat) < 0.000001 && Math.abs(pts[0].lng - pts[pts.length - 1].lng) < 0.000001) {
        pts.pop();
      }

      let changed = true;
      while (changed && pts.length > 3) {
        changed = false;
        const n = pts.length;
        for (let i = 0; i < n; i++) {
          const p1 = pts[i];
          const p2 = pts[(i + 1) % n];
          const dlat = (p1.lat - p2.lat) * 111320;
          const midLat = (p1.lat + p2.lat) * 0.5;
          const dlng = (p1.lng - p2.lng) * (111320 * Math.cos(midLat * Math.PI / 180));
          const dist = Math.sqrt(dlat * dlat + dlng * dlng);
          if (dist < minMeters) {
            pts[i] = {
              lat: Number(((p1.lat + p2.lat) * 0.5).toFixed(7)),
              lng: Number(((p1.lng + p2.lng) * 0.5).toFixed(7))
            };
            pts.splice((i + 1) % n, 1);
            changed = true;
            break;
          }
        }
      }

      changed = true;
      while (changed && pts.length > 3) {
        changed = false;
        const n = pts.length;
        for (let i = 0; i < n; i++) {
          const pPrev = pts[(i - 1 + n) % n];
          const pCurr = pts[i];
          const pNext = pts[(i + 1) % n];
          const cosLat = Math.cos(pCurr.lat * Math.PI / 180);
          const v1x = (pCurr.lng - pPrev.lng) * cosLat;
          const v1y = pCurr.lat - pPrev.lat;
          const v2x = (pNext.lng - pCurr.lng) * cosLat;
          const v2y = pNext.lat - pCurr.lat;
          const dot = v1x * v2x + v1y * v2y;
          const cross = v1x * v2y - v1y * v2x;
          const angleDeg = Math.abs(Math.atan2(cross, dot) * 180 / Math.PI);
          if (angleDeg < maxDeg || Math.abs(180 - angleDeg) < maxDeg) {
            pts.splice(i, 1);
            changed = true;
            break;
          }
        }
      }
      return pts;
    }

    function cleanActiveVerticesManual() {
      if (!activeVertices || activeVertices.length < 3) return;
      const countBefore = activeVertices.length;
      activeVertices = cleanAndDeduplicateVertices(activeVertices, 0.40, 4.5);
      const countAfter = activeVertices.length;
      renderCanvasPolygon(true);
      if (typeof renderCoordinatesTable === 'function') renderCoordinatesTable();
      if (countBefore !== countAfter) {
        showToast(`Berhasil merapikan patok. ${countBefore - countAfter} titik sudut ganda dibersihkan.`, 'success');
      } else {
        showToast(`Seluruh ${countAfter} titik patok sudah presisi tanpa titik ganda.`, 'info');
      }
    }

    function toWebMercator(lat, lng) {
      const originShift = 20037508.342789244;
      const x = lng * originShift / 180.0;
      let y = Math.log(Math.tan((90.0 + lat) * Math.PI / 360.0)) / (Math.PI / 180.0);
      y = y * originShift / 180.0;
      return { x: x, y: y };
    }

    async function checkProxyHealth() {
      const badge = document.getElementById('proxyBadge');
      const text = document.getElementById('proxyText');
      const persilBase = getBpnGatewayBase();
      if (persilBase && (persilBase.startsWith('https://') || persilBase.startsWith('http://'))) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          const res = await fetch(`${persilBase}/api/status`, { method: 'GET', mode: 'cors', signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            isProxyActive = true;
            if (badge) {
              badge.className = 'status-pill';
              badge.style.backgroundColor = '#16a34a';
              badge.style.color = '#ffffff';
            }
            if (text) {
              const streamName = data.active_link?.name || 'Cloud Stream D1';
              text.innerText = `Air-Gap: Aktif (${streamName})`;
            }
            return;
          }
        } catch (err) {}
      }

      isProxyActive = false;
      if (badge) {
        badge.className = 'status-pill';
        badge.style.backgroundColor = '#64748b';
        badge.style.color = '#ffffff';
      }
      if (text) {
        text.innerText = 'Peta Langsung (Standar)';
      }
    }

    var currentCadastreStreamMode = 'vector_geojson';
    var arcgisExportOverlay = null;
    var arcgisMoveEndHandler = null;

    function applyCadastreVectorStyle(mode) {
      if (!cadastreVectorLayer) return;
      let strokeColor = '#e65100';
      let fillColor = '#ff9800';
      let dashStyle = null;
      if (mode === 'vector_mvt') {
        strokeColor = '#0284c7';
        fillColor = '#38bdf8';
      } else if (mode === 'vector_wfs') {
        strokeColor = '#16a34a';
        fillColor = '#4ade80';
        dashStyle = '4,4';
      } else if (mode === 'raster_wms') {
        strokeColor = '#ea580c';
        fillColor = '#f97316';
      } else if (mode === 'raster_arcgis') {
        strokeColor = '#4f46e5';
        fillColor = '#818cf8';
      }
      cadastreVectorLayer.eachLayer(layer => {
        if (layer && typeof layer.setStyle === 'function') {
          layer.setStyle({
            color: strokeColor,
            fillColor: fillColor,
            dashArray: dashStyle
          });
        }
      });
    }

    async function activateRasterWmsStream() {
      if (!map) return;
      if (arcgisExportOverlay && map.hasLayer(arcgisExportOverlay)) {
        map.removeLayer(arcgisExportOverlay);
      }
      if (arcgisMoveEndHandler) {
        map.off('moveend', arcgisMoveEndHandler);
        arcgisMoveEndHandler = null;
      }
      if (!persilLayer) {
        setupPersilLayer();
      } else {
        const chk = document.getElementById('chkPersil');
        if (!chk || chk.checked) {
          if (!map.hasLayer(persilLayer)) map.addLayer(persilLayer);
          if (persilLayer.redraw) persilLayer.redraw();
        }
      }
      setupCadastreVectorLayer();
      if (cadastreVectorLayer && !map.hasLayer(cadastreVectorLayer)) {
        cadastreVectorLayer.addTo(map);
      }
      applyCadastreVectorStyle('raster_wms');
      loadViewportCadastreSvgParcels();
      const badge = document.getElementById('badgeStreamMode');
      if (badge) { badge.innerText = 'RASTER WMS'; badge.className = 'badge-pill blue'; }
    }

    async function activateRasterArcgisStream() {
      if (!map) return;
      const sbUrl = (typeof SUPABASE_PROJECT_URL !== 'undefined' && SUPABASE_PROJECT_URL) ? SUPABASE_PROJECT_URL : 'https://vezruyffzmabhtylxigc.supabase.co';
      const sbKey = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY) ? SUPABASE_ANON_KEY : 'sb_publishable_NBReVvac6_FUBe969fLbOw_ZGZjcwKM';

      if (!map.getPane('cadastrePane')) {
        const cp = map.createPane('cadastrePane');
        cp.style.zIndex = 370;
        cp.style.pointerEvents = 'none';
      }

      if (persilLayer && map.hasLayer(persilLayer)) {
        map.removeLayer(persilLayer);
      }

      async function refreshArcgisOverlay() {
        if (!map || currentCadastreStreamMode !== 'raster_arcgis') return;
        const bounds = map.getBounds();
        const bMin = latlngToMercator(bounds.getSouth(), bounds.getWest());
        const bMax = latlngToMercator(bounds.getNorth(), bounds.getEast());
        const bbox = `${bMin.x.toFixed(4)},${bMin.y.toFixed(4)},${bMax.x.toFixed(4)},${bMax.y.toFixed(4)}`;
        const size = map.getSize();
        const width = Math.min(Math.max(size.x || 800, 256), 1920);
        const height = Math.min(Math.max(size.y || 600, 256), 1080);
        const url = `${sbUrl}/functions/v1/cadastre-gateway?action=arcgis-export&role=admin&bbox=${bbox}&width=${width}&height=${height}&format=png`;

        try {
          const resp = await fetch(url, {
            headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey }
          });
          if (resp.ok) {
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const slider = document.getElementById('persilOpacity');
            const op = slider ? (parseFloat(slider.value) / 100) : 0.90;
            if (arcgisExportOverlay && map.hasLayer(arcgisExportOverlay)) {
              arcgisExportOverlay.setUrl(blobUrl);
              arcgisExportOverlay.setBounds(bounds);
            } else {
              arcgisExportOverlay = L.imageOverlay(blobUrl, bounds, {
                pane: 'cadastrePane',
                opacity: op,
                zIndex: 370,
                interactive: false
              }).addTo(map);
            }
          } else {
            throw new Error('Fallback ke IGTPR direct WMS');
          }
        } catch (e) {
          const directWmsUrl = `https://igtpr.atrbpn.go.id/geoserver/ows?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=igt:CONTOH_BIDANG_TANAH&STYLES=&SRS=EPSG:4326&WIDTH=${width}&HEIGHT=${height}&BBOX=${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
          const slider = document.getElementById('persilOpacity');
          const op = slider ? (parseFloat(slider.value) / 100) : 0.90;
          if (arcgisExportOverlay && map.hasLayer(arcgisExportOverlay)) {
            arcgisExportOverlay.setUrl(directWmsUrl);
            arcgisExportOverlay.setBounds(bounds);
          } else {
            arcgisExportOverlay = L.imageOverlay(directWmsUrl, bounds, {
              pane: 'cadastrePane',
              opacity: op,
              zIndex: 370,
              interactive: false
            }).addTo(map);
          }
        }
      }

      await refreshArcgisOverlay();

      if (!arcgisMoveEndHandler) {
        let debounceArcgis;
        arcgisMoveEndHandler = () => {
          clearTimeout(debounceArcgis);
          debounceArcgis = setTimeout(refreshArcgisOverlay, 450);
        };
        map.on('moveend', arcgisMoveEndHandler);
      }
      setupCadastreVectorLayer();
      if (cadastreVectorLayer && !map.hasLayer(cadastreVectorLayer)) {
        cadastreVectorLayer.addTo(map);
      }
      applyCadastreVectorStyle('raster_arcgis');
      loadViewportCadastreSvgParcels();
      const badge = document.getElementById('badgeStreamMode');
      if (badge) { badge.innerText = 'RASTER ARCGIS'; badge.className = 'badge-pill blue'; }
    }

    async function activateVectorGeojsonStream() {
      if (!map) return;
      if (arcgisExportOverlay && map.hasLayer(arcgisExportOverlay)) {
        map.removeLayer(arcgisExportOverlay);
      }
      if (arcgisMoveEndHandler) {
        map.off('moveend', arcgisMoveEndHandler);
        arcgisMoveEndHandler = null;
      }
      setupCadastreVectorLayer();
      if (cadastreVectorLayer && !map.hasLayer(cadastreVectorLayer)) {
        cadastreVectorLayer.addTo(map);
      }
      applyCadastreVectorStyle('vector_geojson');
      loadViewportCadastreSvgParcels();
      const center = (activePinMarker && activePinMarker.getLatLng)
        ? activePinMarker.getLatLng()
        : map.getCenter();
      const zoom = map.getZoom() || 17;
      try {
        const persilData = await fetchPersilCadastreData(center.lat, center.lng, zoom);
        if (persilData && persilData.found && persilData.polygon_coords && persilData.polygon_coords.length >= 3) {
          initCanvasRebuilder(center.lat, center.lng, persilData.luas_m2, persilData.polygon_coords);
          showToast(`Bidang persil vektor terdeteksi: NIB ${persilData.nib || '-'} (${Math.round(persilData.luas_m2)} m²)`, 'success');
        }
      } catch (e) {}
      const badge = document.getElementById('badgeStreamMode');
      if (badge) { badge.innerText = 'VEKTOR GEOJSON'; badge.className = 'badge-pill blue'; }
    }

    async function activateVectorMvtStream() {
      if (!map) return;
      if (arcgisExportOverlay && map.hasLayer(arcgisExportOverlay)) {
        map.removeLayer(arcgisExportOverlay);
      }
      if (arcgisMoveEndHandler) {
        map.off('moveend', arcgisMoveEndHandler);
        arcgisMoveEndHandler = null;
      }
      if (cadastreVectorParcelCache) cadastreVectorParcelCache.clear();
      setupCadastreVectorLayer();
      if (cadastreVectorLayer && !map.hasLayer(cadastreVectorLayer)) {
        cadastreVectorLayer.addTo(map);
      }
      applyCadastreVectorStyle('vector_mvt');
      await loadViewportCadastreSvgParcels();
      const badge = document.getElementById('badgeStreamMode');
      if (badge) { badge.innerText = 'VEKTOR MVT'; badge.className = 'badge-pill blue'; }
      showToast('Stream Vektor MVT / PBF Aktif: Protokol Vector Tiles GPU diaktifkan.', 'info');
    }

    async function activateVectorWfsStream() {
      if (!map) return;
      if (arcgisExportOverlay && map.hasLayer(arcgisExportOverlay)) {
        map.removeLayer(arcgisExportOverlay);
      }
      if (arcgisMoveEndHandler) {
        map.off('moveend', arcgisMoveEndHandler);
        arcgisMoveEndHandler = null;
      }
      if (cadastreVectorParcelCache) cadastreVectorParcelCache.clear();
      setupCadastreVectorLayer();
      if (cadastreVectorLayer && !map.hasLayer(cadastreVectorLayer)) {
        cadastreVectorLayer.addTo(map);
      }
      applyCadastreVectorStyle('vector_wfs');
      await loadViewportCadastreSvgParcels();
      const badge = document.getElementById('badgeStreamMode');
      if (badge) { badge.innerText = 'VEKTOR WFS'; badge.className = 'badge-pill blue'; }
      showToast('Stream OGC WFS 2.0.0 Aktif: Standar Satu Data Indonesia.', 'info');
    }

    function rdpSimplifyPoints(points, epsilon) {
      if (!points || points.length <= 2) return points;
      let dmax = 0;
      let index = 0;
      const n = points.length;
      for (let i = 1; i < n - 1; i++) {
        const p = points[i];
        const p1 = points[0];
        const p2 = points[n - 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const mag = Math.hypot(dx, dy);
        const d = mag === 0 ? Math.hypot(p.x - p1.x, p.y - p1.y) : Math.abs(dy * p.x - dx * p.y + p2.x * p1.y - p2.y * p1.x) / mag;
        if (d > dmax) {
          index = i;
          dmax = d;
        }
      }
      if (dmax > epsilon) {
        const rec1 = rdpSimplifyPoints(points.slice(0, index + 1), epsilon);
        const rec2 = rdpSimplifyPoints(points.slice(index), epsilon);
        return rec1.slice(0, rec1.length - 1).concat(rec2);
      } else {
        return [points[0], points[n - 1]];
      }
    }

    async function vectorizePersilFromWmsRaster(lat, lng, persilObj) {
      const activeObj = persilObj || activePinData;
      if (!map) return false;
      const targetArea = (activeObj && activeObj.luas_m2 && Number(activeObj.luas_m2) > 0) ? Number(activeObj.luas_m2) : 100;

      const traced = await traceParcelFromWmsTile(lat, lng);
      if (traced && traced.found && Array.isArray(traced.polygon_coords) && traced.polygon_coords.length >= 3) {
        if (activeObj) {
          activeObj.polygon_coords = traced.polygon_coords;
          activeObj.is_bbox = false;
          activeObj.patok_count = traced.polygon_coords.length;
          activeObj.source = 'VEKTOR PERSIL SVG PRESISI';
          activeObj.status_validasi = 'Batas Bidang Kadaster Terdeteksi (SVG)';
          activeObj.luas_m2 = traced.luas_m2;
          activeObj.luas_ukur_m2 = traced.luas_m2;
        }
        if (typeof window.renderBidangInfoPanel === 'function') {
          window.renderBidangInfoPanel(activeObj, traced.polygon_coords);
        }
        if (typeof initCanvasRebuilder === 'function') {
          initCanvasRebuilder(lat, lng, (activeObj && activeObj.luas_m2) || traced.luas_m2, traced.polygon_coords);
        }
        if (typeof updateAdminPolygonCoordsUI === 'function') {
          updateAdminPolygonCoordsUI(traced.polygon_coords);
        }
        const badge = document.getElementById('badgeRebuildStatus');
        if (badge) {
          badge.className = 'badge-pill green';
          badge.innerText = `Batas Bidang SVG (${traced.polygon_coords.length} Patok)`;
        }
        showToast(`Poligon Geometri SVG aktif: ${traced.polygon_coords.length} patok sudut presisi terbentuk dari garis batas persil BPN.`, 'success');
        return true;
      }
      return false;
    }

    async function generatePreciseWmsVectorPolygon() {
      const center = (activePinMarker && activePinMarker.getLatLng)
        ? activePinMarker.getLatLng()
        : map.getCenter();
      showToast('Mengekstrak poligon sudut asli dari garis Raster 1 WMS BPN...', 'info');
      const ok = await vectorizePersilFromWmsRaster(center.lat, center.lng, activePinData);
      if (!ok) {
        if (typeof activateVectorGeojsonStream === 'function') {
          await activateVectorGeojsonStream();
        }
      }
    }

    function exportPersilSVG() {
      const pts = (typeof activeVertices !== 'undefined' && activeVertices && activeVertices.length >= 3)
        ? activeVertices
        : (activePinData && activePinData.polygon_coords && activePinData.polygon_coords.length >= 3 ? activePinData.polygon_coords : null);
      if (!pts || pts.length < 3) {
        showToast('Pilih bidang tanah terlebih dahulu untuk menghasilkan poligon SVG.', 'warn');
        return;
      }
      const lons = pts.map(p => p.lng);
      const lats = pts.map(p => p.lat);
      const minX = Math.min(...lons), maxX = Math.max(...lons);
      const minY = Math.min(...lats), maxY = Math.max(...lats);
      const spanX = Math.max(maxX - minX, 0.00001);
      const spanY = Math.max(maxY - minY, 0.00001);

      const w = 800, h = 600, pad = 80;
      const scaleX = (w - 2 * pad) / spanX;
      const scaleY = (h - 2 * pad) / spanY;
      const scale = Math.min(scaleX, scaleY);

      const svgPts = pts.map(p => {
        const x = pad + (p.lng - minX) * scale;
        const y = h - (pad + (p.lat - minY) * scale);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');

      let patokSvgs = '';
      pts.forEach((p, i) => {
        const x = pad + (p.lng - minX) * scale;
        const y = h - (pad + (p.lat - minY) * scale);
        patokSvgs += `
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#ea580c" stroke="#ffffff" stroke-width="2"/>
          <text x="${(x + 9).toFixed(1)}" y="${(y + 4).toFixed(1)}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0f172a">P${i + 1}</text>
        `;
      });

      const nib = (activePinData && activePinData.nib) ? activePinData.nib : '-';
      const luas = (activePinData && activePinData.luas_m2) ? Math.round(activePinData.luas_m2) : 0;
      const tipeHak = (activePinData && activePinData.tipe_hak) ? activePinData.tipe_hak : 'BIDANG TANAH';

      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <polygon points="${svgPts}" fill="#ea580c" fill-opacity="0.25" stroke="#ea580c" stroke-width="3.5" stroke-linejoin="round"/>
  ${patokSvgs}
  <text x="30" y="40" font-family="sans-serif" font-size="16" font-weight="bold" fill="#0f172a">PETA GEOMETRI PERSIL KADASTER</text>
  <text x="30" y="62" font-family="sans-serif" font-size="12" fill="#64748b">NIB: ${nib} | Hak: ${tipeHak} | Luas: ${luas} m² | Patok: ${pts.length}</text>
  <text x="30" y="${h - 25}" font-family="sans-serif" font-size="10" fill="#94a3b8">Dihasilkan oleh Duta GeoSpasi - dutamik.id (Duta Digital Agensi, Sukoharjo)</text>
</svg>`;

      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Persil_Geometri_SVG_${nib !== '-' ? nib : 'Vektor'}_${Date.now()}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('File Poligon Vektor SVG berhasil diunduh.', 'success');
    }

    function updateCadastreStreamControlsUI(streamMode) {
      const container = document.getElementById('streamQuickButtons');
      if (!container) return;
      if (streamMode === 'raster_arcgis') {
        container.innerHTML = `
          <button type="button" class="btn btn-primary" onclick="generatePreciseWmsVectorPolygon()" style="padding: 3px 6px; font-size: 0.67rem; flex: 1.2; justify-content: center; background: #4f46e5; color: #fff;" title="Generate Poligon Vektor dari ArcGIS Web Map">Generate Vektor</button>
          <button type="button" class="btn btn-outline" onclick="exportPersilSVG()" style="padding: 3px 6px; font-size: 0.67rem; flex: 1; justify-content: center;" title="Unduh Poligon Vektor SVG">Vektor SVG</button>
          <button type="button" class="btn btn-outline" onclick="if(typeof exportGeoJSON==='function') exportGeoJSON()" style="padding: 3px 6px; font-size: 0.67rem; flex: 0.9; justify-content: center;" title="Unduh GeoJSON">GeoJSON</button>
        `;
      } else if (streamMode === 'raster_wms') {
        container.innerHTML = `
          <button type="button" class="btn btn-primary" onclick="generatePreciseWmsVectorPolygon()" style="padding: 3px 6px; font-size: 0.67rem; flex: 1.2; justify-content: center; background: #ea580c; color: #fff;" title="Generate Poligon Vektor dari Garis WMS (is_bbox: false)">Generate Vektor</button>
          <button type="button" class="btn btn-outline" onclick="exportPersilSVG()" style="padding: 3px 6px; font-size: 0.67rem; flex: 1; justify-content: center;" title="Unduh Poligon Vektor SVG">Vektor SVG</button>
          <button type="button" class="btn btn-outline" onclick="if(typeof exportGeoJSON==='function') exportGeoJSON()" style="padding: 3px 6px; font-size: 0.67rem; flex: 0.9; justify-content: center;" title="Unduh GeoJSON">GeoJSON</button>
        `;
      } else {
        container.innerHTML = `
          <button type="button" class="btn btn-primary" onclick="generatePreciseWmsVectorPolygon()" style="padding: 3px 6px; font-size: 0.67rem; flex: 1.2; justify-content: center; background: #0284c7; color: #fff;" title="Ekstrak poligon sudut asli dari garis Raster 1 WMS (is_bbox: false)">Ekstrak Vektor WMS</button>
          <button type="button" class="btn btn-outline" onclick="exportPersilSVG()" style="padding: 3px 6px; font-size: 0.67rem; flex: 1; justify-content: center;" title="Unduh Poligon Vektor SVG">Vektor SVG</button>
          <button type="button" class="btn btn-outline" onclick="if(typeof exportGeoJSON==='function') exportGeoJSON()" style="padding: 3px 6px; font-size: 0.67rem; flex: 0.9; justify-content: center;" title="Unduh GeoJSON">GeoJSON</button>
          <button type="button" class="btn btn-outline" onclick="if(typeof exportDXF==='function') exportDXF()" style="padding: 3px 6px; font-size: 0.67rem; flex: 0.8; justify-content: center;" title="Unduh CAD DXF">DXF</button>
        `;
      }
    }

    function reloadCurrentCadastreStream() {
      switchCadastreDataStream(currentCadastreStreamMode);
    }

    function generateCurrentStreamImage() {
      const isPro = (typeof isMemberProActive === 'function') && isMemberProActive();
      if (currentCadastreStreamMode === 'raster_arcgis') {
        exportArcgisWebMap('png', isPro ? 'hd' : 'sd');
      } else if (currentCadastreStreamMode === 'raster_wms') {
        exportWmsTileMap(isPro ? 'webp' : 'png');
      } else {
        if (typeof exportPersilSVG === 'function') {
          exportPersilSVG();
        } else if (typeof cetakPetaA3A4 === 'function') {
          cetakPetaA3A4();
        }
      }
    }

    async function switchCadastreDataStream(streamMode) {
      const isAdmin = ((typeof isMemberAdminActive === 'function') && isMemberAdminActive()) ||
                      (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'));
      if (!isAdmin) {
        showToast('Pemilihan format data stream kadaster lengkap (Vektor 1-3 & Raster 1-2) khusus untuk Administrator.', 'warn');
        const sel = document.getElementById('selectCadastreStream');
        if (sel) sel.value = 'vector_geojson';
        return false;
      }

      currentCadastreStreamMode = streamMode;
      localStorage.setItem('cadastre_stream_mode', streamMode);
      if (typeof cadastreVectorParcelCache !== 'undefined' && cadastreVectorParcelCache) {
        cadastreVectorParcelCache.clear();
      }

      const labels = {
        'vector_geojson': 'Vektor 1: GeoJSON / Esri JSON (Titik Koordinat Asli Batas Bidang)',
        'vector_mvt': 'Vektor 2: MVT / PBF (Vector Tiles GPU Accelerated)',
        'vector_wfs': 'Vektor 3: WFS / GML (Standar OGC Satu Data Indonesia)',
        'raster_wms': 'Raster 1: WMS / WMTS Image Tiles (PNG / WebP)',
        'raster_arcgis': 'Raster 2: ArcGIS Export Web Map (PNG / JPEG / PDF)'
      };

      const sel = document.getElementById('selectCadastreStream');
      if (sel) sel.value = streamMode;

      updateCadastreStreamControlsUI(streamMode);

      showToast(`Stream Kadaster: ${labels[streamMode] || streamMode}`, 'success');

      if (streamMode === 'raster_wms') {
        await activateRasterWmsStream();
      } else if (streamMode === 'raster_arcgis') {
        await activateRasterArcgisStream();
      } else if (streamMode === 'vector_geojson') {
        await activateVectorGeojsonStream();
      } else if (streamMode === 'vector_mvt') {
        await activateVectorMvtStream();
      } else if (streamMode === 'vector_wfs') {
        await activateVectorWfsStream();
      }
      return true;
    }

    function exportWmsTileMap(format = 'png') {
      const isPro = (typeof isMemberProActive === 'function') && isMemberProActive();
      const z = map ? Math.min(map.getZoom(), isPro ? 21 : 16) : 17;

      if (!isPro && (format === 'webp' || (map && map.getZoom() > 16))) {
        showToast('Unduh WMS/WMTS resolusi tinggi (WebP / Zoom > 16) khusus Member PRO/Administrator. Akun gratis mengunduh resolusi standar.', 'warn');
      }

      const center = map ? map.getCenter() : { lat: DEFAULT_LAT, lng: DEFAULT_LON };
      const tilePt = latlngToMercator(center.lat, center.lng);
      const bRad = 0.0015;
      const bMin = latlngToMercator(center.lat - bRad, center.lng - bRad);
      const bMax = latlngToMercator(center.lat + bRad, center.lng + bRad);
      const bbox = `${bMin.x.toFixed(4)},${bMin.y.toFixed(4)},${bMax.x.toFixed(4)},${bMax.y.toFixed(4)}`;

      const sbUrl = (typeof SUPABASE_PROJECT_URL !== 'undefined' && SUPABASE_PROJECT_URL) ? SUPABASE_PROJECT_URL : 'https://vezruyffzmabhtylxigc.supabase.co';
      const sbKey = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY) ? SUPABASE_ANON_KEY : 'sb_publishable_NBReVvac6_FUBe969fLbOw_ZGZjcwKM';
      const tx = Math.floor((center.lng + 180) / 360 * Math.pow(2, z));
      const ty = Math.floor((1 - Math.log(Math.tan(center.lat * Math.PI / 180) + 1 / Math.cos(center.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
      const isAdmin = (typeof isMemberAdminActive === 'function') && isMemberAdminActive();
      const role = isAdmin ? 'admin' : (isPro ? 'pro' : 'free');
      const targetUrl = `${sbUrl}/functions/v1/cadastre-gateway?action=wms-tile&role=${role}&z=${z}&x=${tx}&y=${ty}&format=${format}`;

      showToast(`Menghasilkan gambar peta WMS/WMTS (${format.toUpperCase()})...`, 'info');

      fetch(targetUrl, {
        headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey }
      })
      .then(res => {
        if (!res.ok) throw new Error('Respon server ' + res.status);
        return res.blob();
      })
      .then(blob => {
        downloadFile(blob, `DutaGeoSpasi_WMS_Tile_${isPro ? 'PRO_HighRes' : 'Free_SD'}.${format}`, format === 'webp' ? 'image/webp' : 'image/png');
        showToast(`Gambar peta WMS/WMTS (${format.toUpperCase()}) berhasil diunduh.`, 'success');
      })
      .catch(err => {
        const fallbackUrl = `https://bhumi.atrbpn.go.id/mprx/service?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=bhumi_persil&STYLES=&CRS=EPSG:3857&WIDTH=512&HEIGHT=512&BBOX=${bbox}`;
        window.open(fallbackUrl, '_blank');
        showToast('Membuka tautan gambar WMS resmi Bhumi ATR/BPN.', 'info');
      });
    }

    function exportArcgisWebMap(format = 'png', resolution = 'sd') {
      const isPro = (typeof isMemberProActive === 'function') && isMemberProActive();

      if (!isPro && (resolution === 'hd' || resolution === '4k' || format === 'pdf')) {
        showToast('Ekspor ArcGIS Web Map HD/4K dan format PDF khusus Member PRO/Administrator. Akun gratis dialihkan ke format SD (800x600 PNG).', 'warn');
        format = 'png';
        resolution = 'sd';
      }

      let width = 800;
      let height = 600;
      if (resolution === 'hd') { width = 1920; height = 1080; }
      else if (resolution === '4k') { width = 3840; height = 2160; }

      let bMin = { x: 0, y: 0 };
      let bMax = { x: 0, y: 0 };

      if (activeVertices && activeVertices.length >= 3) {
        let minLa = Infinity, maxLa = -Infinity, minLo = Infinity, maxLo = -Infinity;
        activeVertices.forEach(v => {
          if (v.lat < minLa) minLa = v.lat;
          if (v.lat > maxLa) maxLa = v.lat;
          if (v.lng < minLo) minLo = v.lng;
          if (v.lng > maxLo) maxLo = v.lng;
        });
        const padLat = (maxLa - minLa) * 0.25 || 0.0005;
        const padLng = (maxLo - minLo) * 0.25 || 0.0005;
        bMin = latlngToMercator(minLa - padLat, minLo - padLng);
        bMax = latlngToMercator(maxLa + padLat, maxLo + padLng);
      } else if (map) {
        const bounds = map.getBounds();
        bMin = latlngToMercator(bounds.getSouth(), bounds.getWest());
        bMax = latlngToMercator(bounds.getNorth(), bounds.getEast());
      } else {
        bMin = latlngToMercator(DEFAULT_LAT - 0.002, DEFAULT_LON - 0.002);
        bMax = latlngToMercator(DEFAULT_LAT + 0.002, DEFAULT_LON + 0.002);
      }

      const bbox = `${bMin.x.toFixed(4)},${bMin.y.toFixed(4)},${bMax.x.toFixed(4)},${bMax.y.toFixed(4)}`;
      const sbUrl = (typeof SUPABASE_PROJECT_URL !== 'undefined' && SUPABASE_PROJECT_URL) ? SUPABASE_PROJECT_URL : 'https://vezruyffzmabhtylxigc.supabase.co';
      const isAdmin = (typeof isMemberAdminActive === 'function') && isMemberAdminActive();
      const role = isAdmin ? 'admin' : (isPro ? 'pro' : 'free');

      const targetUrl = `${sbUrl}/functions/v1/cadastre-gateway?action=arcgis-export&role=${role}&width=${width}&height=${height}&format=${format}&bbox=${bbox}`;

      showToast(`Menyusun peta ArcGIS Web Map (${width}x${height} ${format.toUpperCase()})...`, 'info');

      fetch(targetUrl, {
        headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey }
      })
      .then(res => {
        if (!res.ok) throw new Error('Respon server ' + res.status);
        return res.blob();
      })
      .then(blob => {
        const fn = `DutaGeoSpasi_ArcGIS_WebMap_${width}x${height}_${isPro ? 'PRO' : 'Free'}.${format}`;
        const mime = format === 'pdf' ? 'application/pdf' : (format === 'jpg' || format === 'jpeg' ? 'image/jpeg' : 'image/png');
        downloadFile(blob, fn, mime);

        if (format === 'png' || format === 'jpg') {
          const pixelSizeX = (bMax.x - bMin.x) / width;
          const pixelSizeY = (bMin.y - bMax.y) / height;
          const worldContent = `${pixelSizeX.toFixed(8)}\n0.00000000\n0.00000000\n${pixelSizeY.toFixed(8)}\n${bMin.x.toFixed(4)}\n${bMax.y.toFixed(4)}\n`;
          const wfExt = format === 'png' ? 'pgw' : 'jgw';
          downloadFile(worldContent, `DutaGeoSpasi_ArcGIS_WebMap_${width}x${height}_${isPro ? 'PRO' : 'Free'}.${wfExt}`, 'text/plain;charset=utf-8');
        }

        showToast(`Peta ArcGIS Web Map (${format.toUpperCase()}) dan Georeferensi World File berhasil diunduh.`, 'success');
      })
      .catch(err => {
        const directUrl = `https://bhumi.atrbpn.go.id/mprx/service?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=bhumi_persil&STYLES=&CRS=EPSG:3857&WIDTH=${width}&HEIGHT=${height}&BBOX=${bbox}`;
        window.open(directUrl, '_blank');
        showToast('Membuka tautan peta ArcGIS resmi.', 'info');
      });
    }

    function showZeroDataPrivacyModal() {
      const modal = document.getElementById('modalZeroDataPrivacy');
      if (modal) modal.style.display = 'flex';
    }

    function closeZeroDataPrivacyModal() {
      const modal = document.getElementById('modalZeroDataPrivacy');
      if (modal) modal.style.display = 'none';
    }

    function updateAdminPolygonCoordsUI(customCoords = null) {
      const box = document.getElementById('adminPolygonCoordsBox');
      if (!box) return;
      const isAdmin = (typeof isMemberAdminActive === 'function') && isMemberAdminActive();
      if (!isAdmin) {
        box.style.display = 'none';
        return;
      }
      let coords = customCoords;
      if (!coords || !Array.isArray(coords) || coords.length === 0) {
        if (activePinData && Array.isArray(activePinData.polygon_coords) && activePinData.polygon_coords.length >= 3) {
          coords = activePinData.polygon_coords;
        } else if (typeof activeVertices !== 'undefined' && Array.isArray(activeVertices) && activeVertices.length >= 3) {
          coords = activeVertices;
        } else if (typeof rawInitialBboxCoords !== 'undefined' && Array.isArray(rawInitialBboxCoords) && rawInitialBboxCoords.length >= 3) {
          coords = rawInitialBboxCoords;
        }
      }
      if (!coords || !Array.isArray(coords) || coords.length < 3) {
        box.style.display = 'none';
        return;
      }
      box.style.display = 'block';
      const textarea = document.getElementById('adminPolygonCoordsText');
      const countBadge = document.getElementById('badgePolygonCoordsCount');
      const sourceBadge = document.getElementById('badgePolygonCoordsSource');
      const formatted = coords.map(p => {
        const lat = (p.lat !== undefined ? p.lat : p[1]);
        const lng = (p.lng !== undefined ? p.lng : p[0]);
        return `${Number(lat).toFixed(7)}, ${Number(lng).toFixed(7)}`;
      }).join('\n');
      if (textarea) textarea.value = formatted;
      if (countBadge) countBadge.innerText = `${coords.length} Patok`;
      if (sourceBadge) {
        if (activePinData && activePinData.source && activePinData.source.includes('WMS')) {
          sourceBadge.innerText = 'WMS PRESISI';
        } else if (activePinData && activePinData.is_bbox === false) {
          sourceBadge.innerText = 'ASLI BPN';
        } else {
          sourceBadge.innerText = 'KADASTRAL';
        }
      }
    }

    function copyAdminPolygonCoords() {
      const textarea = document.getElementById('adminPolygonCoordsText');
      const text = textarea?.value?.trim();
      if (!text) {
        showToast('Tidak ada koordinat polygon_coords untuk disalin.', 'warn');
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast('Daftar koordinat polygon_coords berhasil disalin ke clipboard!', 'success');
        }).catch(() => {
          textarea.select();
          document.execCommand('copy');
          showToast('Daftar koordinat polygon_coords berhasil disalin ke clipboard!', 'success');
        });
      } else {
        textarea.select();
        document.execCommand('copy');
        showToast('Daftar koordinat polygon_coords berhasil disalin ke clipboard!', 'success');
      }
    }

    function sendPolygonCoordsToBatchInput() {
      const textarea = document.getElementById('adminPolygonCoordsText');
      const text = textarea?.value?.trim();
      if (!text) {
        showToast('Tidak ada koordinat polygon_coords untuk dimasukkan.', 'warn');
        return;
      }
      const batchInput = document.getElementById('batchCoordsInput');
      if (batchInput) {
        batchInput.value = text;
      }
      if (typeof switchTab === 'function') {
        switchTab('tab-digitasi');
      }
      if (batchInput) {
        batchInput.focus();
        batchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      showToast('Koordinat polygon_coords dimasukkan ke Lembar Buat Bidang. Klik "Plot & Buat Bidang" untuk menggambar.', 'success');
    }

    function swapAdminPolygonCoordsOrder() {
      const textarea = document.getElementById('adminPolygonCoordsText');
      const text = textarea?.value?.trim();
      if (!text) {
        showToast('Tidak ada koordinat polygon_coords untuk ditukar.', 'warn');
        return;
      }
      const swapped = (typeof swapBatchCoordinatesText === 'function')
        ? swapBatchCoordinatesText(text)
        : text.split(/\r?\n/).map(line => {
            const parts = line.trim().split(/[,\s\t;]+/).filter(Boolean);
            return parts.length >= 2 ? `${parts[1]}, ${parts[0]}` : line;
          }).join('\n');
      textarea.value = swapped;

      if (typeof activeVertices !== 'undefined' && Array.isArray(activeVertices) && activeVertices.length >= 3) {
        const cLat = activeVertices.reduce((s, p) => s + p.lat, 0) / activeVertices.length;
        const cLng = activeVertices.reduce((s, p) => s + p.lng, 0) / activeVertices.length;
        const cosLat = Math.cos(cLat * Math.PI / 180);
        activeVertices = activeVertices.map(p => {
          const dLat = p.lat - cLat;
          const dLng = p.lng - cLng;
          return {
            lat: Number((cLat + (dLng * cosLat)).toFixed(7)),
            lng: Number((cLng + (dLat / (cosLat || 1))).toFixed(7))
          };
        });
        if (typeof activeMultiParts !== 'undefined' && activeMultiParts && activeMultiParts.length > 0) {
          activeMultiParts[0] = activeVertices;
        }
        if (typeof renderCanvasPolygon === 'function') {
          renderCanvasPolygon(true);
        }
        if (typeof activePolygonLayer !== 'undefined' && activePolygonLayer && typeof map !== 'undefined' && map) {
          map.fitBounds(activePolygonLayer.getBounds(), { padding: [40, 40] });
        }
      }

      showToast('Urutan koordinat polygon_coords ditukar: Preview posisi bidang diperbarui di peta.', 'success');
    }

    function copyCurrentCoordinates() {
      const el = document.getElementById('pinCoordsText');
      let txt = el ? el.innerText.trim() : '';
      if (!txt || txt === '-' || txt === 'Memuat...') {
        if (typeof activePinData !== 'undefined' && activePinData && activePinData.lat && activePinData.lng) {
          txt = `${activePinData.lat.toFixed(6)}, ${activePinData.lng.toFixed(6)}`;
        }
      }
      if (!txt || txt === '-' || txt === 'Memuat...') {
        if (typeof showToast === 'function') {
          showToast('Koordinat belum tersedia untuk disalin.', 'warn');
        }
        return;
      }
      const doneCopy = () => {
        if (typeof showToast === 'function') {
          showToast(`Koordinat disalin: ${txt}`, 'success');
        }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(doneCopy).catch(() => {
          fallbackCopyText(txt);
          doneCopy();
        });
      } else {
        fallbackCopyText(txt);
        doneCopy();
      }
    }

    function fallbackCopyText(txt) {
      const input = document.createElement('input');
      input.value = txt;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand('copy');
      } catch (_) {}
      document.body.removeChild(input);
    }

    window.copyCurrentCoordinates = copyCurrentCoordinates;

    window.reloadCurrentCadastreStream = reloadCurrentCadastreStream;
    window.generateCurrentStreamImage = generateCurrentStreamImage;
    window.updateCadastreStreamControlsUI = updateCadastreStreamControlsUI;
    window.currentCadastreStreamMode = currentCadastreStreamMode;
    window.switchCadastreDataStream = switchCadastreDataStream;
    window.exportWmsTileMap = exportWmsTileMap;
    window.exportArcgisWebMap = exportArcgisWebMap;
    window.showZeroDataPrivacyModal = showZeroDataPrivacyModal;
    window.closeZeroDataPrivacyModal = closeZeroDataPrivacyModal;
    window.getCadastreServerMode = getCadastreServerMode;
    window.switchCadastreServer = switchCadastreServer;
    window.updateCadastreServerUI = updateCadastreServerUI;
    window.renderCadastralProFields = renderCadastralProFields;
    window.setupCadastreVectorLayer = setupCadastreVectorLayer;
    window.loadViewportCadastreSvgParcels = loadViewportCadastreSvgParcels;
    window.renderCadastreVectorParcels = renderCadastreVectorParcels;
    window.selectCadastreVectorParcel = selectCadastreVectorParcel;
    window.cadastreVectorLayer = cadastreVectorLayer;
    window.togglePersilLayer = togglePersilLayer;
    window.fetchPersilCadastreData = fetchPersilCadastreData;
    window.fetchLocationDetails = fetchLocationDetails;
    window.findCachedVectorParcelAt = findCachedVectorParcelAt;
    window.handleMapClick = handleMapClick;
    window.vectorizePersilFromWmsRaster = vectorizePersilFromWmsRaster;
    window.generatePreciseWmsVectorPolygon = generatePreciseWmsVectorPolygon;
    window.exportPersilSVG = exportPersilSVG;
    window.updateAdminPolygonCoordsUI = updateAdminPolygonCoordsUI;
    window.copyAdminPolygonCoords = copyAdminPolygonCoords;
    window.sendPolygonCoordsToBatchInput = sendPolygonCoordsToBatchInput;
    window.swapAdminPolygonCoordsOrder = swapAdminPolygonCoordsOrder;
    window.updateDynamicMapLegend = updateDynamicMapLegend;
    window.toggleQuickThematicLayer = toggleQuickThematicLayer;
    window.updateScaleTransitionUI = updateScaleTransitionUI;
