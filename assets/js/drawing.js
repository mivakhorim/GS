
function captureGpsCoordinate() {
  if (!navigator.geolocation) {
    showToast('Perangkat tidak mendukung sensor GPS Geolocation.', 'error');
    return;
  }
  showToast('Mengakses sensor GPS presisi tinggi...', 'info', 2000);
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy ? pos.coords.accuracy.toFixed(1) : '0';
      if (!activeVertices) activeVertices = [];
      activeVertices.push({ lat: lat, lng: lng, elev: 0 });
      if (typeof map !== 'undefined' && map) {
        map.setView([lat, lng], Math.max(map.getZoom(), 18));
      }
      if (typeof redrawActivePolygon === 'function') {
        redrawActivePolygon();
      } else if (typeof renderDrawnPolygon === 'function') {
        renderDrawnPolygon();
      }
      if (typeof updateAreaDisplay === 'function') {
        updateAreaDisplay();
      }
      if (typeof renderPatokList === 'function') {
        renderPatokList();
      }
      showToast('Titik GPS berhasil diplot (Akurasi: ±' + acc + ' m).', 'success', 3500);
    },
    function(err) {
      let msg = 'Gagal mengambil posisi GPS.';
      if (err.code === 1) msg = 'Izin akses lokasi GPS ditolak oleh pengguna.';
      else if (err.code === 2) msg = 'Sinyal GPS tidak tersedia atau lemah.';
      else if (err.code === 3) msg = 'Waktu permintaan GPS habis (Timeout).';
      showToast(msg, 'warn', 4000);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function swapBatchCoordinatesText(raw) {
  if (!raw || !raw.trim()) return '';
  const lines = raw.split(/\r?\n/);
  const swappedLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      return line;
    }
    const parts = trimmed.split(/[,\s\t;]+/).filter(Boolean);
    if (parts.length === 2) {
      return `${parts[1]}, ${parts[0]}`;
    } else if (parts.length === 3) {
      if (isNaN(parseFloat(parts[0]))) {
        return `${parts[0]}, ${parts[2]}, ${parts[1]}`;
      } else {
        return `${parts[1]}, ${parts[0]}, ${parts[2]}`;
      }
    } else if (parts.length > 3) {
      if (isNaN(parseFloat(parts[0]))) {
        const extra = parts.slice(3).join(', ');
        return `${parts[0]}, ${parts[2]}, ${parts[1]}, ${extra}`;
      } else {
        const extra = parts.slice(2).join(', ');
        return `${parts[1]}, ${parts[0]}, ${extra}`;
      }
    }
    return line;
  });
  return swappedLines.join('\n');
}

function clearBatchCoordsInput() {
  const input = document.getElementById('batchCoordsInput');
  if (input) {
    input.value = '';
    input.dataset.coordMode = 'lat_lng';
    input.placeholder = "-7.575210, 110.825120\n-7.575300, 110.825500\n-7.575800, 110.825400\n-7.575700, 110.825000";
  }
  const badge = document.getElementById('badgeBatchCoordsMode');
  if (badge) badge.innerText = 'LAT, LNG';
}

function swapBatchCoordsOrder() {
  const input = document.getElementById('batchCoordsInput');
  if (!input) return;

  const defaultPlaceholderA = "-7.575210, 110.825120\n-7.575300, 110.825500\n-7.575800, 110.825400\n-7.575700, 110.825000";
  const defaultPlaceholderB = "110.825120, -7.575210\n110.825500, -7.575300\n110.825400, -7.575800\n110.825000, -7.575700";

  const currentMode = input.dataset.coordMode || 'lat_lng';
  const newMode = (currentMode === 'lat_lng') ? 'lng_lat' : 'lat_lng';
  input.dataset.coordMode = newMode;

  const targetPlaceholder = (newMode === 'lng_lat') ? defaultPlaceholderB : defaultPlaceholderA;
  input.placeholder = targetPlaceholder;

  const badge = document.getElementById('badgeBatchCoordsMode');
  if (badge) {
    badge.innerText = (newMode === 'lng_lat') ? 'LNG, LAT' : 'LAT, LNG';
  }

  const rawValue = input.value ? input.value.trim() : '';
  const modeLabel = (newMode === 'lng_lat') ? 'Longitude, Latitude' : 'Latitude, Longitude';

  if (rawValue) {
    const swapped = swapBatchCoordinatesText(rawValue);
    input.value = swapped;
    createPolygonFromBatchCoords(true, false);
    showToast(`Urutan koordinat ditukar (${modeLabel}): Koordinat di dalam box dan preview peta diperbarui.`, 'success');
  } else {
    showToast(`Format bantuan contoh ditukar ke ${modeLabel}.`, 'info');
  }
}

function createPolygonFromBatchCoords(silent = false, doSwitchTab = true) {
  const input = document.getElementById('batchCoordsInput');
  const raw = input?.value?.trim();
  if (!raw) {
    if (!silent) showToast('Masukkan daftar koordinat terlebih dahulu.', 'warn');
    return;
  }
  const lines = raw.split(/\r?\n/);
  const rawPairs = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const parts = line.split(/[,\s\t;]+/).filter(Boolean);
    if (parts.length >= 2) {
      let v1 = parseFloat(parts[0]);
      let v2 = parseFloat(parts[1]);
      if (isNaN(v1) && parts.length >= 3) {
        v1 = parseFloat(parts[1]);
        v2 = parseFloat(parts[2]);
      }
      if (!isNaN(v1) && !isNaN(v2)) {
        rawPairs.push({ v1, v2 });
      }
    }
  }

  if (rawPairs.length < 3) {
    if (!silent) showToast('Dibutuhkan minimal 3 titik koordinat valid untuk membentuk poligon bidang.', 'warn');
    return;
  }

  const first = rawPairs[0];
  const isFirstLng = (first.v1 > 50 && first.v2 < 20);
  const isExplicitLngLat = (input?.dataset?.coordMode === 'lng_lat') || (input?.dataset?.coordMode !== 'lat_lng' && isFirstLng);

  let pts = [];
  if (Math.abs(first.v1) <= 85 && Math.abs(first.v2) <= 85 && !isFirstLng && !isExplicitLngLat) {
    pts = rawPairs.map(p => ({ lat: p.v1, lng: p.v2 }));
  } else if (Math.abs(first.v1) <= 85 && Math.abs(first.v2) <= 85 && isExplicitLngLat && first.v1 < 50 && first.v2 < 50) {
    pts = rawPairs.map(p => ({ lat: p.v2, lng: p.v1 }));
  } else {
    const standardPts = rawPairs.map(p => {
      if (p.v1 > 50 && p.v2 < 20) {
        return { lat: p.v2, lng: p.v1 };
      } else if (p.v2 > 50 && p.v1 < 20) {
        return { lat: p.v1, lng: p.v2 };
      } else {
        return { lat: p.v1, lng: p.v2 };
      }
    });

    if (isExplicitLngLat) {
      const cLat = standardPts.reduce((s, p) => s + p.lat, 0) / standardPts.length;
      const cLng = standardPts.reduce((s, p) => s + p.lng, 0) / standardPts.length;
      const cosLat = Math.cos(cLat * Math.PI / 180);
      pts = standardPts.map(p => {
        const dLat = p.lat - cLat;
        const dLng = p.lng - cLng;
        return {
          lat: Number((cLat + (dLng * cosLat)).toFixed(7)),
          lng: Number((cLng + (dLat / (cosLat || 1))).toFixed(7))
        };
      });
    } else {
      pts = standardPts;
    }
  }

  if (pts[0].lat === pts[pts.length - 1].lat && pts[0].lng === pts[pts.length - 1].lng) {
    pts.pop();
  }
  if (pts.length < 3) {
    if (!silent) showToast('Titik koordinat tidak membentuk bidang (kurang dari 3 titik unik).', 'warn');
    return;
  }

  activeVertices = pts;
  activeMultiParts = [pts];
  activePinData = {
    identifikasi: 'DIGITASI-MANDIRI',
    tipe: 'HAK MILIK / PERIZINAN',
    luas_bpn: Math.round(calculatePolygonArea(pts)),
    luas_ukur: Math.round(calculatePolygonArea(pts)),
    polygon_coords: pts,
    is_bbox: false,
    source: isExplicitLngLat ? 'BATCH DIGITASI (LNG, LAT)' : 'BATCH DIGITASI (LAT, LNG)',
    desa: '-',
    kecamatan: '-',
    kabkot: '-',
    provinsi: '-'
  };

  renderCanvasPolygon(true);
  if (activePolygonLayer) {
    map.fitBounds(activePolygonLayer.getBounds(), { padding: [40, 40] });
  }

  const areaM2 = calculatePolygonArea(pts);
  const shpLuas = document.getElementById('shpLuas');
  if (shpLuas) shpLuas.value = (areaM2 / 10000.0).toFixed(6);
  const valLuasM2 = document.getElementById('valLuasM2');
  if (valLuasM2) valLuasM2.innerText = formatAreaM2(areaM2);
  const valLuasHa = document.getElementById('valLuasHa');
  if (valLuasHa) valLuasHa.innerText = formatAreaHa(areaM2);

  if (!silent) {
    showToast(`Poligon berhasil dibentuk dari ${pts.length} titik patok dan siap diekspor!`, 'success');
  }
  syncActivePolygonPanel();
  updateCoordsTable();
  if (doSwitchTab && typeof switchTab === 'function') {
    switchTab('tab-bidang');
  }
}

    function startDelineasiMandiriAtClick() {
      if (!activePinMarker) {
        showToast('Tentukan titik patok terlebih dahulu pada peta.', 'warn');
        return;
      }
      const latlng = activePinMarker.getLatLng();
      const lat = latlng.lat, lng = latlng.lng;
      const deltaLat = 0.000070;
      const deltaLng = 0.000070 / Math.cos(lat * Math.PI / 180);
      const manualBox = [
        { lat: +(lat + deltaLat).toFixed(7), lng: +(lng - deltaLng).toFixed(7) },
        { lat: +(lat + deltaLat).toFixed(7), lng: +(lng + deltaLng).toFixed(7) },
        { lat: +(lat - deltaLat).toFixed(7), lng: +(lng + deltaLng).toFixed(7) },
        { lat: +(lat - deltaLat).toFixed(7), lng: +(lng - deltaLng).toFixed(7) }
      ];
      const estArea = Math.round(calculatePolygonArea(manualBox));
      activePinData = activePinData || {};
      activePinData.lat = lat;
      activePinData.lng = lng;
      activePinData.luas_m2 = 0;
      activePinData.tipe_hak = 'Delineasi Mandiri';
      activePinData.source = 'MANUAL_DELINEATION';
      activePinData.nib = '';
      activePinData.nomor_hak = '';
      activePinData.nosu = '';
      rawInitialBboxCoords = manualBox;
      initCanvasRebuilder(lat, lng, estArea, manualBox);
      if (typeof window.renderBidangInfoPanel === 'function') {
        window.renderBidangInfoPanel(activePinData, manualBox);
      } else if (typeof renderCadastralProFields === 'function') {
        renderCadastralProFields();
      }
      const elStatusValidasi = document.getElementById('pinStatusValidasiText');
      if (elStatusValidasi) {
        elStatusValidasi.className = 'spec-value emerald';
        elStatusValidasi.innerText = 'Delineasi Presisi Realtime';
      }
      const elHudArea = document.getElementById('hudBpnArea');
      if (elHudArea) {
        elHudArea.innerHTML = `<span class="badge-pill green" style="padding:1px 6px;font-size:0.68rem;margin:0;">${formatAreaM2(estArea)}</span>`;
      }
      const elPinServer = document.getElementById('pinServerDataText') || document.getElementById('pinServerAktifText');
      if (elPinServer && typeof getCadastreServerMode === 'function') {
        elPinServer.innerText = (getCadastreServerMode() === 'server2') ? 'Server 2' : 'Server 1';
      }
      const notFoundBox = document.getElementById('persilNotFoundBox');
      const foundBox = document.getElementById('persilFoundBox');
      if (notFoundBox) notFoundBox.style.display = 'none';
      if (foundBox) foundBox.style.display = 'flex';
      const badge = document.getElementById('badgeRebuildStatus');
      if (badge) {
        badge.className = 'badge-pill yellow';
        badge.innerText = 'Delineasi Mandiri';
      }
      showToast('Mode delineasi mandiri aktif. Geser titik sudut patok untuk menyesuaikan bentuk bidang.', 'success');
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
      if (!(typeof isMemberProActive === 'function' && isMemberProActive())) {
        showToast('Rincian data kadaster resmi khusus Member PRO. Silakan upgrade akun.', 'warn');
        if (typeof openMemberModal === 'function') openMemberModal();
        return;
      }
      const serverName = (typeof getCadastreServerMode === 'function' && getCadastreServerMode() === 'server2') ? 'Server 2' : 'Server 1';
      const luasStr = (activePinData.luas_m2 && activePinData.luas_m2 > 0)
        ? `${Math.round(activePinData.luas_m2).toLocaleString('id-ID')} m²`
        : ((activePinData.polygon_coords && activePinData.polygon_coords.length >= 3)
          ? `${Math.round(calculatePolygonAreaM2(activePinData.polygon_coords)).toLocaleString('id-ID')} m² (Geometri Mandiri)`
          : 'Delineasi Mandiri Presisi');
      const summary = `DATA RESMI BIDANG TANAH KADASTRAL

Nomor Identifikasi Bidang (NIB): ${activePinData.nib || '-'}
Jenis Hak: ${activePinData.tipe_hak || '-'}
Nomor Surat Ukur: ${activePinData.nosu || '-'}
Nomor Hak: ${activePinData.nomor_hak || '-'}
Desa / Kelurahan: ${activePinData.desa || '-'}
Kecamatan: ${activePinData.kecamatan || '-'}
Kabupaten / Kota: ${activePinData.kabkot || '-'}
Provinsi: ${activePinData.provinsi || '-'}
Kantor Pertanahan: ${activePinData.kantah || '-'}
Luas Terdaftar: ${luasStr}
Koordinat Titik: ${activePinData.lat ? activePinData.lat.toFixed(6) : '-'}, ${activePinData.lng ? activePinData.lng.toFixed(6) : '-'}
Server Sumber Data: ${serverName}`;

      navigator.clipboard.writeText(summary).then(() => {
        showToast('Data lengkap bidang tanah berhasil disalin ke clipboard!', 'success');
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
      const elAkurasiAlat = document.getElementById('pinAkurasiAlatText'); if (elAkurasiAlat) elAkurasiAlat.innerText = '-';
      const elRtrw = document.getElementById('pinRtrwText'); if (elRtrw) elRtrw.innerText = '-';
      const elRdtr = document.getElementById('pinRdtrText'); if (elRdtr) elRdtr.innerText = '-';
      const elLsd = document.getElementById('pinLsdText'); if (elLsd) elLsd.innerText = '-';
      const elLbs = document.getElementById('pinLbsText'); if (elLbs) elLbs.innerText = '-';
      const elHutan = document.getElementById('pinHutanText'); if (elHutan) elHutan.innerText = '-';
      const elZnt = document.getElementById('pinZntText'); if (elZnt) elZnt.innerText = '-';
      const elZntRange = document.getElementById('pinZntRangeText'); if (elZntRange) elZntRange.innerText = '-';

      const elAdminCoordsBox = document.getElementById('adminPolygonCoordsBox');
      if (elAdminCoordsBox) elAdminCoordsBox.style.display = 'none';
      const elAdminCoordsText = document.getElementById('adminPolygonCoordsText');
      if (elAdminCoordsText) elAdminCoordsText.value = '';

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
      if (rawInitialBboxCoords && rawInitialBboxCoords.length >= 3) {
        activeVertices = cleanAndDeduplicateVertices(rawInitialBboxCoords.map(c => ({ lat: c.lat, lng: c.lng })), 0.05, 0.5);
        renderCanvasPolygon(true);
      }
    }

    function clearCanvasRebuilderLayers() {
      window.isBoundaryEditingActive = false;
      isParcelLocked = false;
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

    function ensureBidangHatchPattern(targetMap) {
      const m = targetMap || (typeof map !== 'undefined' ? map : null);
      if (!m || !m.getPanes) return;
      const panes = m.getPanes();
      const container = panes.overlayPane;
      if (!container) return;
      let svg = container.querySelector('svg');
      if (!svg && m._renderer && m._renderer._container) {
        svg = m._renderer._container;
      }
      if (!svg) svg = container.querySelector('svg');
      if (!svg) return;

      let defs = svg.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.insertBefore(defs, svg.firstChild);
      }
      if (!defs.querySelector('#bidangHatchPattern')) {
        const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
        pattern.setAttribute('id', 'bidangHatchPattern');
        pattern.setAttribute('width', '16');
        pattern.setAttribute('height', '16');
        pattern.setAttribute('patternTransform', 'rotate(45 0 0)');
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');

        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.setAttribute('width', '16');
        bgRect.setAttribute('height', '16');
        bgRect.setAttribute('fill', '#0284c7');
        bgRect.setAttribute('fill-opacity', '0.12');

        const hatchLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        hatchLine.setAttribute('x1', '0');
        hatchLine.setAttribute('y1', '0');
        hatchLine.setAttribute('x2', '0');
        hatchLine.setAttribute('y2', '16');
        hatchLine.setAttribute('stroke', '#ffffff');
        hatchLine.setAttribute('stroke-width', '2');
        hatchLine.setAttribute('stroke-opacity', '0.7');

        pattern.appendChild(bgRect);
        pattern.appendChild(hatchLine);
        defs.appendChild(pattern);
      }
    }
    window.ensureBidangHatchPattern = ensureBidangHatchPattern;

    function isPointInsideOrNearPolygon(ptLat, ptLng, polyCoords, toleranceMeters = 1.0) {
      if (!polyCoords || polyCoords.length < 3) return false;
      const normCoords = polyCoords.map(p => Array.isArray(p) ? { lat: Number(p[1]), lng: Number(p[0]) } : { lat: Number(p.lat), lng: Number(p.lng) });
      let inside = false;
      const n = normCoords.length;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = normCoords[i].lng, yi = normCoords[i].lat;
        const xj = normCoords[j].lng, yj = normCoords[j].lat;
        const intersect = ((yi > ptLat) !== (yj > ptLat)) && (ptLng < (xj - xi) * (ptLat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      if (inside) return true;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const p1 = normCoords[i];
        const p2 = normCoords[j];
        const midLat = (p1.lat + p2.lat) * 0.5;
        const cosLat = Math.cos(midLat * Math.PI / 180);
        const px = ptLng * 111320 * cosLat;
        const py = ptLat * 111320;
        const ax = p1.lng * 111320 * cosLat;
        const ay = p1.lat * 111320;
        const bx = p2.lng * 111320 * cosLat;
        const by = p2.lat * 111320;
        const abx = bx - ax;
        const aby = by - ay;
        const lenSq = abx * abx + aby * aby;
        let dist = 999999;
        if (lenSq === 0) {
          dist = Math.hypot(px - ax, py - ay);
        } else {
          let t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
          t = Math.max(0, Math.min(1, t));
          dist = Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
        }
        if (dist <= toleranceMeters) return true;
      }
      return false;
    }
    window.isPointInsideOrNearPolygon = isPointInsideOrNearPolygon;

    function cleanAndDeduplicateVertices(coords, minMeters = 0.30, maxDeg = 5.0) {
      if (!coords || coords.length < 3) return coords;
      let pts = coords.map(p => Array.isArray(p) ? { lat: Number(p[1]), lng: Number(p[0]) } : { lat: Number(p.lat), lng: Number(p.lng) });
      if (pts.length > 1 && Math.abs(pts[0].lat - pts[pts.length - 1].lat) < 0.000001 && Math.abs(pts[0].lng - pts[pts.length - 1].lng) < 0.000001) {
        pts.pop();
      }
      if (pts.length < 3) return pts;

      if (pts.length > 4) {
        const refLat = pts[0].lat;
        const cosLat = Math.cos(refLat * Math.PI / 180.0);
        const mPts = pts.map(p => ({
          x: p.lng * 111320.0 * cosLat,
          y: p.lat * 111320.0,
          orig: p
        }));

        function perpDist(pt, lStart, lEnd) {
          const dx = lEnd.x - lStart.x;
          const dy = lEnd.y - lStart.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq === 0) return Math.hypot(pt.x - lStart.x, pt.y - lStart.y);
          const t = Math.max(0, Math.min(1, ((pt.x - lStart.x) * dx + (pt.y - lStart.y) * dy) / lenSq));
          const projX = lStart.x + t * dx;
          const projY = lStart.y + t * dy;
          return Math.hypot(pt.x - projX, pt.y - projY);
        }

        function rdpRec(arr, eps) {
          if (arr.length <= 2) return arr;
          let maxD = 0;
          let idx = 0;
          for (let i = 1; i < arr.length - 1; i++) {
            const d = perpDist(arr[i], arr[0], arr[arr.length - 1]);
            if (d > maxD) {
              maxD = d;
              idx = i;
            }
          }
          if (maxD > eps) {
            const left = rdpRec(arr.slice(0, idx + 1), eps);
            const right = rdpRec(arr.slice(idx), eps);
            return left.slice(0, -1).concat(right);
          } else {
            return [arr[0], arr[arr.length - 1]];
          }
        }

        let maxD = -1;
        let idxA = 0;
        let idxB = Math.floor(mPts.length / 2);
        for (let i = 0; i < mPts.length; i++) {
          for (let j = i + 1; j < mPts.length; j++) {
            const d = Math.hypot(mPts[i].x - mPts[j].x, mPts[i].y - mPts[j].y);
            if (d > maxD) {
              maxD = d;
              idxA = i;
              idxB = j;
            }
          }
        }

        const ring1 = [];
        for (let i = idxA; ; i = (i + 1) % mPts.length) {
          ring1.push(mPts[i]);
          if (i === idxB) break;
        }
        const ring2 = [];
        for (let i = idxB; ; i = (i + 1) % mPts.length) {
          ring2.push(mPts[i]);
          if (i === idxA) break;
        }

        const simp1 = rdpRec(ring1, 0.70);
        const simp2 = rdpRec(ring2, 0.70);
        const merged = simp1.slice(0, -1).concat(simp2.slice(0, -1));
        if (merged.length >= 3) {
          pts = merged.map(p => ({
            lat: Number(p.orig.lat.toFixed(7)),
            lng: Number(p.orig.lng.toFixed(7))
          }));
        }
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
    window.cleanAndDeduplicateVertices = cleanAndDeduplicateVertices;

    function cleanActiveVerticesManual() {
      if (!activeVertices || activeVertices.length < 3) return;
      const countBefore = activeVertices.length;
      activeVertices = cleanAndDeduplicateVertices(activeVertices, 0.35, 6.0);
      const countAfter = activeVertices.length;
      renderCanvasPolygon(true);
      if (typeof renderCoordinatesTable === 'function') renderCoordinatesTable();
      if (countBefore !== countAfter) {
        showToast(`Berhasil merapikan patok. ${countBefore - countAfter} titik sudut ganda dibersihkan.`, 'success');
      } else {
        showToast(`Seluruh ${countAfter} titik patok sudah presisi tanpa titik ganda.`, 'info');
      }
    }

    function initCanvasRebuilder(centerLat, centerLng, targetAreaM2 = 60, rawBboxCoords = null) {
      clearCanvasRebuilderLayers();
      currentRotationAngle = 0;

      if (!rawBboxCoords || rawBboxCoords.length < 3) {
        return;
      }

      let pts = rawBboxCoords.map(p => Array.isArray(p) ? { lat: Number(p[1]), lng: Number(p[0]) } : { lat: Number(p.lat), lng: Number(p.lng) });
      if (pts.length > 1 && Math.abs(pts[0].lat - pts[pts.length - 1].lat) < 0.0000005 && Math.abs(pts[0].lng - pts[pts.length - 1].lng) < 0.0000005) {
        pts.pop();
      }
      pts = cleanAndDeduplicateVertices(pts, 0.05, 0.5);
      if (pts.length > 12) {
        pts = cleanAndDeduplicateVertices(pts, 1.2, 12.0);
      }
      activeVertices = pts.filter((pt, idx) => {
        if (idx === 0) return true;
        const prev = pts[idx - 1];
        return Math.hypot((pt.lat - prev.lat) * 111320, (pt.lng - prev.lng) * 111320) >= 0.05;
      });

      const toolbar = document.getElementById('mapPrecisionToolbar');
      if (toolbar) toolbar.style.display = 'flex';

      renderCanvasPolygon(true);
    }

    function rotateActivePolygon(deg) {
      if (!activeVertices || activeVertices.length < 3) return;
      currentRotationAngle = (currentRotationAngle + deg) % 360;
      const rad = deg * Math.PI / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);

      const cx = activeVertices.reduce((s, v) => s + v.lng, 0) / activeVertices.length;
      const cy = activeVertices.reduce((s, v) => s + v.lat, 0) / activeVertices.length;

      activeVertices = activeVertices.map(v => {
        const dx = (v.lng - cx) * Math.cos(cy * Math.PI / 180);
        const dy = v.lat - cy;
        const rx = dx * cosA - dy * sinA;
        const ry = dx * sinA + dy * cosA;
        return {
          lat: cy + ry,
          lng: cx + (rx / Math.cos(cy * Math.PI / 180))
        };
      });

      const rotLabel = document.getElementById('rotDegLabel');
      if (rotLabel) rotLabel.innerText = `${currentRotationAngle}°`;
      isGeometryManuallyEdited = true;
      renderCanvasPolygon(true);
    }

    var isFreeDeleteVertexMode = false;
    function toggleFreeDeleteVertexMode() {
      isFreeDeleteVertexMode = !isFreeDeleteVertexMode;
      const btn = document.getElementById('btnToggleFreeDelete');
      if (btn) {
        btn.classList.toggle('active', isFreeDeleteVertexMode);
        if (isFreeDeleteVertexMode) {
          showToast('Mode Hapus Patok Bebas Aktif: Klik langsung patok mana saja di peta untuk menghapusnya.', 'info');
        } else {
          showToast('Mode Hapus Patok Bebas dinonaktifkan.', 'info');
        }
      }
    }

    function removeVertexAt(idx) {
      if (activeVertices.length <= 3) {
        showToast('Poligon minimal membutuhkan 3 titik sudut patok.', 'warn');
        return;
      }
      isGeometryManuallyEdited = true;
      activeVertices.splice(idx, 1);
      renderCanvasPolygon(true);
    }

    function checkAndInsertBoundaryVertex(latlng, maxPixelDist = 20) {
      if (isFreeDeleteVertexMode || isDrawingPolygon || isMergeMode) return false;
      if (!map || !activeVertices || activeVertices.length < 3) return false;

      const clickPt = map.latLngToLayerPoint(latlng);
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];

      let bestDist = Infinity;
      let bestPartIdx = -1;
      let bestInsertIdx = -1;
      let bestProjLatLng = null;

      parts.forEach((partList, pIdx) => {
        const n = partList.length;
        for (let i = 0; i < n; i++) {
          const v1 = partList[i];
          const v2 = partList[(i + 1) % n];
          const ptA = map.latLngToLayerPoint(L.latLng(v1.lat, v1.lng));
          const ptB = map.latLngToLayerPoint(L.latLng(v2.lat, v2.lng));

          const dx = ptB.x - ptA.x;
          const dy = ptB.y - ptA.y;
          const segLenSq = dx * dx + dy * dy;
          if (segLenSq === 0) continue;

          let t = ((clickPt.x - ptA.x) * dx + (clickPt.y - ptA.y) * dy) / segLenSq;
          t = Math.max(0, Math.min(1, t));

          const projPt = L.point(ptA.x + t * dx, ptA.y + t * dy);
          const dist = clickPt.distanceTo(projPt);

          if (dist < bestDist) {
            const candLatLng = map.layerPointToLatLng(projPt);
            const distA = L.latLng(v1.lat, v1.lng).distanceTo(candLatLng);
            const distB = L.latLng(v2.lat, v2.lng).distanceTo(candLatLng);
            if (distA >= 0.35 && distB >= 0.35) {
              bestDist = dist;
              bestPartIdx = pIdx;
              bestInsertIdx = i + 1;
              bestProjLatLng = candLatLng;
            }
          }
        }
      });

      if (bestDist <= maxPixelDist && bestProjLatLng && bestPartIdx >= 0) {
        isGeometryManuallyEdited = true;
        const targetPart = parts[bestPartIdx];
        targetPart.splice(bestInsertIdx, 0, {
          lat: Number(bestProjLatLng.lat.toFixed(7)),
          lng: Number(bestProjLatLng.lng.toFixed(7))
        });
        if (parts.length === 1) activeVertices = targetPart;
        renderCanvasPolygon(true);
        showToast(`Patok baru berhasil disisipkan pada belokan batas (Total: ${activeVertices.length} patok).`, 'success');
        return true;
      }
      return false;
    }
    window.checkAndInsertBoundaryVertex = checkAndInsertBoundaryVertex;

    function handleActivePolygonClick(e) {
      if (checkAndInsertBoundaryVertex(e.latlng, 22)) {
        L.DomEvent.stopPropagation(e);
      }
    }

    function latLngToMeters(coords, refLat, refLng) {
      const cosLat = Math.cos(refLat * Math.PI / 180);
      return coords.map(p => {
        const lat = (p.lat !== undefined) ? Number(p.lat) : Number(p[1]);
        const lng = (p.lng !== undefined) ? Number(p.lng) : Number(p[0]);
        return [
          (lng - refLng) * 111320 * cosLat,
          (lat - refLat) * 111320
        ];
      });
    }

    function shoelacePolyArea(pts) {
      const n = pts.length;
      if (n < 3) return 0;
      let area = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
      }
      return Math.abs(area) * 0.5;
    }

    function signedPolyArea(pts) {
      const n = pts.length;
      if (n < 3) return 0;
      let area = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
      }
      return area * 0.5;
    }

    function ensurePolyCCW(pts) {
      if (signedPolyArea(pts) < 0) {
        return pts.slice().reverse();
      }
      return pts.slice();
    }

    function triangulatePolyCoords(pts) {
      const cleanPts = ensurePolyCCW(pts);
      const n = cleanPts.length;
      if (n < 3) return [];
      if (n === 3) return [cleanPts];
      const indices = [];
      for (let i = 0; i < n; i++) indices.push(i);
      const triangles = [];

      function isPtInTri(p, a, b, c) {
        function cross(p1, p2, p3) {
          return (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);
        }
        const cp1 = cross(a, b, p);
        const cp2 = cross(b, c, p);
        const cp3 = cross(c, a, p);
        return (cp1 >= -1e-9 && cp2 >= -1e-9 && cp3 >= -1e-9) || (cp1 <= 1e-9 && cp2 <= 1e-9 && cp3 <= 1e-9);
      }

      const maxIter = indices.length * 4;
      let iterCount = 0;
      while (indices.length > 3 && iterCount < maxIter) {
        iterCount++;
        let earFound = false;
        const k = indices.length;
        for (let i = 0; i < k; i++) {
          const prevIdx = indices[(i - 1 + k) % k];
          const currIdx = indices[i];
          const nextIdx = indices[(i + 1) % k];
          const a = cleanPts[prevIdx];
          const b = cleanPts[currIdx];
          const c = cleanPts[nextIdx];
          const crossAbBc = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
          if (crossAbBc <= 1e-9) continue;
          let containsOther = false;
          for (let j = 0; j < k; j++) {
            if (j === ((i - 1 + k) % k) || j === i || j === ((i + 1) % k)) continue;
            if (isPtInTri(cleanPts[indices[j]], a, b, c)) {
              containsOther = true;
              break;
            }
          }
          if (!containsOther) {
            triangles.push([a, b, c]);
            indices.splice(i, 1);
            earFound = true;
            break;
          }
        }
        if (!earFound) break;
      }
      if (indices.length === 3) {
        triangles.push([cleanPts[indices[0]], cleanPts[indices[1]], cleanPts[indices[2]]]);
      }
      return triangles;
    }

    function clipPolyByHalfPlane(poly, p1, p2) {
      const out = [];
      if (!poly || poly.length < 3) return out;
      function isInside(cp) {
        return (p2[0] - p1[0]) * (cp[1] - p1[1]) - (p2[1] - p1[1]) * (cp[0] - p1[0]) >= -1e-9;
      }
      function lineIntersect(s, e) {
        const dxSeg = e[0] - s[0];
        const dySeg = e[1] - s[1];
        const dxLine = p2[0] - p1[0];
        const dyLine = p2[1] - p1[1];
        const denom = dxSeg * dyLine - dySeg * dxLine;
        if (Math.abs(denom) < 1e-12) return s;
        const num = (p1[0] - s[0]) * dyLine - (p1[1] - s[1]) * dxLine;
        const t = Math.max(0, Math.min(1, num / denom));
        return [s[0] + t * dxSeg, s[1] + t * dySeg];
      }
      let s = poly[poly.length - 1];
      for (let i = 0; i < poly.length; i++) {
        const e = poly[i];
        if (isInside(e)) {
          if (!isInside(s)) out.push(lineIntersect(s, e));
          out.push(e);
        } else if (isInside(s)) {
          out.push(lineIntersect(s, e));
        }
        s = e;
      }
      return out;
    }

    function clipConvexPolygons(subject, clip) {
      let s = ensurePolyCCW(subject);
      const c = ensurePolyCCW(clip);
      let output = s;
      const n = c.length;
      for (let i = 0; i < n; i++) {
        output = clipPolyByHalfPlane(output, c[i], c[(i + 1) % n]);
        if (!output || output.length < 3) return [];
      }
      return output;
    }

    function calculatePolygonIntersectionArea(polyCoordsA, polyCoordsB) {
      if (!polyCoordsA || polyCoordsA.length < 3 || !polyCoordsB || polyCoordsB.length < 3) return 0;
      const refLat = polyCoordsA[0].lat !== undefined ? polyCoordsA[0].lat : polyCoordsA[0][1];
      const refLng = polyCoordsA[0].lng !== undefined ? polyCoordsA[0].lng : polyCoordsA[0][0];

      const mPolyA = latLngToMeters(polyCoordsA, refLat, refLng);
      const mPolyB = latLngToMeters(polyCoordsB, refLat, refLng);

      const triA = triangulatePolyCoords(mPolyA);
      const triB = triangulatePolyCoords(mPolyB);
      if (!triA.length || !triB.length) return 0;

      let totalInterArea = 0;
      for (let i = 0; i < triA.length; i++) {
        for (let j = 0; j < triB.length; j++) {
          const clipped = clipConvexPolygons(triA[i], triB[j]);
          if (clipped && clipped.length >= 3) {
            totalInterArea += shoelacePolyArea(clipped);
          }
        }
      }
      return totalInterArea;
    }

    function getCadastreParcelsPool() {
      if (Array.isArray(window.currentCadastreParcelsPool) && window.currentCadastreParcelsPool.length > 0) {
        return window.currentCadastreParcelsPool;
      }
      if (activePinData && Array.isArray(activePinData.merged_parcels) && activePinData.merged_parcels.length > 0) {
        return activePinData.merged_parcels;
      }
      if (Array.isArray(mergeParcelsList) && mergeParcelsList.length > 0) {
        return mergeParcelsList;
      }
      return [];
    }

    function evaluateOverlappingCadastreParcels(activeCoords) {
      if (!activeCoords || activeCoords.length < 3) return [];
      const pool = getCadastreParcelsPool();
      if (!pool || pool.length === 0) return [];

      const qualifying = [];
      const activeGeomArea = calculatePolygonArea(activeCoords);
      if (activeGeomArea <= 1) return [];

      for (let i = 0; i < pool.length; i++) {
        const item = pool[i];
        const itemCoords = item.coords || item.polygon_coords;
        if (!itemCoords || itemCoords.length < 3) continue;

        const itemArea = (item.geom_area_m2 && item.geom_area_m2 > 0)
          ? item.geom_area_m2
          : calculatePolygonArea(itemCoords);
        if (itemArea <= 1) continue;

        const interArea = calculatePolygonIntersectionArea(activeCoords, itemCoords);
        const overlapRatio = interArea / itemArea;

        if (overlapRatio > 0.50) {
          qualifying.push({
            index: i + 1,
            fid: item.fid || item.nib || `Bidang ${i + 1}`,
            nib: item.nib || item.fid || '-',
            nomor_hak: item.nomor_hak || item.nomor_hak_raw || '-',
            tipe_hak: item.tipe_hak || 'Hak Milik',
            luas_terdaftar_m2: (item.luas_m2 && Number(item.luas_m2) > 0) ? Number(item.luas_m2) : Math.round(itemArea),
            geom_area_m2: roundArea2(itemArea),
            intersection_area_m2: roundArea2(interArea),
            overlap_pct: (overlapRatio * 100).toFixed(1)
          });
        }
      }
      return qualifying;
    }

    function renderMergedParcelsList(qualifyingParcels, liveAreaM2) {
      const box = document.getElementById('boxDaftarBidangGabungan');
      if (!box) return;
      if (!qualifyingParcels || qualifyingParcels.length <= 1) {
        box.style.display = 'none';
        return;
      }
      box.style.display = 'flex';
      box.style.flexDirection = 'column';

      const badge = document.getElementById('badgeJumlahBidangGabungan');
      if (badge) badge.innerText = `${qualifyingParcels.length} Bidang`;

      const contentEl = document.getElementById('daftarBidangGabunganContent');
      if (contentEl) {
        let rowsHtml = '';
        let totalLuasTerdaftar = 0;
        qualifyingParcels.forEach((p, idx) => {
          totalLuasTerdaftar += p.luas_terdaftar_m2;
          const noHak = (p.nomor_hak && p.nomor_hak !== '-') ? p.nomor_hak : 'Belum Terbit';
          rowsHtml += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 6px; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--radius-xs);">
              <div style="display: flex; flex-direction: column; overflow: hidden; max-width: 65%;">
                <div style="font-weight: 700; color: var(--text-main); font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${idx + 1}. No. Hak: ${noHak}
                </div>
                <div style="font-size: 0.66rem; color: var(--text-muted); font-family: var(--font-mono);">
                  NIB: ${p.nib} : Overlap: ${p.overlap_pct}%
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-weight: 700; color: var(--emerald); font-size: 0.72rem; font-family: var(--font-mono);">
                  ${formatAreaM2(p.luas_terdaftar_m2)}
                </div>
              </div>
            </div>
          `;
        });
        contentEl.innerHTML = rowsHtml;

        const totalEl = document.getElementById('totalLuasTerdaftarGabungan');
        if (totalEl) totalEl.innerText = formatAreaM2(totalLuasTerdaftar);

        const elLuasBpn = document.getElementById('pinLuasBpnText');
        if (elLuasBpn) {
          elLuasBpn.className = 'stat-value emerald';
          elLuasBpn.innerText = `${formatAreaM2(totalLuasTerdaftar)} (${qualifyingParcels.length} Bidang)`;
        }

        const elNomorHak = document.getElementById('pinNomorHakText');
        if (elNomorHak) {
          const listHak = qualifyingParcels.map(p => p.nomor_hak).filter(n => n && n !== '-');
          elNomorHak.innerText = listHak.length > 0 ? listHak.join(', ') : 'Gabungan';
        }

        const diffPctEl = document.getElementById('diffPercentText');
        const diffBpnEl = document.getElementById('diffTargetBpnText');
        if (totalLuasTerdaftar > 0) {
          const diff = liveAreaM2 - totalLuasTerdaftar;
          const pct = Math.max(0, 100 - (Math.abs(diff) / totalLuasTerdaftar * 100));
          const diffText = diff >= 0 ? `+${diff.toFixed(2)} m²` : `${diff.toFixed(2)} m²`;
          if (diffPctEl) diffPctEl.innerText = `${diffText} (Presisi: ${pct.toFixed(2)}%)`;
          if (diffBpnEl) diffBpnEl.innerText = formatAreaM2(totalLuasTerdaftar);
        }
      }
    }

    function renderCanvasPolygon(updateHandles = true) {
      if (!activeVertices || activeVertices.length < 3) return;
      syncActivePolygonPanel();
      
      let latlngs;
      let liveAreaM2;
      if (activeMultiParts && activeMultiParts.length > 1) {
        latlngs = activeMultiParts.map(part => part.map(v => [v.lat, v.lng]));
        liveAreaM2 = activeMultiParts.reduce((sum, part) => sum + calculatePolygonArea(part), 0);
      } else {
        latlngs = activeVertices.map(v => [v.lat, v.lng]);
        liveAreaM2 = calculatePolygonArea(activeVertices);
      }

      ensureBidangHatchPattern(map);
      if (!activePolygonLayer) {
        activePolygonLayer = L.polygon(latlngs, {
          color: '#ea580c',
          weight: 3.5,
          opacity: 1,
          fillColor: '#ffffff',
          fillOpacity: 0.82,
          className: 'active-cadastre-polygon',
          interactive: true
        }).addTo(map);
        activePolygonLayer.on('click', handleActivePolygonClick);
      } else {
        activePolygonLayer.setLatLngs(latlngs);
        activePolygonLayer.setStyle({
          color: '#ea580c',
          weight: 3.5,
          opacity: 1,
          fillColor: '#ffffff',
          fillOpacity: 0.82,
          className: 'active-cadastre-polygon'
        });
      }
      const liveAreaHa = liveAreaM2 / 10000;

      const liveM2El = document.getElementById('canvasLiveAreaM2');
      const liveHaEl = document.getElementById('canvasLiveAreaHa');
      if (liveM2El) liveM2El.innerText = formatAreaM2(liveAreaM2);
      const shpLuasEl = document.getElementById('shpLuasHa') || document.getElementById('shpLuas');
      if (shpLuasEl) shpLuasEl.value = `${(liveAreaM2 / 10000.0).toFixed(6)} Ha`;

      const elValM2 = document.getElementById('valLuasM2'); if (elValM2) elValM2.innerText = formatAreaM2(liveAreaM2);
      const elValHa = document.getElementById('valLuasHa'); if (elValHa) elValHa.innerText = formatAreaHa(liveAreaM2);
      const peri = calculatePolygonPerimeter(activeVertices.map(v => L.latLng(v.lat, v.lng)));
      const elValKel = document.getElementById('valKeliling'); if (elValKel) elValKel.innerText = `${peri.toFixed(2)} m`;
      const elValTitik = document.getElementById('valTitik'); if (elValTitik) elValTitik.innerText = activeVertices.length;

      const hudLive = document.getElementById('hudLiveArea');
      if (hudLive) hudLive.innerText = formatAreaM2(liveAreaM2);

      const registeredBpnArea = (activePinData && activePinData.luas_terdaftar_m2 !== undefined && activePinData.luas_terdaftar_m2 !== null && activePinData.luas_terdaftar_m2 > 0)
        ? activePinData.luas_terdaftar_m2
        : (activePinData?.luas_m2 || 0);

      const isManual = (activePinData && (activePinData.tipe_hak === 'Delineasi Mandiri' || activePinData.source === 'MANUAL_DELINEATION'));
      const cardTerdaftar = document.getElementById('cardLuasTerdaftar');
      const grid = document.getElementById('gridLuasCards');
      const elLuasBpn = document.getElementById('pinLuasBpnText');
      if (cardTerdaftar && elLuasBpn) {
        if (!isManual && registeredBpnArea > 0) {
          cardTerdaftar.style.display = 'block';
          elLuasBpn.innerText = formatAreaM2(registeredBpnArea);
          if (grid) grid.style.gridTemplateColumns = '1fr 1fr';
        } else {
          cardTerdaftar.style.display = 'none';
          if (grid) grid.style.gridTemplateColumns = '1fr';
        }
      }
      if (typeof window.renderBidangInfoPanel === 'function') {
        window.renderBidangInfoPanel(activePinData, activeVertices);
      }

      if (registeredBpnArea > 0) {
        const diff = liveAreaM2 - registeredBpnArea;
        const pct = Math.max(0, 100 - (Math.abs(diff) / registeredBpnArea * 100));
        const diffText = diff >= 0 ? `+${diff.toFixed(2)} m²` : `${diff.toFixed(2)} m²`;
        const diffPctEl = document.getElementById('diffPercentText');
        const diffBpnEl = document.getElementById('diffTargetBpnText');
        if (diffPctEl) diffPctEl.innerText = `${diffText} (Presisi: ${pct.toFixed(2)}%)`;
        if (diffBpnEl) diffBpnEl.innerText = formatAreaM2(registeredBpnArea);
      } else {
        const diffPctEl = document.getElementById('diffPercentText');
        const diffBpnEl = document.getElementById('diffTargetBpnText');
        if (diffPctEl) diffPctEl.innerText = '100% Geometri Mandiri';
        if (diffBpnEl) diffBpnEl.innerText = formatAreaM2(liveAreaM2);
      }

      if (isGeometryManuallyEdited) {
        const elStatusValidasi = document.getElementById('pinStatusValidasiText');
        if (elStatusValidasi) {
          elStatusValidasi.className = 'spec-value emerald';
          elStatusValidasi.innerText = 'Kalkulasi Geometri Real';
        }
      }

      const qualifyingParcels = evaluateOverlappingCadastreParcels(activeVertices);
      if (qualifyingParcels && qualifyingParcels.length > 1) {
        renderMergedParcelsList(qualifyingParcels, liveAreaM2);
      } else {
        const box = document.getElementById('boxDaftarBidangGabungan');
        if (box) box.style.display = 'none';
        const elNomorHak = document.getElementById('pinNomorHakText');
        if (elNomorHak && activePinData) {
          elNomorHak.innerText = activePinData.nomor_hak || activePinData.nomor_hak_raw || '-';
        }
      }

      if (updateHandles) {
        renderVertexHandles();
        renderEdgeDistanceLabels();
      } else {
        updateEdgeDistancePositions();
      }
      if (activePolygonLayer && typeof activePolygonLayer.bringToBack === 'function') activePolygonLayer.bringToBack();
      if (activePinMarker && typeof activePinMarker.setZIndexOffset === 'function') activePinMarker.setZIndexOffset(1000);
      if (vertexMarkers && vertexMarkers.length > 0) vertexMarkers.forEach(m => { if (typeof m.setZIndexOffset === 'function') m.setZIndexOffset(2000); });
      if (vertexAddMarkers && vertexAddMarkers.length > 0) vertexAddMarkers.forEach(m => { if (typeof m.setZIndexOffset === 'function') m.setZIndexOffset(1500); });
      if (typeof renderCoordinatesTable === 'function') renderCoordinatesTable();
      if (typeof updateAdminPolygonCoordsUI === 'function') updateAdminPolygonCoordsUI(activeVertices);
    }

    function renderVertexHandles() {
      vertexMarkers.forEach(m => map.removeLayer(m));
      vertexMarkers = [];
      vertexAddMarkers.forEach(m => map.removeLayer(m));
      vertexAddMarkers = [];

      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      const partPrefixes = ['A', 'B', 'C', 'D', 'E', 'F'];

      parts.forEach((partList, pIdx) => {
        const pfx = parts.length > 1 ? (partPrefixes[pIdx] || `P${pIdx+1}`) : 'P';
        const numPts = partList.length;

        partList.forEach((v, idx) => {
          const nodeLabel = parts.length > 1 ? `${pfx}${idx + 1}` : `P${idx + 1}`;
          const isLocked = isVertexLocked(pIdx, idx);
          const nodeIcon = L.divIcon({
            className: 'vertex-pin',
            html: `<div class="custom-vertex-node ${isLocked ? 'vertex-locked' : ''}">${nodeLabel}${isLocked ? ' 🔒' : ''}</div>`,
            iconSize: [isLocked ? 24 : 18, 18],
            iconAnchor: [isLocked ? 12 : 9, 9]
          });

          const marker = L.marker([v.lat, v.lng], {
            icon: nodeIcon,
            draggable: !isLocked,
            zIndexOffset: isLocked ? 1200 : 1000
          }).addTo(map);
          marker._partIdx = pIdx;
          marker._vertIdx = idx;

          const popupContent = `
            <div class="patok-popup-card ${isLocked ? 'is-locked-card' : ''}">
              <div class="patok-popup-header">
                <div class="patok-popup-title-group">
                  <span class="patok-popup-badge ${isLocked ? 'badge-locked' : ''}">${nodeLabel}</span>
                  <span class="patok-popup-index">#${idx+1}</span>
                </div>
                <button type="button" class="btn-lock-toggle ${isLocked ? 'locked' : ''}" onclick="window.toggleVertexLockFromPopup(${pIdx}, ${idx})" title="${isLocked ? 'Lepaskan Kunci Patok (Buka Akses Ubah/Hapus)' : 'Kunci Patok (Cegah Ubah, Geser, dan Hapus)'}">
                  ${isLocked ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>'}
                </button>
              </div>

              ${isLocked ? `
              <div class="patok-locked-banner">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>Patok Terkunci : Buka kunci untuk edit/hapus</span>
              </div>` : ''}

              <div class="patok-popup-coords-row">
                <span id="vCoordText_${pIdx}_${idx}" class="patok-popup-coords">${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}</span>
                <button type="button" class="btn-patok-edit" ${isLocked ? 'disabled style="opacity:0.3;cursor:not-allowed;pointer-events:none;" title="Patok Terkunci"' : `onclick="window.editVertexCoordinate(${pIdx}, ${idx})" title="Edit Koordinat Manual"`}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </div>
              <div class="patok-popup-nudge-box ${isLocked ? 'nudge-box-disabled' : ''}">
                <div class="patok-nudge-header">
                  <span>Geser Presisi</span>
                  <span class="nudge-unit">${isLocked ? 'Terkunci' : '±1 cm'}</span>
                </div>
                <div class="patok-nudge-pad">
                  <button type="button" class="btn-nudge-dir btn-nudge-up" ${isLocked ? 'disabled style="opacity:0.25;cursor:not-allowed;pointer-events:none;"' : `onpointerdown="window.startNudgeHold(${pIdx}, ${idx}, 'up', event)" onpointerup="window.stopNudgeHold(event)" onpointercancel="window.stopNudgeHold(event)" onpointerleave="window.stopNudgeHold(event)" onmousedown="window.startNudgeHold(${pIdx}, ${idx}, 'up', event)" onmouseup="window.stopNudgeHold(event)" title="Geser 1 cm ke Utara (Atas)"`}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                  </button>
                  <div class="patok-nudge-mid-row">
                    <button type="button" class="btn-nudge-dir btn-nudge-left" ${isLocked ? 'disabled style="opacity:0.25;cursor:not-allowed;pointer-events:none;"' : `onpointerdown="window.startNudgeHold(${pIdx}, ${idx}, 'left', event)" onpointerup="window.stopNudgeHold(event)" onpointercancel="window.stopNudgeHold(event)" onpointerleave="window.stopNudgeHold(event)" onmousedown="window.startNudgeHold(${pIdx}, ${idx}, 'left', event)" onmouseup="window.stopNudgeHold(event)" title="Geser 1 cm ke Barat (Kiri)"`}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <div class="btn-nudge-center" title="${isLocked ? 'Terkunci' : 'Akurasi Geodetik 1 cm'}">${isLocked ? '🔒' : '1cm'}</div>
                    <button type="button" class="btn-nudge-dir btn-nudge-right" ${isLocked ? 'disabled style="opacity:0.25;cursor:not-allowed;pointer-events:none;"' : `onpointerdown="window.startNudgeHold(${pIdx}, ${idx}, 'right', event)" onpointerup="window.stopNudgeHold(event)" onpointercancel="window.stopNudgeHold(event)" onpointerleave="window.stopNudgeHold(event)" onmousedown="window.startNudgeHold(${pIdx}, ${idx}, 'right', event)" onmouseup="window.stopNudgeHold(event)" title="Geser 1 cm ke Timur (Kanan)"`}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18"/></svg>
                    </button>
                  </div>
                  <button type="button" class="btn-nudge-dir btn-nudge-down" ${isLocked ? 'disabled style="opacity:0.25;cursor:not-allowed;pointer-events:none;"' : `onpointerdown="window.startNudgeHold(${pIdx}, ${idx}, 'down', event)" onpointerup="window.stopNudgeHold(event)" onpointercancel="window.stopNudgeHold(event)" onpointerleave="window.stopNudgeHold(event)" onmousedown="window.startNudgeHold(${pIdx}, ${idx}, 'down', event)" onmouseup="window.stopNudgeHold(event)" title="Geser 1 cm ke Selatan (Bawah)"`}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                </div>
              </div>
              <div class="patok-popup-actions">
                <div class="patok-actions-row">
                  <button type="button" class="btn-patok-action" ${isLocked ? 'disabled style="opacity:0.35;cursor:not-allowed;pointer-events:none;"' : `onclick="window.addVertexNextTo(${pIdx}, ${idx}, 'prev')"`}>+ Sisi Kiri</button>
                  <button type="button" class="btn-patok-action" ${isLocked ? 'disabled style="opacity:0.35;cursor:not-allowed;pointer-events:none;"' : `onclick="window.addVertexNextTo(${pIdx}, ${idx}, 'next')"`}>+ Sisi Kanan</button>
                </div>
                <button type="button" class="btn-patok-delete ${isLocked ? 'disabled' : ''}" ${isLocked ? 'disabled style="opacity:0.4;cursor:not-allowed;pointer-events:none;background-color:#f1f5f9;color:#94a3b8;border-color:#cbd5e1;" title="Lepaskan kunci patok terlebih dahulu untuk menghapus"' : `onclick="window.deleteVertexMarker(${pIdx}, ${idx})"`}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  ${isLocked ? `Patok ${nodeLabel} Terkunci` : `Hapus Patok ${nodeLabel}`}
                </button>
                ${parts.length > 1 ? `
                <button type="button" class="btn-patok-delete" style="color:#991b1b;border-color:#fca5a5;" ${isLocked ? 'disabled style="opacity:0.4;cursor:not-allowed;pointer-events:none;"' : `onclick="window.deletePartEntirely(${pIdx})"`}>
                  Hapus Bagian ${pfx}
                </button>` : ''}
              </div>
            </div>
          `;
          marker.bindPopup(popupContent, {
            offset: [0, -10],
            closeButton: false,
            className: 'vertex-action-popup',
            autoPan: false
          });

          let popupCloseTimer = null;

          function scheduleClosePopup(delayMs = 1000) {
            if (popupCloseTimer) clearTimeout(popupCloseTimer);
            popupCloseTimer = setTimeout(() => {
              if (marker._isHoveringPopup || marker._isHoveringMarker || marker._isDragging || window.isDraggingVertex || isNudgeActive) return;
              marker.closePopup();
            }, delayMs);
          }

          function cancelClosePopup() {
            if (popupCloseTimer) {
              clearTimeout(popupCloseTimer);
              popupCloseTimer = null;
            }
          }

          function attachPopupHoverListeners() {
            const popup = marker.getPopup();
            const popupEl = popup ? popup.getElement() : null;
            if (popupEl && !popupEl._hasHoverBinding) {
              popupEl._hasHoverBinding = true;
              popupEl.addEventListener('mouseenter', function() {
                marker._isHoveringPopup = true;
                cancelClosePopup();
              });
              popupEl.addEventListener('mouseleave', function() {
                marker._isHoveringPopup = false;
                scheduleClosePopup(1000);
              });
            }
          }

          marker.on('popupopen', function() {
            attachPopupHoverListeners();
          });

          marker.on('popupclose', function() {
            marker._isHoveringPopup = false;
            cancelClosePopup();
          });

          marker.on('mouseover', function() {
            if (marker._isDragging || isFreeDeleteVertexMode || window.isDraggingVertex) return;
            if (window.dragEndCooldown && Date.now() < window.dragEndCooldown) return;
            marker._isHoveringMarker = true;
            cancelClosePopup();
            if (!marker.isPopupOpen()) {
              map.closePopup();
              marker.openPopup();
            }
            attachPopupHoverListeners();
          });

          marker.on('mouseout', function() {
            marker._isHoveringMarker = false;
            scheduleClosePopup(1000);
          });

          marker.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            if (isFreeDeleteVertexMode) {
              window.deleteVertexMarker(pIdx, idx);
              return;
            }
            if (window.isDraggingVertex || isNudgeActive) return;
            cancelClosePopup();
            marker.openPopup();
          });

          marker.on('dragstart', function() {
            window.isDraggingVertex = true;
            marker._isDragging = true;
            window.isBoundaryEditingActive = true;
            cancelClosePopup();
            marker.closePopup();
            map.closePopup();
          });

          marker.on('drag', function(e) {
            window.isDraggingVertex = true;
            window.isBoundaryEditingActive = true;
            isGeometryManuallyEdited = true;
            if (marker.isPopupOpen()) {
              marker.closePopup();
            }
            const pos = e.target.getLatLng();
            partList[idx] = { lat: pos.lat, lng: pos.lng };
            if (parts.length === 1) activeVertices[idx] = { lat: pos.lat, lng: pos.lng };
            renderCanvasPolygon(false);
          });

          marker.on('dragend', function() {
            marker._isDragging = false;
            window.isDraggingVertex = false;
            window.dragEndCooldown = Date.now() + 400;
            window.isBoundaryEditingActive = true;
            isGeometryManuallyEdited = true;
            marker.closePopup();
            renderCanvasPolygon(true);
          });

          marker.on('contextmenu', function(e) {
            L.DomEvent.stopPropagation(e);
            window.deleteVertexMarker(pIdx, idx);
          });

          vertexMarkers.push(marker);

          const nextIdx = (idx + 1) % numPts;
          const nextV = partList[nextIdx];
          const p1 = L.latLng(v.lat, v.lng);
          const p2 = L.latLng(nextV.lat, nextV.lng);
          const dist = p1.distanceTo(p2);

          const curZ = map.getZoom();
          const minAddDist = curZ >= 22 ? 0.3 : (curZ >= 19 ? 0.7 : (curZ >= 17 ? 1.5 : 3.0));
          if (dist >= minAddDist) {
            const midLat = (v.lat + nextV.lat) / 2;
            const midLng = (v.lng + nextV.lng) / 2;

            const addIcon = L.divIcon({
              className: 'vertex-add',
              html: `<div class="custom-vertex-add">+</div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7]
            });

            const addMarker = L.marker([midLat, midLng], {
              icon: addIcon,
              zIndexOffset: 900
            }).addTo(map);

            addMarker.on('click', function(e) {
              L.DomEvent.stopPropagation(e);
              isGeometryManuallyEdited = true;
              if (parts.length === 1) {
                activeVertices.splice(idx + 1, 0, { lat: midLat, lng: midLng });
              } else {
                partList.splice(idx + 1, 0, { lat: midLat, lng: midLng });
              }
              renderCanvasPolygon(true);
            });

            vertexAddMarkers.push(addMarker);
          }
        });
      });
    }

    function renderEdgeDistanceLabels() {
      edgeDistMarkers.forEach(m => map.removeLayer(m));
      edgeDistMarkers = [];

      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];

      parts.forEach(partList => {
        const numPts = partList.length;
        partList.forEach((v, idx) => {
          const nextV = partList[(idx + 1) % numPts];
          const p1 = L.latLng(v.lat, v.lng);
          const p2 = L.latLng(nextV.lat, nextV.lng);
          const dist = p1.distanceTo(p2);

          const curZ = map.getZoom();
          const minLabelDist = curZ >= 23 ? 0.4 : (curZ >= 20 ? 1.0 : 2.5);
          if (dist < minLabelDist) return;

          const midLat = (v.lat + nextV.lat) / 2;
          const midLng = (v.lng + nextV.lng) / 2;

          const labelIcon = L.divIcon({
            className: 'edge-dist',
            html: `<div class="edge-dist-tag">${dist.toFixed(2)} m</div>`,
            iconSize: [64, 22],
            iconAnchor: [32, 26]
          });

          const m = L.marker([midLat, midLng], {
            icon: labelIcon,
            interactive: false,
            zIndexOffset: 800
          }).addTo(map);

          edgeDistMarkers.push(m);
        });
      });
    }

    function updateEdgeDistancePositions() {
      renderEdgeDistanceLabels();
    }

    function findSharedEdgesAndLock(parcelsList, snapThresholdMeters = 3.5) {
      function distM(p1, p2) {
        const dlat = (p1.lat - p2.lat) * 111320;
        const midLat = (p1.lat + p2.lat) * 0.5;
        const dlng = (p1.lng - p2.lng) * (111320 * Math.cos(midLat * Math.PI / 180));
        return Math.hypot(dlat, dlng);
      }

      const parcels = parcelsList.map(p => ({
        fid: p.fid || 'Bidang',
        targetArea: (p.luas && p.luas > 0) ? p.luas : calculatePolygonArea(p.vertices),
        vertices: p.vertices.map(v => ({ lat: v.lat, lng: v.lng, locked: false }))
      }));

      const numP = parcels.length;
      for (let a = 0; a < numP; a++) {
        for (let b = a + 1; b < numP; b++) {
          const polyA = parcels[a].vertices;
          const polyB = parcels[b].vertices;
          const nA = polyA.length;
          const nB = polyB.length;

          for (let i = 0; i < nA; i++) {
            const a1 = polyA[i];
            const a2 = polyA[(i + 1) % nA];

            for (let j = 0; j < nB; j++) {
              const b1 = polyB[j];
              const b2 = polyB[(j + 1) % nB];

              const dOpp1 = distM(a1, b2);
              const dOpp2 = distM(a2, b1);
              if (dOpp1 <= snapThresholdMeters && dOpp2 <= snapThresholdMeters) {
                b2.lat = a1.lat; b2.lng = a1.lng;
                b1.lat = a2.lat; b1.lng = a2.lng;
                a1.locked = true; a2.locked = true;
                b1.locked = true; b2.locked = true;
              }

              const dSame1 = distM(a1, b1);
              const dSame2 = distM(a2, b2);
              if (dSame1 <= snapThresholdMeters && dSame2 <= snapThresholdMeters) {
                b1.lat = a1.lat; b1.lng = a1.lng;
                b2.lat = a2.lat; b2.lng = a2.lng;
                a1.locked = true; a2.locked = true;
                b1.locked = true; b2.locked = true;
              }
            }
          }
        }
      }
      return parcels;
    }

    function scaleParcelConstrained(vertices, targetArea) {
      if (!vertices || vertices.length < 3 || !targetArea || targetArea <= 0) return vertices;
      const curArea = calculatePolygonArea(vertices);
      if (curArea <= 0 || Math.abs(curArea - targetArea) < 0.2) return vertices;

      const lockedIndices = [];
      vertices.forEach((v, idx) => {
        if (v.locked) lockedIndices.push(idx);
      });

      if (lockedIndices.length === 0) {
        const scale = Math.sqrt(targetArea / curArea);
        let cLat = 0, cLng = 0;
        vertices.forEach(v => { cLat += v.lat; cLng += v.lng; });
        cLat /= vertices.length;
        cLng /= vertices.length;

        return vertices.map(v => ({
          lat: Number((cLat + (v.lat - cLat) * scale).toFixed(7)),
          lng: Number((cLng + (v.lng - cLng) * scale).toFixed(7)),
          locked: false
        }));
      }

      if (lockedIndices.length >= vertices.length) {
        return vertices;
      }

      let anchorLat = 0, anchorLng = 0;
      lockedIndices.forEach(idx => {
        anchorLat += vertices[idx].lat;
        anchorLng += vertices[idx].lng;
      });
      anchorLat /= lockedIndices.length;
      anchorLng /= lockedIndices.length;

      function tryScale(s) {
        return vertices.map((v, idx) => {
          if (v.locked) {
            return { lat: v.lat, lng: v.lng, locked: true };
          }
          return {
            lat: Number((anchorLat + (v.lat - anchorLat) * s).toFixed(7)),
            lng: Number((anchorLng + (v.lng - anchorLng) * s).toFixed(7)),
            locked: false
          };
        });
      }

      let low = 0.05, high = 4.0;
      for (let iter = 0; iter < 28; iter++) {
        const mid = (low + high) / 2;
        const cand = tryScale(mid);
        const a = calculatePolygonArea(cand);
        if (a < targetArea) {
          low = mid;
        } else {
          high = mid;
        }
      }

      return tryScale((low + high) / 2);
    }

    function computePartialRescaleParts(rawParts, targetCleanM2) {
      if (!rawParts || rawParts.length === 0 || !targetCleanM2 || targetCleanM2 <= 0) return rawParts;
      let anyUnlocked = false;
      rawParts.forEach((part, pIdx) => {
        part.forEach((v, idx) => {
          if (!isVertexLocked(pIdx, idx)) {
            anyUnlocked = true;
          }
        });
      });
      if (!anyUnlocked) return null;

      let currentTotalM2 = 0;
      rawParts.forEach(p => { currentTotalM2 += calculatePolygonArea(p); });
      if (currentTotalM2 <= 0) return rawParts;

      return rawParts.map((part, pIdx) => {
        const lockedIndices = [];
        const unlockedIndices = [];
        part.forEach((v, idx) => {
          if (isVertexLocked(pIdx, idx)) {
            lockedIndices.push(idx);
          } else {
            unlockedIndices.push(idx);
          }
        });

        if (unlockedIndices.length === 0) {
          return part.map(v => ({ lat: v.lat, lng: v.lng }));
        }

        const curPartArea = calculatePolygonArea(part);
        const partRatio = curPartArea / currentTotalM2;
        const targetPartArea = targetCleanM2 * partRatio;

        if (lockedIndices.length === 0) {
          let sumLat = 0, sumLng = 0;
          part.forEach(v => { sumLat += v.lat; sumLng += v.lng; });
          const cLat = sumLat / part.length;
          const cLng = sumLng / part.length;
          let currentPts = part.map(v => ({ lat: v.lat, lng: v.lng }));
          for (let iter = 0; iter < 24; iter++) {
            const curArea = calculatePolygonArea(currentPts);
            if (curArea <= 0 || Math.abs(curArea - targetPartArea) < 0.00001) break;
            const factor = Math.sqrt(targetPartArea / curArea);
            currentPts = currentPts.map(v => ({
              lat: cLat + factor * (v.lat - cLat),
              lng: cLng + factor * (v.lng - cLng)
            }));
          }
          return currentPts.map(v => ({
            lat: Number(v.lat.toFixed(7)),
            lng: Number(v.lng.toFixed(7))
          }));
        }

        let sumFreeLat = 0, sumFreeLng = 0;
        unlockedIndices.forEach(i => {
          sumFreeLat += part[i].lat;
          sumFreeLng += part[i].lng;
        });
        const anchorLat = sumFreeLat / unlockedIndices.length;
        const anchorLng = sumFreeLng / unlockedIndices.length;

        let low = 0.001;
        let high = 15.0;
        let bestPts = part;

        for (let it = 0; it < 48; it++) {
          const mid = (low + high) / 2.0;
          const testPts = part.map((v, idx) => {
            if (lockedIndices.includes(idx)) {
              return { lat: v.lat, lng: v.lng };
            }
            return {
              lat: Number((anchorLat + mid * (v.lat - anchorLat)).toFixed(7)),
              lng: Number((anchorLng + mid * (v.lng - anchorLng)).toFixed(7))
            };
          });
          const testArea = calculatePolygonArea(testPts);
          if (testArea < targetPartArea) {
            low = mid;
          } else {
            high = mid;
          }
          bestPts = testPts;
          if (Math.abs(testArea - targetPartArea) < 0.00001) break;
        }
        return bestPts;
      });
    }

    function autoScaleToBpnArea() {
      if (!activeVertices || activeVertices.length < 3) {
        showToast('Harap pilih atau digitasi bidang tanah terlebih dahulu.', 'warn');
        return;
      }

      if (isMergeMode && mergeParcelsList && mergeParcelsList.length > 0) {
        mergeParcelsList[0].coords = activeVertices.map(v => [v.lng, v.lat]);
        let curTotalArea = 0;
        const rawParcels = mergeParcelsList.map(p => {
          const pts = p.coords.map(c => Array.isArray(c) ? { lat: c[1], lng: c[0] } : { lat: c.lat, lng: c.lng });
          const a = calculatePolygonArea(pts);
          curTotalArea += a;
          return {
            fid: p.fid || 'Bidang',
            luas: (p.luas && p.luas > 0) ? p.luas : a,
            curArea: a,
            vertices: pts
          };
        });

        if (curTotalArea <= 0) return;

        const targetTotalArea = (activePinData && activePinData.luas_m2 > 0) ? activePinData.luas_m2 : curTotalArea;
        const globalScaleFactor = targetTotalArea / curTotalArea;

        rawParcels.forEach(p => {
          if (p.luas > 0 && Math.abs(p.luas - p.curArea) > 0.5) {
            p.targetArea = p.luas;
          } else {
            p.targetArea = p.curArea * globalScaleFactor;
          }
        });

        const lockedParcels = findSharedEdgesAndLock(rawParcels, 3.5);

        const adjustedParcels = lockedParcels.map(p => ({
          fid: p.fid || 'Bidang',
          luas: p.targetArea,
          vertices: scaleParcelConstrained(p.vertices, p.targetArea)
        }));

        activeVertices = adjustedParcels[0].vertices.map(v => ({ lat: v.lat, lng: v.lng }));
        mergeParcelsList[0].coords = activeVertices.map(v => [v.lng, v.lat]);

        for (let i = 1; i < adjustedParcels.length; i++) {
          const vList = adjustedParcels[i].vertices.map(v => ({ lat: v.lat, lng: v.lng }));
          mergeParcelsList[i].coords = vList.map(v => [v.lng, v.lat]);
          if (mergePreviewLayers[i - 1]) {
            mergePreviewLayers[i - 1].setLatLngs(vList.map(v => [v.lat, v.lng]));
          }
        }

        renderCanvasPolygon(true);
        showToast(`Presisi Batas berhasil: Seluruh ${mergeParcelsList.length} bidang terseleksi telah disesuaikan ukurannya dengan batas persekutuan terkunci presisi tanpa saling menimpa.`, 'success');
        return;
      }

      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      let curTotalArea = 0;
      let totalPts = 0;
      let lockedPts = 0;

      parts.forEach((part, pIdx) => {
        curTotalArea += calculatePolygonArea(part);
        part.forEach((v, idx) => {
          totalPts++;
          if (isVertexLocked(pIdx, idx)) lockedPts++;
        });
      });

      if (curTotalArea <= 0) return;

      if (lockedPts >= totalPts && totalPts > 0) {
        showToast('Seluruh patok berstatus terkunci. Buka kunci minimal 1 patok untuk penyesuaian luas.', 'warn');
        return;
      }

      let targetArea = activePinData?.luas_m2 || 0;
      if (!targetArea || targetArea <= 0) {
        if (typeof openRescaleModal === 'function') {
          openRescaleModal('oss');
          return;
        }
        targetArea = Math.round(curTotalArea);
      }

      targetArea = roundArea2(targetArea);

      const rescaledParts = computePartialRescaleParts(parts, targetArea);
      if (rescaledParts && rescaledParts.length > 0) {
        if (activeMultiParts && activeMultiParts.length > 1) {
          activeMultiParts = rescaledParts;
          activeVertices = rescaledParts[0];
        } else {
          activeVertices = rescaledParts[0];
        }
      }

      if (activePinData) {
        activePinData.luas_m2 = targetArea;
        activePinData.luas_ha = roundAreaHa6(targetArea);
      }
      isGeometryManuallyEdited = false;
      renderCanvasPolygon(true);
      showToast(lockedPts > 0 ? `Presisi Batas: Luas disesuaikan ke ${formatAreaM2(targetArea)} dengan ${lockedPts} patok terkunci statis.` : `Presisi Batas: Ukuran poligon disesuaikan ke ${formatAreaM2(targetArea)} (kunci patok via popup jika ingin sisi tertentu statis).`, 'success');
    }

    function toggleMergeMode() {
      if (isMergeMode) {
        cancelMergeMode();
        return;
      }
      const isProOrAdmin = (typeof isMemberProActive === 'function' && isMemberProActive()) || (typeof isMemberAdminActive === 'function' && isMemberAdminActive());
      if (!isProOrAdmin) {
        showToast('Fitur seleksi & penggabungan multi-bidang memerlukan akses PRO atau ADMIN. Silakan masuk akun.', 'warn');
        if (typeof openMemberModal === 'function') openMemberModal();
        return;
      }
      if (!activeVertices || activeVertices.length < 3) {
        showToast('Pilih bidang tanah awal terlebih dahulu dengan mengklik peta.', 'warn');
        return;
      }
      isMergeMode = true;
      mergeParcelsList = [];
      mergePreviewLayers.forEach(l => map.removeLayer(l));
      mergePreviewLayers = [];

      const firstParcelArea = (activePinData && activePinData.luas_terdaftar_m2 > 0)
        ? roundArea2(activePinData.luas_terdaftar_m2)
        : ((activePinData && activePinData.luas_m2 > 0) ? roundArea2(activePinData.luas_m2) : roundArea2(calculatePolygonArea(activeVertices)));

      const firstParcelTitle = getCleanParcelTitle(activePinData, 1);
      mergeParcelsList.push({
        coords: activeVertices.map(v => ({ lat: Number(v.lat.toFixed(7)), lng: Number(v.lng.toFixed(7)) })),
        fid: firstParcelTitle,
        _internalFid: activePinData?.fid || null,
        nib: activePinData?.nib || firstParcelTitle,
        nomor_hak: activePinData?.nomor_hak || activePinData?.nomor_hak_raw || '-',
        tipe_hak: activePinData?.tipe_hak || 'Hak Milik',
        luas: firstParcelArea,
        luas_m2: firstParcelArea,
        luas_terdaftar_m2: firstParcelArea
      });

      const banner = document.getElementById('mergeModeBanner');
      if (banner) {
        banner.style.display = 'flex';
        document.getElementById('mergeCountBadge').innerText = '1';
        const txt = document.getElementById('mergeBannerText');
        if (txt) {
          txt.innerHTML = `<span class="dot-indicator" style="background-color: var(--amber);"></span> <strong>Mode Tambah Bidang (Gabung) Aktif</strong>: ${firstParcelTitle} (${formatAreaM2(firstParcelArea)}) terpilih. Klik bidang atau tahan klik &amp; geser kursor di atas bidang tetangga untuk auto +1 tambah bidang.`;
        }
      }
      const btn = document.getElementById('btnToggleMerge');
      if (btn) {
        btn.classList.add('active');
        const txt = document.getElementById('txtToggleMerge');
        if (txt) txt.innerText = 'Batal Gabung';
      }
    }

    function cancelMergeMode() {
      isMergeMode = false;
      const banner = document.getElementById('mergeModeBanner');
      if (banner) banner.style.display = 'none';
      mergePreviewLayers.forEach(l => map.removeLayer(l));
      mergePreviewLayers = [];
      mergeParcelsList = [];
      const btn = document.getElementById('btnToggleMerge');
      if (btn) {
        btn.classList.remove('active');
        const txt = document.getElementById('txtToggleMerge');
        if (txt) txt.innerText = 'Gabung Bidang';
      }
    }

    function snapAndAlignAdjacentParcel(newCoords, existingParcelsCoords, snapThresholdMeters = 3.5) {
      if (!newCoords || newCoords.length < 3 || !existingParcelsCoords || existingParcelsCoords.length === 0) {
        return newCoords;
      }
      function toPt(p) {
        if (!p) return { lat: 0, lng: 0 };
        if (Array.isArray(p)) {
          if (Math.abs(p[0]) > 90 || (Math.abs(p[1]) <= 90 && Math.abs(p[0]) > Math.abs(p[1]))) {
            return { lat: Number(p[1]), lng: Number(p[0]) };
          }
          return { lat: Number(p[0]), lng: Number(p[1]) };
        }
        return { lat: Number(p.lat), lng: Number(p.lng) };
      }
      function distM(p1, p2) {
        const pt1 = toPt(p1);
        const pt2 = toPt(p2);
        const dlat = (pt1.lat - pt2.lat) * 111320;
        const midLat = (pt1.lat + pt2.lat) * 0.5;
        const dlng = (pt1.lng - pt2.lng) * (111320 * Math.cos(midLat * Math.PI / 180));
        return Math.hypot(dlat, dlng);
      }
      function distToSegmentM(p, a, b) {
        const pt = toPt(p);
        const pta = toPt(a);
        const ptb = toPt(b);
        const midLat = pta.lat;
        const cosLat = Math.cos(midLat * Math.PI / 180);
        const bx = (ptb.lng - pta.lng) * 111320 * cosLat;
        const by = (ptb.lat - pta.lat) * 111320;
        const px = (pt.lng - pta.lng) * 111320 * cosLat;
        const py = (pt.lat - pta.lat) * 111320;
        const l2 = bx * bx + by * by;
        if (l2 === 0) return { dist: Math.hypot(px, py), pt: pta, t: 0 };
        const t = Math.max(0, Math.min(1, (px * bx + py * by) / l2));
        const projX = t * bx;
        const projY = t * by;
        const projLat = pta.lat + projY / 111320;
        const projLng = pta.lng + projX / (111320 * cosLat);
        return {
          dist: Math.hypot(px - projX, py - projY),
          pt: { lat: projLat, lng: projLng },
          t: t
        };
      }

      let snapped = newCoords.map(p => {
        const pt = toPt(p);
        return { lat: pt.lat, lng: pt.lng };
      });

      for (let eIdx = 0; eIdx < existingParcelsCoords.length; eIdx++) {
        const rawExist = existingParcelsCoords[eIdx];
        if (!rawExist || rawExist.length < 3) continue;
        let exist = rawExist.map(toPt);

        for (let i = 0; i < snapped.length; i++) {
          for (let j = 0; j < exist.length; j++) {
            if (distM(snapped[i], exist[j]) <= snapThresholdMeters) {
              snapped[i] = { lat: exist[j].lat, lng: exist[j].lng };
            }
          }
        }

        for (let j = 0; j < exist.length; j++) {
          const v = exist[j];
          let k = 0;
          while (k < snapped.length) {
            const b1 = snapped[k];
            const b2 = snapped[(k + 1) % snapped.length];
            if (distM(v, b1) > 0.1 && distM(v, b2) > 0.1) {
              const res = distToSegmentM(v, b1, b2);
              if (res.dist <= snapThresholdMeters && res.t > 0.01 && res.t < 0.99) {
                snapped.splice(k + 1, 0, { lat: v.lat, lng: v.lng });
                k++;
              }
            }
            k++;
          }
        }

        let existModified = false;
        for (let i = 0; i < snapped.length; i++) {
          const v = snapped[i];
          let k = 0;
          while (k < exist.length) {
            const a1 = exist[k];
            const a2 = exist[(k + 1) % exist.length];
            if (distM(v, a1) > 0.1 && distM(v, a2) > 0.1) {
              const res = distToSegmentM(v, a1, a2);
              if (res.dist <= snapThresholdMeters && res.t > 0.01 && res.t < 0.99) {
                exist.splice(k + 1, 0, { lat: v.lat, lng: v.lng });
                existModified = true;
                k++;
              }
            }
            k++;
          }
        }

        if (existModified && typeof mergeParcelsList !== 'undefined' && mergeParcelsList[eIdx]) {
          mergeParcelsList[eIdx].coords = exist.slice();
          if (eIdx === 0 && activeVertices) {
            activeVertices = exist.slice();
            renderCanvasPolygon(true);
          } else if (typeof mergePreviewLayers !== 'undefined' && mergePreviewLayers[eIdx - 1]) {
            mergePreviewLayers[eIdx - 1].setLatLngs(exist.map(p => [p.lat, p.lng]));
          }
        }
      }

      snapped = snapped.filter((p, idx) => {
        if (idx === 0) return true;
        const prev = snapped[idx - 1];
        return Math.hypot((p.lat - prev.lat) * 111320, (p.lng - prev.lng) * 111320) >= 0.05;
      });

      return snapped;
    }

    function snapSharedBoundaryVertices(newCoords, existingPolys, snapThresholdMeters = 3.5) {
      return snapAndAlignAdjacentParcel(newCoords, existingPolys, snapThresholdMeters);
    }
    window.snapAndAlignAdjacentParcel = snapAndAlignAdjacentParcel;
    window.snapSharedBoundaryVertices = snapSharedBoundaryVertices;

    function getCleanParcelTitle(data, index) {
      if (!data) return `Bidang ${index}`;
      const nib = data.nib;
      if (nib && nib !== '-' && !String(nib).startsWith('U2Fsd') && !String(nib).startsWith('PERSIL-')) {
        return `NIB ${nib}`;
      }
      const noHak = data.nomor_hak || data.nomor_hak_raw;
      if (noHak && noHak !== '-' && !String(noHak).startsWith('U2Fsd')) {
        return `${data.tipe_hak || 'Hak'} No. ${noHak}`;
      }
      const fid = data.fid;
      if (fid && fid !== '-' && !String(fid).startsWith('U2Fsd') && !String(fid).includes('fid-')) {
        return fid;
      }
      return `Bidang ${index}`;
    }
    window.getCleanParcelTitle = getCleanParcelTitle;

    async function handleMergeParcelClick(lat, lng, directParcel = null) {
      const statusBanner = document.getElementById('mergeBannerText');
      if (statusBanner) {
        statusBanner.innerHTML = '<span class="dot-indicator" style="background-color: var(--amber);"></span> Sedang membaca data batas bidang tanah di titik klik...';
      }
      try {
        let persilData = directParcel || null;

        if (!persilData && typeof findCachedVectorParcelAt === 'function') {
          persilData = findCachedVectorParcelAt(lat, lng);
        }

        if (!persilData && typeof cadastreVectorLayer !== 'undefined' && cadastreVectorLayer) {
          cadastreVectorLayer.eachLayer(layer => {
            if (!persilData && layer._parcelData) {
              const p = layer._parcelData;
              const coords = p.polygon_coords || p.coordinates;
              if (coords && coords.length >= 3) {
                if (isPointInsideOrNearPolygon(lat, lng, coords, 3.5)) {
                  persilData = p;
                }
              }
            }
          });
        }

        if (!persilData && drawnItems) {
          drawnItems.eachLayer(layer => {
            if (!persilData && layer.getLatLngs) {
              const lls = layer.getLatLngs();
              const ring = Array.isArray(lls[0]) ? lls[0] : lls;
              if (ring && ring.length >= 3) {
                const pts = ring.map(p => ({ lat: Number(p.lat.toFixed(7)), lng: Number(p.lng.toFixed(7)) }));
                if (isPointInsideOrNearPolygon(lat, lng, pts, 0.8)) {
                  const a = roundArea2(calculatePolygonArea(pts));
                  persilData = {
                    found: true,
                    fid: `Bidang Gambar ${mergeParcelsList.length + 1}`,
                    polygon_coords: pts,
                    luas_m2: a
                  };
                }
              }
            }
          });
        }

        if (!persilData) {
          persilData = await fetchPersilCadastreData(lat, lng, map.getZoom() || 19);
        }

        const parcelCoords = persilData ? (persilData.polygon_coords || persilData.coordinates) : null;
        if (!persilData || (persilData.found === false) || !parcelCoords || parcelCoords.length < 3) {
          if (statusBanner) {
            statusBanner.innerHTML = '<span class="dot-indicator" style="background-color: var(--crimson);"></span> Bidang tanah tidak terdeteksi pada titik klik. Pastikan klik berada tepat di dalam bidang tanah kadastral terdaftar.';
          }
          showToast('Titik klik berada di luar bidang tanah terdaftar. Silakan klik tepat di dalam bidang yang ingin digabungkan.', 'warn');
          return;
        }

        if (activeVertices && activeVertices.length >= 3 && isPointInsideOrNearPolygon(lat, lng, activeVertices, 0.6)) {
          showToast('Bidang utama ini sudah terpilih (Bidang 1). Silakan klik bidang tanah tetangga yang ingin digabung.', 'info');
          return;
        }

        const alreadyIdx = mergeParcelsList.findIndex(p => isPointInsideOrNearPolygon(lat, lng, p.coords, 0.6));
        if (alreadyIdx !== -1) {
          showToast(`Bidang tanah ini sudah ada dalam daftar gabung (${mergeParcelsList[alreadyIdx].fid || 'Bidang ' + (alreadyIdx + 1)}).`, 'info');
          return;
        }

        const isDuplicate = mergeParcelsList.some((p) => {
          if (persilData.nib && persilData.nib !== '-' && p.nib && p.nib === persilData.nib) return true;
          if (persilData.fid && persilData.fid !== '-' && p._internalFid && p._internalFid === persilData.fid) return true;
          return false;
        });
        if (isDuplicate) {
          showToast('Bidang tanah ini sudah terpilih sebelumnya.', 'info');
          return;
        }

        let rawCoords = parcelCoords.map(p => {
          if (Array.isArray(p)) return { lat: Number(p[1]), lng: Number(p[0]) };
          return { lat: Number(p.lat), lng: Number(p.lng) };
        });
        rawCoords = rawCoords.filter((p, idx) => {
          if (idx === 0) return true;
          const prev = rawCoords[idx - 1];
          return Math.hypot((p.lat - prev.lat) * 111320, (p.lng - prev.lng) * 111320) >= 0.05;
        });

        const existingPolys = mergeParcelsList.map(p => p.coords);
        const snappedCoords = snapSharedBoundaryVertices(rawCoords, existingPolys, 3.5);

        const newParcelLuas = (persilData.luas_m2 && persilData.luas_m2 > 0)
          ? roundArea2(persilData.luas_m2)
          : roundArea2(calculatePolygonArea(snappedCoords));
        const newParcelLabel = getCleanParcelTitle(persilData, mergeParcelsList.length + 1);

        mergeParcelsList.push({
          coords: snappedCoords,
          fid: newParcelLabel,
          _internalFid: persilData.fid || null,
          nib: persilData.nib || newParcelLabel,
          nomor_hak: persilData.nomor_hak || persilData.nomor_hak_raw || '-',
          tipe_hak: persilData.tipe_hak || 'Hak Milik',
          luas: newParcelLuas,
          luas_m2: newParcelLuas,
          luas_terdaftar_m2: newParcelLuas
        });

        const latlngs = snappedCoords.map(p => [p.lat, p.lng]);
        const previewLayer = L.polygon(latlngs, {
          color: '#082449',
          weight: 2.5,
          dashArray: '5, 5',
          fillColor: '#0a2e5c',
          fillOpacity: 0.22
        }).addTo(map);
        previewLayer.bindPopup(`
          <div style="font-size:0.78rem; font-family:'Plus Jakarta Sans',sans-serif;">
            <strong style="color:var(--text-main);">${newParcelLabel}</strong><br>
            <strong>Luas:</strong> ${formatAreaM2(newParcelLuas)}
          </div>
        `);
        mergePreviewLayers.push(previewLayer);

        const countBadge = document.getElementById('mergeCountBadge');
        if (countBadge) countBadge.innerText = mergeParcelsList.length;

        const currentTotalEst = roundArea2(mergeParcelsList.reduce((acc, p) => acc + (p.luas || 0), 0));
        if (statusBanner) {
          statusBanner.innerHTML = `<span class="dot-indicator" style="background-color: var(--emerald);"></span> Terpilih: ${newParcelLabel} (${formatAreaM2(newParcelLuas)}). Total ${mergeParcelsList.length} bidang (Estimasi Total: ${formatAreaM2(currentTotalEst)}). Siap digabung.`;
        }
        showToast(`Bidang ke-${mergeParcelsList.length} (${newParcelLabel} : ${formatAreaM2(newParcelLuas)}) ditambahkan. Klik 'Selesai Gabung' untuk memproses.`, 'success');
      } catch (err) {
        if (statusBanner) {
          statusBanner.innerHTML = `<span class="dot-indicator" style="background-color: var(--crimson);"></span> Gagal memuat bidang: ${err.message}`;
        }
      }
    }

    function clientSideMergeParcels(polygonsList) {
      if (!polygonsList || polygonsList.length === 0) {
        return { success: false, error: 'Tidak ada poligon untuk digabungkan.' };
      }

      function distM(p1, p2) {
        const dlat = (p1.lat - p2.lat) * 111320;
        const midLat = (p1.lat + p2.lat) * 0.5;
        const dlng = (p1.lng - p2.lng) * (111320 * Math.cos(midLat * Math.PI / 180));
        return Math.hypot(dlat, dlng);
      }

      function distToSegmentM(p, a, b) {
        const dlat = (b.lat - a.lat) * 111320;
        const midLat = (a.lat + b.lat) * 0.5;
        const dlng = (b.lng - a.lng) * (111320 * Math.cos(midLat * Math.PI / 180));
        const segLen2 = dlat * dlat + dlng * dlng;
        if (segLen2 === 0) return { dist: distM(p, a), pt: a, t: 0 };
        const pLat = (p.lat - a.lat) * 111320;
        const pLng = (p.lng - a.lng) * (111320 * Math.cos(midLat * Math.PI / 180));
        const t = Math.max(0, Math.min(1, (pLat * dlat + pLng * dlng) / segLen2));
        const projLat = a.lat + (t * (b.lat - a.lat));
        const projLng = a.lng + (t * (b.lng - a.lng));
        return { dist: distM(p, { lat: projLat, lng: projLng }), pt: { lat: projLat, lng: projLng }, t: t };
      }

      function signedArea(pts) {
        let s = 0;
        const n = pts.length;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          s += pts[i].lng * pts[j].lat - pts[j].lng * pts[i].lat;
        }
        return s;
      }

      function ensureCcw(pts) {
        if (signedArea(pts) < 0) {
          return pts.slice().reverse();
        }
        return pts;
      }

      let normPolys = polygonsList.map(poly => {
        return poly.map(p => {
          if (Array.isArray(p)) return { lat: Number(p[1]), lng: Number(p[0]) };
          return { lat: Number(p.lat), lng: Number(p.lng) };
        });
      }).filter(p => p.length >= 3);

      if (normPolys.length === 0) {
        return { success: false, error: 'Format koordinat poligon tidak valid.' };
      }
      if (normPolys.length === 1) {
        const single = normPolys[0];
        const a = calculatePolygonArea(single);
        return {
          success: true,
          is_multipart: false,
          polygon_coords: single,
          all_parts_coords: [single],
          area_m2: a,
          total_parcels_merged: 1,
          total_vertices: single.length
        };
      }

      const snapThreshold = 3.5;
      normPolys = normPolys.map(p => ensureCcw(p));

      for (let i = 0; i < normPolys.length; i++) {
        for (let j = 0; j < normPolys.length; j++) {
          if (i === j) continue;
          for (let vi = 0; vi < normPolys[i].length; vi++) {
            for (let vj = 0; vj < normPolys[j].length; vj++) {
              if (distM(normPolys[i][vi], normPolys[j][vj]) <= snapThreshold) {
                normPolys[j][vj] = { lat: normPolys[i][vi].lat, lng: normPolys[i][vi].lng };
              }
            }
          }
        }
      }

      for (let i = 0; i < normPolys.length; i++) {
        for (let j = 0; j < normPolys.length; j++) {
          if (i === j) continue;
          for (let vIdx = 0; vIdx < normPolys[i].length; vIdx++) {
            const v = normPolys[i][vIdx];
            let k = 0;
            while (k < normPolys[j].length) {
              const a = normPolys[j][k];
              const b = normPolys[j][(k + 1) % normPolys[j].length];
              if (distM(v, a) > 0.1 && distM(v, b) > 0.1) {
                const res = distToSegmentM(v, a, b);
                if (res.dist <= snapThreshold && res.t > 0.01 && res.t < 0.99) {
                  normPolys[j].splice(k + 1, 0, { lat: v.lat, lng: v.lng });
                  k++;
                }
              }
              k++;
            }
          }
        }
      }

      normPolys = normPolys.map(poly => poly.filter((p, idx) => {
        if (idx === 0) return true;
        const prev = poly[idx - 1];
        return Math.hypot((p.lat - prev.lat) * 111320, (p.lng - prev.lng) * 111320) >= 0.05;
      }));

      const edges = [];
      normPolys.forEach((poly, pIdx) => {
        const n = poly.length;
        for (let i = 0; i < n; i++) {
          edges.push({
            from: poly[i],
            to: poly[(i + 1) % n],
            pIdx: pIdx,
            shared: false,
            used: false
          });
        }
      });

      for (let i = 0; i < edges.length; i++) {
        if (edges[i].shared) continue;
        for (let j = i + 1; j < edges.length; j++) {
          if (edges[j].shared || edges[i].pIdx === edges[j].pIdx) continue;
          const d1 = distM(edges[i].from, edges[j].to);
          const d2 = distM(edges[i].to, edges[j].from);
          if (d1 <= 0.35 && d2 <= 0.35) {
            edges[i].shared = true;
            edges[j].shared = true;
            break;
          }
          const d1s = distM(edges[i].from, edges[j].from);
          const d2s = distM(edges[i].to, edges[j].to);
          if (d1s <= 0.35 && d2s <= 0.35) {
            edges[i].shared = true;
            edges[j].shared = true;
            break;
          }
        }
      }

      const boundaryEdges = edges.filter(e => !e.shared);

      if (boundaryEdges.length < 3) {
        let sumArea = 0;
        normPolys.forEach(p => { sumArea += calculatePolygonArea(p); });
        return {
          success: true,
          is_multipart: true,
          all_parts_coords: normPolys,
          polygon_coords: normPolys[0],
          area_m2: sumArea,
          total_parcels_merged: normPolys.length,
          total_vertices: normPolys.reduce((acc, p) => acc + p.length, 0)
        };
      }

      const loops = [];
      while (boundaryEdges.some(e => !e.used)) {
        const startEdge = boundaryEdges.find(e => !e.used);
        startEdge.used = true;
        const loop = [startEdge.from];
        let currTo = startEdge.to;

        let iterations = 0;
        const maxIter = boundaryEdges.length * 4;
        while (iterations < maxIter) {
          iterations++;
          let nextEdge = null;
          let minD = 999999;
          for (let k = 0; k < boundaryEdges.length; k++) {
            const be = boundaryEdges[k];
            if (!be.used) {
              const d = distM(currTo, be.from);
              if (d <= snapThreshold && d < minD) {
                minD = d;
                nextEdge = be;
              }
            }
          }
          if (nextEdge) {
            nextEdge.used = true;
            loop.push(currTo);
            currTo = nextEdge.to;
            if (distM(currTo, loop[0]) <= snapThreshold) {
              break;
            }
          } else {
            break;
          }
        }
        if (loop.length >= 3) {
          const cleanLoop = loop.filter((p, idx) => {
            if (idx === 0) return true;
            const prev = loop[idx - 1];
            return Math.hypot((p.lat - prev.lat) * 111320, (p.lng - prev.lng) * 111320) >= 0.05;
          });
          const loopArea = calculatePolygonArea(cleanLoop);
          if (loopArea >= 5.0) {
            loops.push(cleanLoop);
          }
        }
      }

      if (loops.length === 0) {
        let sumArea = 0;
        normPolys.forEach(p => { sumArea += calculatePolygonArea(p); });
        return {
          success: true,
          is_multipart: false,
          all_parts_coords: [normPolys[0]],
          polygon_coords: normPolys[0],
          area_m2: sumArea,
          total_parcels_merged: normPolys.length,
          total_vertices: normPolys.reduce((acc, p) => acc + p.length, 0)
        };
      }

      let maxLoopArea = 0;
      loops.forEach(lp => {
        const a = calculatePolygonArea(lp);
        if (a > maxLoopArea) maxLoopArea = a;
      });
      const significantLoops = loops.filter(lp => {
        const a = calculatePolygonArea(lp);
        return a >= Math.max(10.0, maxLoopArea * 0.05);
      });
      const finalLoops = significantLoops.length > 0 ? significantLoops : [loops[0]];

      let totalArea = 0;
      finalLoops.forEach(lp => { totalArea += calculatePolygonArea(lp); });
      const isMultipart = finalLoops.length > 1;

      return {
        success: true,
        is_multipart: isMultipart,
        all_parts_coords: finalLoops,
        polygon_coords: finalLoops[0],
        area_m2: totalArea,
        total_parcels_merged: normPolys.length,
        total_vertices: finalLoops.reduce((acc, l) => acc + l.length, 0)
      };
    }

    async function finishMergeParcels() {
      if (!mergeParcelsList || mergeParcelsList.length < 2) {
        showToast('Minimal harus ada 2 bidang tanah untuk digabungkan.', 'warn');
        return;
      }
      const statusBanner = document.getElementById('mergeBannerText');
      if (statusBanner) {
        statusBanner.innerHTML = '<span class="dot-indicator" style="background-color: var(--amber);"></span> Menggabungkan geometri bidang tanah terpilih...';
      }

      const targetTotalArea = roundArea2(mergeParcelsList.reduce((acc, p) => acc + (p.luas || 0), 0));

      const result = clientSideMergeParcels(mergeParcelsList.map(p => p.coords));

      if (!result || !result.success || (!result.merged_polygon && !result.polygon_coords && !result.all_parts_coords)) {
        showToast('Gagal menggabungkan bidang: ' + (result?.error || 'Geometri tidak bersinggungan.'), 'error');
        if (statusBanner) {
          statusBanner.innerHTML = '<span class="dot-indicator" style="background-color: var(--crimson);"></span> Gagal menggabungkan bidang tanah.';
        }
        return;
      }

      if (result.is_multipart && result.all_parts_coords && result.all_parts_coords.length > 1) {
        activeMultiParts = result.all_parts_coords.map(part =>
          part.map(p => (Array.isArray(p) ? { lat: Number(p[1]), lng: Number(p[0]) } : { lat: Number(p.lat), lng: Number(p.lng) }))
        );
        activeVertices = activeMultiParts[0];
      } else {
        activeMultiParts = null;
        let mergedPts = [];
        if (result.polygon_coords && result.polygon_coords.length >= 3) {
          mergedPts = result.polygon_coords.map(p => (Array.isArray(p) ? { lat: Number(p[1]), lng: Number(p[0]) } : { lat: Number(p.lat), lng: Number(p.lng) }));
        } else if (result.merged_polygon && result.merged_polygon.length > 0) {
          const mergedRing = result.merged_polygon[0];
          mergedPts = mergedRing.map(p => ({ lat: Number(p[1]), lng: Number(p[0]) }));
        }
        activeVertices = mergedPts;
      }

      const mergedGeomArea = activeMultiParts && activeMultiParts.length > 1
        ? roundArea2(activeMultiParts.reduce((sum, part) => sum + calculatePolygonArea(part), 0))
        : roundArea2(calculatePolygonArea(activeVertices));

      window.currentCadastreParcelsPool = mergeParcelsList.slice();
      if (activePinData) {
        activePinData.fid = 'Gabungan ' + mergeParcelsList.length + ' Bidang';
        activePinData.luas_m2 = mergedGeomArea;
        activePinData.luas_terdaftar_m2 = targetTotalArea;
        activePinData.luas_ha = roundAreaHa6(mergedGeomArea);
        activePinData.merged_parcels = mergeParcelsList.slice();
        activePinData.nomor_hak = mergeParcelsList.map(p => p.nomor_hak).filter(n => n && n !== '-').join(', ') || 'Gabungan';
        activePinData.nib = mergeParcelsList.map(p => p.nib).filter(n => n && n !== '-' && !String(n).startsWith('U2Fsd')).join(' + ') || ('Gabungan ' + mergeParcelsList.length + ' Bidang');
        const _elNib = document.getElementById('pinNibText');
        if (_elNib) _elNib.innerText = 'Gabungan ' + mergeParcelsList.length + ' Bidang';
        const _elLok = document.getElementById('pinLokasiUtamaText');
        if (_elLok) _elLok.innerText = (activePinData.desa !== '-' && activePinData.kecamatan !== '-') ? `${activePinData.desa}, ${activePinData.kecamatan}` : (activePinData.desa !== '-' ? activePinData.desa : 'Bidang Tanah');
        const _elLuas = document.getElementById('pinLuasBpnText');
        if (_elLuas) _elLuas.innerText = formatAreaM2(mergedGeomArea);
        const _elNomorHak = document.getElementById('pinNomorHakText');
        if (_elNomorHak) _elNomorHak.innerText = activePinData.nomor_hak;
        const _elStatus = document.getElementById('pinStatusValidasiText');
        if (_elStatus) _elStatus.innerText = 'Gabungan Kadaster Presisi';
      }

      const hud = document.getElementById('canvasHud');
      if (hud) {
        hud.style.display = 'flex';
        const elHudNib = document.getElementById('hudNib');
        if (elHudNib) elHudNib.innerText = activePinData?.fid || 'Gabungan Bidang';
        const elHudArea = document.getElementById('hudBpnArea');
        if (elHudArea) elHudArea.innerText = formatAreaM2(mergedGeomArea);
      }

      const elShpLuas = document.getElementById('shpLuasHa') || document.getElementById('shpLuas');
      if (elShpLuas) {
        elShpLuas.value = `${(mergedGeomArea / 10000.0).toFixed(6)} Ha`;
      }

      const totalMergedCount = mergeParcelsList.length;
      isParcelLocked = true;
      isGeometryManuallyEdited = false;
      renderCanvasPolygon(true);
      cancelMergeMode();
      switchTab('tab-bidang');
      showToast(`Penggabungan berhasil: ${totalMergedCount} bidang digabung menjadi 1 poligon utuh (Luas: ${formatAreaM2(mergedGeomArea)}, ${activeVertices.length} patok batas).`, 'success');
    }

    let isMapPointerDown = false;
    let mergeHoldThrottle = null;
    let lastMergeSelectedCoord = null;

    function initToolbarHoldRepeat() {
      function bindHold(btn, action) {
        if (!btn || btn._holdBound) return;
        btn._holdBound = true;
        let holdTimer = null;
        let repeatTimer = null;
        let isHolding = false;

        const onHoldStart = (e) => {
          if (e.button !== undefined && e.button !== 0) return;
          isHolding = true;
          clearTimeout(holdTimer);
          clearInterval(repeatTimer);
          holdTimer = setTimeout(() => {
            if (!isHolding) return;
            repeatTimer = setInterval(() => {
              if (!isHolding) {
                clearInterval(repeatTimer);
                return;
              }
              action(true);
            }, 130);
          }, 320);
        };

        const onHoldEnd = () => {
          isHolding = false;
          clearTimeout(holdTimer);
          clearInterval(repeatTimer);
        };

        btn.addEventListener('mousedown', onHoldStart);
        btn.addEventListener('mouseup', onHoldEnd);
        btn.addEventListener('mouseleave', onHoldEnd);
        btn.addEventListener('touchstart', onHoldStart, { passive: true });
        btn.addEventListener('touchend', onHoldEnd);
        btn.addEventListener('touchcancel', onHoldEnd);
      }

      const btnAdd = document.getElementById('btnAddPatokToolbar') || document.querySelector('button[onclick="addVertexToActivePolygon()"]');
      const btnRemove = document.getElementById('btnRemovePatokToolbar') || document.querySelector('button[onclick="removeLastVertexFromActive()"]');
      if (btnAdd) bindHold(btnAdd, () => addVertexToActivePolygon(true));
      if (btnRemove) bindHold(btnRemove, () => removeLastVertexFromActive(true));
    }

    function setupMapHoldAutoAdd() {
      if (!map || map._holdAutoAddBound) return;
      map._holdAutoAddBound = true;

      const container = map.getContainer();
      if (!container) return;

      container.addEventListener('pointerdown', function(e) {
        if (e.button !== undefined && e.button !== 0) return;
        isMapPointerDown = true;
        window.isMapPointerDown = true;
      });

      window.addEventListener('pointerup', function() {
        isMapPointerDown = false;
        window.isMapPointerDown = false;
        clearTimeout(mergeHoldThrottle);
        mergeHoldThrottle = null;
        lastMergeSelectedCoord = null;
      });

      container.addEventListener('pointercancel', function() {
        isMapPointerDown = false;
        window.isMapPointerDown = false;
        clearTimeout(mergeHoldThrottle);
        mergeHoldThrottle = null;
        lastMergeSelectedCoord = null;
      });

      map.on('mousemove', function(e) {
        if (!isMapPointerDown) return;
        if (typeof isMergeMode !== 'undefined' && isMergeMode) {
          if (mergeHoldThrottle) return;
          mergeHoldThrottle = setTimeout(() => {
            mergeHoldThrottle = null;
            if (!isMapPointerDown || typeof isMergeMode === 'undefined' || !isMergeMode) return;
            const curLatLng = e.latlng;
            if (lastMergeSelectedCoord) {
              const d = map.distance(curLatLng, lastMergeSelectedCoord);
              if (d < 4.5) return;
            }
            lastMergeSelectedCoord = curLatLng;
            if (typeof handleMergeParcelClick === 'function') {
              handleMergeParcelClick(curLatLng.lat, curLatLng.lng);
            }
          }, 240);
        } else if (typeof isDrawingPolygon !== 'undefined' && isDrawingPolygon) {
          if (!customDrawPoints || customDrawPoints.length === 0) return;
          const lastPt = customDrawPoints[customDrawPoints.length - 1];
          const dist = map.distance(lastPt, e.latlng);
          if (dist >= 5.5) {
            customDrawPoints.push(e.latlng);
            renderCustomDrawPoly();
            updateDrawCountBadge();
          }
        }
      });

      initToolbarHoldRepeat();
    }

    function setupDrawing() {
      drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      setupMapHoldAutoAdd();
    }

    function handleSnappingMouseMove(e) {
      if (!map) return;
      const mousePt = map.latLngToContainerPoint(e.latlng);
      let bestDist = 18;
      let bestTarget = null;

      const candidates = [];
      if (activeVertices && activeVertices.length > 0) {
        activeVertices.forEach(v => candidates.push(L.latLng(v.lat, v.lng)));
      }
      if (customDrawPoints && customDrawPoints.length > 0) {
        customDrawPoints.forEach(p => candidates.push(p));
      }
      if (drawnItems) {
        drawnItems.eachLayer(layer => {
          if (layer.getLatLngs) {
            const lls = layer.getLatLngs();
            const ring = Array.isArray(lls[0]) ? lls[0] : lls;
            ring.forEach(pt => candidates.push(pt));
          }
        });
      }

      for (let cand of candidates) {
        const candPt = map.latLngToContainerPoint(cand);
        const d = mousePt.distanceTo(candPt);
        if (d < bestDist) {
          bestDist = d;
          bestTarget = cand;
        }
      }

      if (bestTarget) {
        currentSnapPoint = bestTarget;
        if (!snapMarker) {
          const snapIcon = L.divIcon({
            className: 'snap-indicator',
            html: '<div class="snap-indicator-icon"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          });
          snapMarker = L.marker(bestTarget, { icon: snapIcon, zIndexOffset: 2000 }).addTo(map);
        } else {
          snapMarker.setLatLng(bestTarget);
        }
      } else {
        currentSnapPoint = null;
        if (snapMarker) {
          map.removeLayer(snapMarker);
          snapMarker = null;
        }
      }
    }

    function startDrawPolygon() {
      startCustomPolygonDraw();
    }

    function startCustomPolygonDraw() {
      cancelCustomPolygonDraw();
      isDrawingPolygon = true;
      customDrawPoints = [];
      customDrawUndoStack = [];
      const tb = document.getElementById('smartDrawToolbar');
      if (tb) tb.classList.add('active');
      updateDrawCountBadge();
      showToast('Mode gambar poligon aktif. Klik pada peta untuk membuat patok batas.', 'info');
    }

    function handleDrawClick(e) {
      const latlng = (snapEnabled && currentSnapPoint) ? currentSnapPoint : e.latlng;
      if (customDrawPoints.length >= 3) {
        const firstPt = customDrawPoints[0];
        const pFirst = map.latLngToContainerPoint(firstPt);
        const pCurrent = map.latLngToContainerPoint(latlng);
        if (pFirst.distanceTo(pCurrent) < 22) {
          finishCustomPolygonDraw();
          return;
        }
      }
      customDrawPoints.push(latlng);
      customDrawUndoStack = [];
      renderCustomDrawPoly();
      updateDrawCountBadge();
    }

    function renderCustomDrawPoly() {
      if (customDrawLayer) {
        map.removeLayer(customDrawLayer);
        customDrawLayer = null;
      }
      customDrawMarkers.forEach(m => map.removeLayer(m));
      customDrawMarkers = [];

      if (customDrawPoints.length === 0) return;

      if (customDrawPoints.length >= 2) {
        customDrawLayer = L.polygon(customDrawPoints, {
          color: '#0a2e5c',
          weight: 2.5,
          fillColor: '#0a2e5c',
          fillOpacity: 0.18
        }).addTo(map);
      }

      customDrawPoints.forEach((pt, idx) => {
        const marker = L.circleMarker(pt, {
          radius: 5,
          color: '#0a2e5c',
          fillColor: '#ffffff',
          fillOpacity: 1,
          weight: 2
        }).addTo(map);
        customDrawMarkers.push(marker);
      });
    }

    function undoDrawPoint() {
      if (customDrawPoints.length > 0) {
        customDrawUndoStack.push(customDrawPoints.pop());
        renderCustomDrawPoly();
        updateDrawCountBadge();
      }
    }

    function redoDrawPoint() {
      if (customDrawUndoStack.length > 0) {
        customDrawPoints.push(customDrawUndoStack.pop());
        renderCustomDrawPoly();
        updateDrawCountBadge();
      }
    }

    function zoomToDrawBounds() {
      if (customDrawPoints.length > 0) {
        const bounds = L.latLngBounds(customDrawPoints);
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }

    function centerDrawLastPoint() {
      if (customDrawPoints.length > 0) {
        map.panTo(customDrawPoints[customDrawPoints.length - 1]);
      }
    }

    function finishCustomPolygonDraw() {
      if (customDrawPoints.length < 3) {
        showToast('Poligon membutuhkan minimal 3 titik patok batas.', 'warn');
        return;
      }
      const finalPts = [...customDrawPoints];
      cancelCustomPolygonDraw();

      activeVertices = finalPts.map(p => ({ lat: p.lat, lng: p.lng }));
      activeMultiParts = null;
      if (!activePinData) {
        const areaM2 = roundArea2(calculatePolygonArea(activeVertices));
        activePinData = {
          fid: 'Digitasi Mandiri',
          tipe_hak: 'Hasil Pengukuran',
          luas_m2: areaM2,
          luas_ha: roundAreaHa6(areaM2),
          desa: '-',
          kecamatan: '-',
          kabkot: '-',
          provinsi: '-'
        };
      }
      isParcelLocked = true;
      isGeometryManuallyEdited = true;
      renderCanvasPolygon(true);

      switchTab('tab-bidang');
      showToast(`Poligon selesai: ${finalPts.length} patok batas terpasang presisi.`, 'success');
    }

    function cancelCustomPolygonDraw() {
      isDrawingPolygon = false;
      customDrawPoints = [];
      customDrawUndoStack = [];
      if (customDrawLayer) {
        map.removeLayer(customDrawLayer);
        customDrawLayer = null;
      }
      customDrawMarkers.forEach(m => map.removeLayer(m));
      customDrawMarkers = [];
      if (snapMarker) {
        map.removeLayer(snapMarker);
        snapMarker = null;
      }
      const tb = document.getElementById('smartDrawToolbar');
      if (tb) tb.classList.remove('active');
    }

    function toggleSnapMode() {
      snapEnabled = !snapEnabled;
      const btn = document.getElementById('btnSnapToggle');
      const txt = document.getElementById('snapText');
      if (btn) btn.classList.toggle('active', snapEnabled);
      if (txt) txt.innerText = snapEnabled ? 'Snap: Aktif' : 'Snap: Mati';
      showToast(snapEnabled ? 'Auto-snapping patok diaktifkan' : 'Auto-snapping patok dinonaktifkan', 'info');
    }

    function updateDrawCountBadge() {
      const el = document.getElementById('drawPointsCount');
      if (el) el.innerText = customDrawPoints.length;
    }
    function addVertexToActivePolygon(isAuto = false) {
      if (!activeVertices || activeVertices.length < 3) {
        if (!isAuto) showToast('Pilih bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }
      let maxDist = -1;
      let maxIdx = 0;
      for (let i = 0; i < activeVertices.length; i++) {
        const nextIdx = (i + 1) % activeVertices.length;
        const p1 = L.latLng(activeVertices[i].lat, activeVertices[i].lng);
        const p2 = L.latLng(activeVertices[nextIdx].lat, activeVertices[nextIdx].lng);
        const d = p1.distanceTo(p2);
        if (d > maxDist) {
          maxDist = d;
          maxIdx = i;
        }
      }
      const nextIdx = (maxIdx + 1) % activeVertices.length;
      const midLat = (activeVertices[maxIdx].lat + activeVertices[nextIdx].lat) / 2;
      const midLng = (activeVertices[maxIdx].lng + activeVertices[nextIdx].lng) / 2;
      activeVertices.splice(maxIdx + 1, 0, { lat: midLat, lng: midLng });
      renderCanvasPolygon(true);
      if (!isAuto || activeVertices.length % 5 === 0) {
        showToast(`Patok baru berhasil ditambahkan (Total: ${activeVertices.length} patok).`, 'success');
      }
    }

    function removeLastVertexFromActive(isAuto = false) {
      if (!activeVertices || activeVertices.length <= 3) {
        if (!isAuto) showToast('Poligon minimal membutuhkan 3 titik patok batas.', 'warn');
        return;
      }
      activeVertices.pop();
      renderCanvasPolygon(true);
      if (!isAuto || activeVertices.length % 5 === 0) {
        showToast(`Patok terakhir dihapus (sisa: ${activeVertices.length} patok)`, 'info');
      }
    }

    function clearDrawnLayers() {
      drawnItems.clearLayers();
      cancelCustomPolygonDraw();
      clearCanvasRebuilderLayers();
      if (typeof removeActivePin === 'function') {
        removeActivePin();
      } else {
        if (activePolygonLayer && map.hasLayer(activePolygonLayer)) {
          map.removeLayer(activePolygonLayer);
          activePolygonLayer = null;
        }
        if (activePinMarker && map.hasLayer(activePinMarker)) {
          map.removeLayer(activePinMarker);
          activePinMarker = null;
        }
        activeVertices = [];
        activeMultiParts = [];
        activePinData = null;
        renderVertexHandles();
      }
      resetMeasurementLabels();
      showToast('Gambar dan bidang berhasil diatur ulang.', 'info');
    }

    function resetMeasurementLabels() {
      const elM2 = document.getElementById('valLuasM2'); if (elM2) elM2.innerText = '0,00 m²';
      const elHa = document.getElementById('valLuasHa'); if (elHa) elHa.innerText = '0,000000 ha';
      const elKel = document.getElementById('valKeliling'); if (elKel) elKel.innerText = '0,00 m';
      const elTitik = document.getElementById('valTitik'); if (elTitik) elTitik.innerText = '0';
    }

    function updateMeasurements(layer) {
      if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
        const latlngs = layer.getLatLngs()[0];
        const areaM2 = calculatePolygonArea(latlngs);
        const perimeterM = calculatePolygonPerimeter(latlngs);

        const elValM2 = document.getElementById('valLuasM2'); if (elValM2) elValM2.innerText = formatAreaM2(areaM2);
        const elValHa = document.getElementById('valLuasHa'); if (elValHa) elValHa.innerText = formatAreaHa(areaM2);
        const elValKel = document.getElementById('valKeliling'); if (elValKel) elValKel.innerText = `${perimeterM.toFixed(2)} m`;
        const elValTitik = document.getElementById('valTitik'); if (elValTitik) elValTitik.innerText = latlngs.length;

        const elLiveM2 = document.getElementById('canvasLiveAreaM2');
        if (elLiveM2) elLiveM2.innerText = formatAreaM2(areaM2);
        const elLiveHa = document.getElementById('canvasLiveAreaHa');
        if (elLiveHa) elLiveHa.innerText = formatAreaHa(areaM2);

        let shpAttrSnippet = '';
        if (window.lastImportedShpData && window.lastImportedShpData.records && window.lastImportedShpData.records.length > 0) {
          const rec = window.lastImportedShpData.records[0];
          const keys = Object.keys(rec).slice(0, 4);
          const rows = keys.map(k => `<div><span style="color:#64748b;">${escapeHtml(k)}:</span> <strong>${rec[k] !== null && rec[k] !== undefined ? escapeHtml(String(rec[k])) : '-'}</strong></div>`).join('');
          shpAttrSnippet = `
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0;font-size:0.72rem;">
              <div style="font-weight:700;margin-bottom:3px;color:#0a2e5c;">Atribut Shapefile (${window.lastImportedShpData.fields.length} Kolom):</div>
              ${rows}
              <button type="button" class="btn btn-primary btn-sm" onclick="openShpAttributesModal()" style="margin-top:6px;width:100%;font-size:0.69rem;padding:3px 6px;">Buka Tabel Atribut</button>
            </div>
          `;
        }

        layer.bindPopup(`
          <div style="font-size:0.8rem; font-family:'Plus Jakarta Sans',sans-serif;">
            <strong style="color:#0a2e5c;">Hasil Pengukuran Bidang:</strong><br>
            <strong>Luas:</strong> ${formatAreaM2(areaM2)} (${formatAreaHa(areaM2)})<br>
            <strong>Keliling:</strong> ${perimeterM.toFixed(2)} m<br>
            <strong>Titik Batas:</strong> ${latlngs.length} koordinat
            ${shpAttrSnippet}
          </div>
        `).openPopup();
      }
    }

    window.focusVertexMarker = function(pIdx, vIdx) {
      if (map) map.closePopup();
      showToast('Tahan dan seret patok dengan kursor 4 mata angin untuk menggeser posisi batas.', 'info');
    };

    window.deleteVertexMarker = function(pIdx, vIdx) {
      if (typeof isVertexLocked === 'function' && isVertexLocked(pIdx, vIdx)) {
        if (typeof showToast === 'function') showToast('Patok terkunci! Lepaskan kunci patok terlebih dahulu sebelum menghapus.', 'warn');
        return;
      }
      if (map) map.closePopup();
      isGeometryManuallyEdited = true;
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      if (parts.length > 1) {
        const targetPart = parts[pIdx];
        if (!targetPart || targetPart.length <= 3) {
          parts.splice(pIdx, 1);
          if (parts.length === 1) {
            activeVertices = parts[0];
            activeMultiParts = null;
          } else {
            activeMultiParts = parts;
            activeVertices = parts[0];
          }
          renderCanvasPolygon(true);
          showToast('Sisa garis patok / bagian berhasil dibersihkan.', 'success');
          return;
        } else {
          targetPart.splice(vIdx, 1);
          renderCanvasPolygon(true);
          showToast('Titik patok berhasil dihapus.', 'success');
          return;
        }
      }
      if (activeVertices.length <= 3) {
        showToast('Poligon utama minimal membutuhkan 3 titik sudut patok.', 'warn');
        return;
      }
      removeVertexAt(vIdx);
      showToast('Titik patok berhasil dihapus.', 'success');
    };

    let _activeEditingPatok = null;

    window.openEditPatokModal = function(pIdx, vIdx) {
      if (typeof isVertexLocked === 'function' && isVertexLocked(pIdx, vIdx)) {
        if (typeof showToast === 'function') showToast('Patok terkunci! Lepaskan kunci patok terlebih dahulu untuk mengubah koordinat.', 'warn');
        return;
      }
      if (map) map.closePopup();
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      const targetPart = parts[pIdx] || activeVertices;
      const curr = targetPart ? targetPart[vIdx] : null;
      if (!curr) return;

      _activeEditingPatok = { pIdx, vIdx };
      const titleEl = document.getElementById('editPatokModalTitle');
      if (titleEl) titleEl.innerText = `UBAH KOORDINAT PATOK #${vIdx + 1}`;

      const latInput = document.getElementById('editPatokLatInput');
      const lngInput = document.getElementById('editPatokLngInput');
      if (latInput) latInput.value = curr.lat.toFixed(7);
      if (lngInput) lngInput.value = curr.lng.toFixed(7);

      const modal = document.getElementById('modalEditPatokCoord');
      if (modal) modal.style.display = 'flex';
      if (latInput) latInput.focus();
    };

    window.closeEditPatokModal = function() {
      const modal = document.getElementById('modalEditPatokCoord');
      if (modal) modal.style.display = 'none';
      _activeEditingPatok = null;
    };

    window.swapEditPatokInputs = function() {
      const latInput = document.getElementById('editPatokLatInput');
      const lngInput = document.getElementById('editPatokLngInput');
      if (!latInput || !lngInput) return;
      const tmp = latInput.value;
      latInput.value = lngInput.value;
      lngInput.value = tmp;
      showToast('Posisi Latitude dan Longitude berhasil ditukar.', 'info');
    };

    window.copyEditPatokInputs = function() {
      const latInput = document.getElementById('editPatokLatInput');
      const lngInput = document.getElementById('editPatokLngInput');
      if (!latInput || !lngInput) return;
      const text = `${latInput.value}, ${lngInput.value}`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast('Koordinat patok berhasil disalin!', 'success');
        });
      } else {
        showToast('Koordinat: ' + text, 'info');
      }
    };

    window.saveEditPatokCoordinate = function() {
      if (!_activeEditingPatok) return;
      const { pIdx, vIdx } = _activeEditingPatok;
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      const targetPart = parts[pIdx] || activeVertices;
      if (!targetPart || !targetPart[vIdx]) return;

      const latInput = document.getElementById('editPatokLatInput');
      const lngInput = document.getElementById('editPatokLngInput');
      const newLat = parseFloat(latInput?.value);
      const newLng = parseFloat(lngInput?.value);

      if (isNaN(newLat) || isNaN(newLng)) {
        showToast('Masukkan angka koordinat Latitude dan Longitude yang valid.', 'warn');
        return;
      }
      if (Math.abs(newLat) > 90 || Math.abs(newLng) > 180) {
        showToast('Nilai koordinat di luar jangkauan (Latitude: -90 s/d 90, Longitude: -180 s/d 180).', 'warn');
        return;
      }

      targetPart[vIdx] = { lat: newLat, lng: newLng };
      if (parts.length === 1) activeVertices = targetPart;
      isGeometryManuallyEdited = true;
      renderCanvasPolygon(true);
      closeEditPatokModal();
      showToast(`Koordinat Patok #${vIdx + 1} berhasil disimpan.`, 'success');
    };

    window.editVertexCoordinate = function(pIdx, vIdx) {
      openEditPatokModal(pIdx, vIdx);
    };

    window.addVertexNextTo = function(pIdx, vIdx, direction = 'next') {
      if (typeof isVertexLocked === 'function' && isVertexLocked(pIdx, vIdx)) {
        if (typeof showToast === 'function') showToast('Patok terkunci! Lepaskan kunci patok terlebih dahulu sebelum menambah patok sisi.', 'warn');
        return;
      }
      if (map) map.closePopup();
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      const targetPart = parts[pIdx] || activeVertices;
      const n = targetPart.length;
      if (n < 2) return;

      let insertIdx;
      let midLat, midLng;
      if (direction === 'prev') {
        const prevIdx = (vIdx - 1 + n) % n;
        midLat = (targetPart[prevIdx].lat + targetPart[vIdx].lat) / 2;
        midLng = (targetPart[prevIdx].lng + targetPart[vIdx].lng) / 2;
        insertIdx = vIdx;
      } else {
        const nextIdx = (vIdx + 1) % n;
        midLat = (targetPart[vIdx].lat + targetPart[nextIdx].lat) / 2;
        midLng = (targetPart[vIdx].lng + targetPart[nextIdx].lng) / 2;
        insertIdx = vIdx + 1;
      }

      targetPart.splice(insertIdx, 0, {
        lat: Number(midLat.toFixed(7)),
        lng: Number(midLng.toFixed(7))
      });
      if (parts.length === 1) activeVertices = targetPart;
      isGeometryManuallyEdited = true;
      renderCanvasPolygon(true);
      showToast(`Patok baru berhasil ditambahkan pada garis (Total: ${targetPart.length} patok). Tahan & geser patok ke sudut batas yang tepat.`, 'success');
    };

    window.deletePartEntirely = function(pIdx) {
      if (map) map.closePopup();
      if (!activeMultiParts || activeMultiParts.length <= 1) {
        showToast('Hanya ada satu bidang aktif.', 'info');
        return;
      }
      isGeometryManuallyEdited = true;
      activeMultiParts.splice(pIdx, 1);
      if (activeMultiParts.length === 1) {
        activeVertices = activeMultiParts[0];
        activeMultiParts = null;
      } else {
        activeVertices = activeMultiParts[0];
      }
      renderCanvasPolygon(true);
      showToast('Bagian / sisa garis berhasil dihapus.', 'success');
    };

    function cleanInternalDanglingVertices() {
      isGeometryManuallyEdited = true;
      if (activeMultiParts && activeMultiParts.length > 1) {
        let maxA = 0;
        activeMultiParts.forEach(p => {
          const a = calculatePolygonArea(p);
          if (a > maxA) maxA = a;
        });
        const validParts = activeMultiParts.filter(p => p.length >= 3 && calculatePolygonArea(p) >= Math.max(15.0, maxA * 0.05));
        if (validParts.length > 0) {
          if (validParts.length === 1) {
            activeVertices = validParts[0];
            activeMultiParts = null;
          } else {
            activeMultiParts = validParts;
            activeVertices = validParts[0];
          }
          renderCanvasPolygon(true);
          showToast('Patok sisa dan garis dalam berhasil dibersihkan.', 'success');
          return;
        }
      }
      cleanActiveVerticesManual();
      showToast('Titik sudut batas berhasil dirapikan.', 'success');
    }

    window.lockedVertexSet = window.lockedVertexSet || new Set();

    function isVertexLocked(pIdx, idx) {
      return window.lockedVertexSet.has(`${pIdx}_${idx}`);
    }

    function toggleVertexLock(pIdx, idx) {
      const k = `${pIdx}_${idx}`;
      if (window.lockedVertexSet.has(k)) {
        window.lockedVertexSet.delete(k);
      } else {
        window.lockedVertexSet.add(k);
      }
      return window.lockedVertexSet.has(k);
    }

    function unlockAllVertices() {
      window.lockedVertexSet.clear();
      renderCanvasPolygon(true);
      showToast('Seluruh patok berhasil dibuka kunci (bebas diskala).', 'info');
    }

    function toggleVertexLockFromPopup(pIdx, idx) {
      const locked = toggleVertexLock(pIdx, idx);
      showToast(locked ? `Patok #${idx+1} dikunci : data dan posisi terlindungi dari ubah/hapus.` : `Patok #${idx+1} dibuka : data dapat diubah atau dihapus kembali.`, locked ? 'warn' : 'info');
      renderCanvasPolygon(true);
      setTimeout(() => {
        if (vertexMarkers && vertexMarkers.length > 0) {
          const targetMarker = vertexMarkers.find(m => m && m._partIdx === pIdx && m._vertIdx === idx);
          if (targetMarker) {
            targetMarker.openPopup();
          }
        }
      }, 70);
    }

    function nudgeVertexRealCm(pIdx, idx, dir, cm = 1.0) {
      if (typeof isVertexLocked === 'function' && isVertexLocked(pIdx, idx)) return;
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      const targetPart = parts[pIdx] || activeVertices;
      if (!targetPart || !targetPart[idx]) return;

      const v = targetPart[idx];
      const meters = (Number(cm) || 1.0) / 100.0;
      const dLat = meters / 111320.0;
      const cosLat = Math.cos(v.lat * Math.PI / 180.0);
      const dLng = meters / (111320.0 * (Math.abs(cosLat) > 0.0001 ? cosLat : 1.0));

      let newLat = v.lat;
      let newLng = v.lng;

      if (dir === 'up') newLat += dLat;
      else if (dir === 'down') newLat -= dLat;
      else if (dir === 'left') newLng -= dLng;
      else if (dir === 'right') newLng += dLng;

      newLat = Number(newLat.toFixed(7));
      newLng = Number(newLng.toFixed(7));

      targetPart[idx] = { lat: newLat, lng: newLng };
      if (parts.length === 1) activeVertices[idx] = { lat: newLat, lng: newLng };
      isGeometryManuallyEdited = true;
      window.isBoundaryEditingActive = true;

      if (vertexMarkers && vertexMarkers.length > 0) {
        const targetMarker = vertexMarkers.find(m => m && m._partIdx === pIdx && m._vertIdx === idx);
        if (targetMarker) {
          targetMarker.setLatLng([newLat, newLng]);
        }
      }

      const coordEl = document.getElementById(`vCoordText_${pIdx}_${idx}`);
      if (coordEl) coordEl.innerText = `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`;

      renderCanvasPolygon(false);
    }

    var nudgeHoldTimer = null;
    var nudgeInterval = null;
    var isNudgeActive = false;

    function startNudgeHold(pIdx, idx, dir, e) {
      if (typeof isVertexLocked === 'function' && isVertexLocked(pIdx, idx)) {
        if (typeof showToast === 'function') showToast('Patok terkunci! Lepaskan kunci patok terlebih dahulu untuk menggeser posisi.', 'warn');
        return;
      }
      if (e) {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.target && typeof e.target.setPointerCapture === 'function' && e.pointerId !== undefined) {
          try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
        }
      }
      stopNudgeHold();
      isNudgeActive = true;
      window.isBoundaryEditingActive = true;
      nudgeVertexRealCm(pIdx, idx, dir, 1.0);
      nudgeHoldTimer = setTimeout(() => {
        nudgeInterval = setInterval(() => {
          if (!isNudgeActive) {
            stopNudgeHold();
            return;
          }
          nudgeVertexRealCm(pIdx, idx, dir, 1.0);
        }, 50);
      }, 160);
    }

    function stopNudgeHold(e) {
      if (e && e.target && typeof e.target.releasePointerCapture === 'function' && e.pointerId !== undefined) {
        try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      isNudgeActive = false;
      if (nudgeHoldTimer) {
        clearTimeout(nudgeHoldTimer);
        nudgeHoldTimer = null;
      }
      if (nudgeInterval) {
        clearInterval(nudgeInterval);
        nudgeInterval = null;
      }
      if (typeof renderCanvasPolygon === 'function') {
        renderCanvasPolygon(false);
      }
      if (typeof renderCoordinatesTable === 'function') {
        renderCoordinatesTable();
      }
    }

    window.startNudgeHold = startNudgeHold;
    window.stopNudgeHold = stopNudgeHold;
    window.addEventListener('mouseup', stopNudgeHold);
    window.addEventListener('touchend', stopNudgeHold);
    window.addEventListener('pointerup', stopNudgeHold);
    window.addEventListener('pointercancel', stopNudgeHold);

    window.isVertexLocked = isVertexLocked;
    window.toggleVertexLock = toggleVertexLock;
    window.unlockAllVertices = unlockAllVertices;
    window.toggleVertexLockFromPopup = toggleVertexLockFromPopup;
    window.nudgeVertexRealCm = nudgeVertexRealCm;
    window.computePartialRescaleParts = computePartialRescaleParts;
    window.toggleMergeMode = toggleMergeMode;
    window.cancelMergeMode = cancelMergeMode;
    window.finishMergeParcels = finishMergeParcels;
    window.handleMergeParcelClick = handleMergeParcelClick;
    window.clientSideMergeParcels = clientSideMergeParcels;
    window.getCleanParcelTitle = getCleanParcelTitle;
    window.swapBatchCoordinatesText = swapBatchCoordinatesText;
    window.swapBatchCoordsOrder = swapBatchCoordsOrder;
    window.clearBatchCoordsInput = clearBatchCoordsInput;
    window.captureGpsCoordinate = captureGpsCoordinate;


