function createPolygonFromBatchCoords() {
      const raw = document.getElementById('batchCoordsInput')?.value.trim();
      if (!raw) {
        showToast('Masukkan daftar koordinat terlebih dahulu.', 'warn');
        return;
      }
      const lines = raw.split(/\r?\n/);
      const pts = [];
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx].trim();
        if (!line || line.startsWith('#') || line.startsWith('//')) continue;
        const parts = line.split(/[,\s\t;]+/).filter(Boolean);
        if (parts.length >= 2) {
          let v1 = parseFloat(parts[0]);
          let v2 = parseFloat(parts[1]);
          if (isNaN(v1) || isNaN(v2)) continue;
          let lat, lng;
          if (Math.abs(v1) <= 90 && Math.abs(v2) <= 180) {
            if (v1 > 50 && v2 < 20) {
              lng = v1; lat = v2;
            } else {
              lat = v1; lng = v2;
            }
          } else {
            continue;
          }
          pts.push({ lat, lng });
        }
      }
      if (pts.length < 3) {
        showToast('Dibutuhkan minimal 3 titik koordinat valid untuk membentuk poligon bidang.', 'warn');
        return;
      }
      if (pts[0].lat === pts[pts.length - 1].lat && pts[0].lng === pts[pts.length - 1].lng) {
        pts.pop();
      }
      if (pts.length < 3) {
        showToast('Titik koordinat tidak membentuk bidang (kurang dari 3 titik unik).', 'warn');
        return;
      }
      activeVertices = pts;
      activeMultiParts = [pts];
      activePinData = {
        identifikasi: 'DIGITASI-MANDIRI',
        tipe: 'HAK MILIK / PERIZINAN',
        luas_bpn: Math.round(calculatePolygonArea(pts)),
        luas_ukur: Math.round(calculatePolygonArea(pts)),
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
      showToast(`Poligon berhasil dibentuk dari ${pts.length} titik patok dan siap diekspor!`, 'success');
      syncActivePolygonPanel();
      updateCoordsTable();
      switchTab('tab-bidang');
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
      activePinData.nib = '-';
      activePinData.nomor_hak = '-';
      activePinData.nosu = '-';
      rawInitialBboxCoords = manualBox;
      initCanvasRebuilder(lat, lng, estArea, manualBox);
      const elLuasBpn = document.getElementById('pinLuasBpnText');
      if (elLuasBpn) {
        elLuasBpn.className = 'stat-value offline';
        elLuasBpn.innerText = 'Belum Terhubung Server';
      }
      const elTipeHak = document.getElementById('pinTipeHakText'); if (elTipeHak) elTipeHak.innerText = 'Delineasi Mandiri';
      if (typeof renderCadastralProFields === 'function') {
        renderCadastralProFields();
      }
      const elStatusValidasi = document.getElementById('pinStatusValidasiText');
      if (elStatusValidasi) {
        elStatusValidasi.className = 'status-offline-tag';
        elStatusValidasi.innerText = 'Belum Terhubung Server';
      }
      const elHudArea = document.getElementById('hudBpnArea');
      if (elHudArea) {
        elHudArea.innerHTML = '<span class="status-offline-tag" style="padding:1px 6px;font-size:0.68rem;margin:0;">Belum Terhubung Server</span>';
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
      const luasStr = (activePinData.luas_m2 && activePinData.luas_m2 > 0) ? `${Math.round(activePinData.luas_m2).toLocaleString('id-ID')} m²` : 'Belum Terhubung Server';
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
      activeMultiParts = null;
      if (typeof stopAddVertexOnEdgeMode === 'function' && typeof isAddVertexOnEdgeMode !== 'undefined' && isAddVertexOnEdgeMode) {
        stopAddVertexOnEdgeMode();
      }
      if (typeof snapMarker !== 'undefined' && snapMarker && map) {
        map.removeLayer(snapMarker);
        snapMarker = null;
      }
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

    function cleanAndDeduplicateVertices(coords, minMeters = 1.5, maxDeg = 14.0) {
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
      activeVertices = cleanAndDeduplicateVertices(activeVertices, 1.8, 15.0);
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

      let pts = rawBboxCoords;
      activeVertices = pts.map(p => Array.isArray(p) ? { lat: p[1], lng: p[0] } : { lat: p.lat, lng: p.lng });
      activeVertices = cleanAndDeduplicateVertices(activeVertices, 0.25, 4.0);

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
    function activateMoveVertexMode() {
      if (isFreeDeleteVertexMode) {
        toggleFreeDeleteVertexMode();
      }
      const btnMove = document.getElementById('btnToggleMoveVertex');
      if (btnMove) btnMove.classList.add('active');
      showToast('Mode Geser Patok Aktif: Tahan dan seret patok batas di peta untuk mengubah bentuk bidang.', 'info');
    }

    function toggleFreeDeleteVertexMode() {
      isFreeDeleteVertexMode = !isFreeDeleteVertexMode;
      const btn = document.getElementById('btnToggleFreeDelete');
      const btnMove = document.getElementById('btnToggleMoveVertex');
      if (btn) {
        btn.classList.toggle('active', isFreeDeleteVertexMode);
        if (isFreeDeleteVertexMode) {
          document.body.classList.add('free-delete-active');
          if (btnMove) btnMove.classList.remove('active');
          showToast('Mode Hapus Patok Bebas Aktif: Klik langsung patok mana saja di peta untuk menghapusnya.', 'info');
        } else {
          document.body.classList.remove('free-delete-active');
          if (btnMove) btnMove.classList.add('active');
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

      if (!activePolygonLayer) {
        activePolygonLayer = L.polygon(latlngs, {
          color: '#ea580c',
          weight: 3.5,
          fillColor: '#ea580c',
          fillOpacity: 0.15,
          interactive: false
        }).addTo(map);
      } else {
        activePolygonLayer.setLatLngs(latlngs);
        activePolygonLayer.setStyle({
          color: '#ea580c',
          weight: 3.5,
          fillColor: '#ea580c',
          fillOpacity: 0.15
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

      if (isGeometryManuallyEdited) {
        if (activePinData) {
          activePinData.luas_m2 = roundArea2(liveAreaM2);
          activePinData.luas_ha = roundAreaHa6(liveAreaM2);
        }
        const elLuasBpn = document.getElementById('pinLuasBpnText');
        if (elLuasBpn) {
          elLuasBpn.className = 'stat-value emerald';
          elLuasBpn.innerText = formatAreaM2(liveAreaM2);
        }
        const elStatusValidasi = document.getElementById('pinStatusValidasiText');
        if (elStatusValidasi) {
          elStatusValidasi.className = 'spec-value emerald';
          elStatusValidasi.innerText = 'Kalkulasi Geometri Real';
        }
        const elHudArea = document.getElementById('hudBpnArea');
        if (elHudArea) elHudArea.innerText = formatAreaM2(liveAreaM2);
        const diffPctEl = document.getElementById('diffPercentText');
        const diffBpnEl = document.getElementById('diffTargetBpnText');
        if (diffPctEl) diffPctEl.innerText = '0.00 m² (Kalkulasi Real)';
        if (diffBpnEl) diffBpnEl.innerText = formatAreaM2(liveAreaM2);
      } else {
        const targetBpnArea = activePinData?.luas_m2 || 0;
        if (targetBpnArea > 0) {
          const diff = liveAreaM2 - targetBpnArea;
          const pct = Math.max(0, 100 - (Math.abs(diff) / targetBpnArea * 100));
          const diffText = diff >= 0 ? `+${diff.toFixed(2)} m²` : `${diff.toFixed(2)} m²`;
          const diffPctEl = document.getElementById('diffPercentText');
          const diffBpnEl = document.getElementById('diffTargetBpnText');
          if (diffPctEl) diffPctEl.innerText = `${diffText} (Presisi: ${pct.toFixed(2)}%)`;
          if (diffBpnEl) diffBpnEl.innerText = formatAreaM2(targetBpnArea);
        } else {
          const diffPctEl = document.getElementById('diffPercentText');
          const diffBpnEl = document.getElementById('diffTargetBpnText');
          if (diffPctEl) diffPctEl.innerHTML = '<span class="status-offline-tag" style="padding:1px 6px;font-size:0.68rem;margin:0;">Belum Terhubung Server</span>';
          if (diffBpnEl) diffBpnEl.innerHTML = '<span class="status-offline-tag" style="padding:1px 6px;font-size:0.68rem;margin:0;">Belum Terhubung Server</span>';
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
    }

    function getDirectionLabel(fromLat, fromLng, toLat, toLng) {
      const dLng = (toLng - fromLng) * Math.PI / 180;
      const lat1 = fromLat * Math.PI / 180;
      const lat2 = toLat * Math.PI / 180;
      const y = Math.sin(dLng) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
      let brng = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      if (brng >= 315 || brng < 45) return 'Sisi Atas';
      if (brng >= 45 && brng < 135) return 'Sisi Kanan';
      if (brng >= 135 && brng < 225) return 'Sisi Bawah';
      return 'Sisi Kiri';
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
          const nodeIcon = L.divIcon({
            className: 'vertex-pin',
            html: `<div class="custom-vertex-node"><span class="node-label">${nodeLabel}</span><span class="node-move-hint" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg></span></div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });

          const marker = L.marker([v.lat, v.lng], {
            icon: nodeIcon,
            draggable: true,
            zIndexOffset: 1000
          }).addTo(map);

          const utmCoord = (typeof getUtmCoordinates === 'function') ? getUtmCoordinates(v.lat, v.lng) : null;
          const utmStr = utmCoord ? `X: ${utmCoord.easting.toFixed(2)} | Y: ${utmCoord.northing.toFixed(2)} (${utmCoord.zone})` : '';

          const nextIdx = (idx + 1) % numPts;
          const prevIdx = (idx - 1 + numPts) % numPts;
          const nextV = partList[nextIdx];
          const prevV = partList[prevIdx];
          const nextLabel = parts.length > 1 ? `${pfx}${nextIdx + 1}` : `P${nextIdx + 1}`;
          const prevLabel = parts.length > 1 ? `${pfx}${prevIdx + 1}` : `P${prevIdx + 1}`;
          const distNext = L.latLng(v.lat, v.lng).distanceTo(L.latLng(nextV.lat, nextV.lng));
          const distPrev = L.latLng(v.lat, v.lng).distanceTo(L.latLng(prevV.lat, prevV.lng));

          const dirNext = getDirectionLabel(v.lat, v.lng, nextV.lat, nextV.lng);
          const dirPrev = getDirectionLabel(v.lat, v.lng, prevV.lat, prevV.lng);

          const popupContent = `
            <div class="vertex-action-card">
              <div class="vertex-action-head">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="vertex-badge-tag">${nodeLabel}</span>
                  <span class="vertex-title">Patok ${nodeLabel}</span>
                </div>
                <span class="vertex-index-num">#${idx + 1} dari ${numPts}</span>
              </div>

              <div class="vertex-coords-box">
                <div class="vertex-coord-row">
                  <span class="coord-k">WGS84</span>
                  <span class="coord-v">${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}</span>
                </div>
                ${utmStr ? `
                <div class="vertex-coord-row">
                  <span class="coord-k">UTM</span>
                  <span class="coord-v">${utmStr}</span>
                </div>` : ''}
                <div class="vertex-coord-row" style="margin-top: 2px; padding-top: 2px; border-top: 1px dashed #e2e8f0; font-size: 0.62rem; color: #64748b;">
                  <span>Ruas: &larr; ${prevLabel} (${distPrev.toFixed(1)}m) | ${nextLabel} (${distNext.toFixed(1)}m) &rarr;</span>
                </div>
              </div>

              <div class="vertex-action-btns">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                  <button type="button" class="btn-vertex-action edit" onclick="window.openEditVertexModal(${pIdx}, ${idx})" title="Edit nilai koordinat patok ini">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    <span>Edit Koordinat</span>
                  </button>
                  <button type="button" class="btn-vertex-action delete" onclick="window.deleteVertexMarker(${pIdx}, ${idx})" title="Hapus patok ini">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    <span>Hapus Patok</span>
                  </button>
                </div>

                <div class="vertex-add-section">
                  <div class="vertex-section-label">Tambah Patok Baru di Sisi:</div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                    <button type="button" class="btn-vertex-action add-side" onclick="window.addVertexBetween(${pIdx}, ${idx}, ${nextIdx})" title="Tambah patok baru di garis menuju ${nextLabel}">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      <span>${dirNext} (&rarr; ${nextLabel})</span>
                    </button>
                    <button type="button" class="btn-vertex-action add-side" onclick="window.addVertexBetween(${pIdx}, ${prevIdx}, ${idx})" title="Tambah patok baru di garis dari ${prevLabel}">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      <span>${dirPrev} (&larr; ${prevLabel})</span>
                    </button>
                  </div>
                  <button type="button" class="btn-vertex-action add-edge-interactive" onclick="window.startAddVertexOnEdgeMode(${pIdx})" title="Klik sembarang pada garis batas bidang untuk menaruh patok baru">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    <span>Arahkan &amp; Klik Garis Batas</span>
                  </button>
                </div>

                ${parts.length > 1 ? `
                <button type="button" class="btn-vertex-action delete-part" onclick="window.deletePartEntirely(${pIdx})">
                  Hapus Sisa Garis Bagian ${pfx}
                </button>` : ''}
              </div>
            </div>
          `;
          marker.bindPopup(popupContent, {
            offset: [0, -14],
            closeButton: true,
            className: 'vertex-action-popup'
          });

          let isMarkerDragging = false;
          let popupCloseTimeout = null;

          marker.on('mouseover', function(e) {
            if (isMarkerDragging || isAddVertexOnEdgeMode) return;
            if (popupCloseTimeout) {
              clearTimeout(popupCloseTimeout);
              popupCloseTimeout = null;
            }
            marker.openPopup();
          });

          marker.on('mouseout', function(e) {
            if (popupCloseTimeout) clearTimeout(popupCloseTimeout);
            popupCloseTimeout = setTimeout(() => {
              const popupEl = marker.getPopup()?.getElement();
              if (!popupEl || !popupEl.matches(':hover')) {
                marker.closePopup();
              }
            }, 300);
          });

          marker.on('popupopen', function() {
            const popupEl = marker.getPopup()?.getElement();
            if (popupEl) {
              popupEl.onmouseenter = function() {
                if (popupCloseTimeout) {
                  clearTimeout(popupCloseTimeout);
                  popupCloseTimeout = null;
                }
              };
              popupEl.onmouseleave = function() {
                popupCloseTimeout = setTimeout(() => {
                  marker.closePopup();
                }, 300);
              };
            }
          });

          marker.on('click', function(e) {
            if (isFreeDeleteVertexMode) {
              L.DomEvent.stopPropagation(e);
              window.deleteVertexMarker(pIdx, idx);
              return;
            }
            if (popupCloseTimeout) {
              clearTimeout(popupCloseTimeout);
              popupCloseTimeout = null;
            }
            marker.openPopup();
          });

          marker.on('dragstart', function() {
            isMarkerDragging = true;
            this.closePopup();
            const el = this.getElement();
            if (el) el.classList.add('dragging');
            isGeometryManuallyEdited = true;
          });

          marker.on('drag', function(e) {
            isGeometryManuallyEdited = true;
            const pos = e.target.getLatLng();
            partList[idx] = { lat: pos.lat, lng: pos.lng };
            if (parts.length === 1) activeVertices[idx] = { lat: pos.lat, lng: pos.lng };
            renderCanvasPolygon(false);
          });

          marker.on('dragend', function() {
            isMarkerDragging = false;
            const el = this.getElement();
            if (el) el.classList.remove('dragging');
            isGeometryManuallyEdited = true;
            renderCanvasPolygon(true);
            showToast(`Posisi Patok ${nodeLabel} berhasil disesuaikan.`, 'info');
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
          const minAddDist = curZ >= 23 ? 0.6 : (curZ >= 20 ? 1.5 : 3.5);
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

      if (activeMultiParts && activeMultiParts.length > 1) {
        const curTotalArea = activeMultiParts.reduce((sum, part) => sum + calculatePolygonArea(part), 0);
        if (curTotalArea <= 0) return;

        let targetArea = activePinData?.luas_m2 || 0;
        if (!targetArea || targetArea <= 0) {
          const ask = prompt('Masukkan target luas bidang resmi (m²):', Math.round(curTotalArea));
          if (ask && !isNaN(parseFloat(ask)) && parseFloat(ask) > 0) {
            targetArea = parseFloat(ask);
            if (!activePinData) activePinData = {};
            activePinData.luas_m2 = targetArea;
          } else {
            showToast('Penyesuaian luas dibatalkan.', 'info');
            return;
          }
        }

        targetArea = roundArea2(targetArea);
        for (let iter = 0; iter < 2; iter++) {
          const curA = activeMultiParts.reduce((sum, part) => sum + calculatePolygonArea(part), 0);
          if (curA <= 0 || Math.abs(curA - targetArea) < 0.0001) break;
          const s = Math.sqrt(targetArea / curA);
          activeMultiParts = activeMultiParts.map(part => {
            let cLat = 0, cLng = 0;
            part.forEach(v => { cLat += v.lat; cLng += v.lng; });
            cLat /= part.length;
            cLng /= part.length;
            return part.map(v => ({
              lat: cLat + (v.lat - cLat) * s,
              lng: cLng + (v.lng - cLng) * s
            }));
          });
        }

        activeVertices = activeMultiParts[0];
        if (activePinData) {
          activePinData.luas_m2 = targetArea;
          activePinData.luas_ha = roundAreaHa6(targetArea);
        }
        isGeometryManuallyEdited = false;
        renderCanvasPolygon(true);
        showToast(`Presisi Batas berhasil: Seluruh ${activeMultiParts.length} bagian bidang poligon disesuaikan ukurannya ke ${formatAreaM2(targetArea)}.`, 'success');
        return;
      }

      const curArea = calculatePolygonArea(activeVertices);
      if (curArea <= 0) return;

      let targetArea = activePinData?.luas_m2 || 0;
      if (!targetArea || targetArea <= 0) {
        const ask = prompt('Masukkan target luas bidang resmi (m²):', Math.round(curArea));
        if (ask && !isNaN(parseFloat(ask)) && parseFloat(ask) > 0) {
          targetArea = parseFloat(ask);
          if (!activePinData) activePinData = {};
          activePinData.luas_m2 = targetArea;
        } else {
          showToast('Penyesuaian luas dibatalkan.', 'info');
          return;
        }
      }

      targetArea = roundArea2(targetArea);
      for (let iter = 0; iter < 2; iter++) {
        const curA = calculatePolygonArea(activeVertices);
        if (curA <= 0 || Math.abs(curA - targetArea) < 0.0001) break;
        const s = Math.sqrt(targetArea / curA);
        let cLat = 0, cLng = 0;
        activeVertices.forEach(v => { cLat += v.lat; cLng += v.lng; });
        cLat /= activeVertices.length;
        cLng /= activeVertices.length;
        activeVertices = activeVertices.map(v => ({
          lat: cLat + (v.lat - cLat) * s,
          lng: cLng + (v.lng - cLng) * s
        }));
      }

      if (activePinData) {
        activePinData.luas_m2 = targetArea;
        activePinData.luas_ha = roundAreaHa6(targetArea);
      }
      isGeometryManuallyEdited = false;
      renderCanvasPolygon(true);
      showToast(`Presisi Batas berhasil: Ukuran poligon disesuaikan ke ${formatAreaM2(targetArea)} sesuai catatan luas resmi.`, 'success');
    }

    function toggleMergeMode() {
      if (isMergeMode) {
        cancelMergeMode();
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

      const firstParcelArea = (activePinData && activePinData.luas_m2 > 0)
        ? roundArea2(activePinData.luas_m2)
        : roundArea2(calculatePolygonArea(activeVertices));

      mergeParcelsList.push({
        coords: activeVertices.map(v => ({ lat: Number(v.lat.toFixed(7)), lng: Number(v.lng.toFixed(7)) })),
        fid: 'Bidang 1',
        _internalFid: activePinData?.fid || null,
        luas: firstParcelArea
      });

      const banner = document.getElementById('mergeModeBanner');
      if (banner) {
        banner.style.display = 'flex';
        document.getElementById('mergeCountBadge').innerText = '1';
        const txt = document.getElementById('mergeBannerText');
        if (txt) {
          txt.innerHTML = `<span class="dot-indicator" style="background-color: var(--amber);"></span> <strong>Mode Tambah Bidang (Gabung) Aktif</strong>: Bidang 1 (${formatAreaM2(firstParcelArea)}) terpilih. Klik bidang tanah tetangga di peta.`;
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

    function snapSharedBoundaryVertices(newCoords, existingPolys, snapThresholdMeters = 2.5) {
      if (!newCoords || newCoords.length < 3 || !existingPolys || existingPolys.length === 0) {
        return newCoords;
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
        if (segLen2 === 0) return { dist: distM(p, a), pt: a };
        const pLat = (p.lat - a.lat) * 111320;
        const pLng = (p.lng - a.lng) * (111320 * Math.cos(midLat * Math.PI / 180));
        const t = Math.max(0, Math.min(1, (pLat * dlat + pLng * dlng) / segLen2));
        const projLat = a.lat + (t * (b.lat - a.lat));
        const projLng = a.lng + (t * (b.lng - a.lng));
        return { dist: distM(p, { lat: projLat, lng: projLng }), pt: { lat: projLat, lng: projLng } };
      }

      return newCoords.map(v => {
        let bestSnap = null;
        let minD = snapThresholdMeters;
        existingPolys.forEach(poly => {
          if (!poly || poly.length < 3) return;
          const m = poly.length;
          for (let j = 0; j < m; j++) {
            const rawA = poly[j];
            const a = Array.isArray(rawA) ? { lat: rawA[1], lng: rawA[0] } : { lat: rawA.lat, lng: rawA.lng };
            const d = distM(v, a);
            if (d < minD) {
              minD = d;
              bestSnap = { lat: a.lat, lng: a.lng };
            }
          }
          for (let j = 0; j < m; j++) {
            const rawA = poly[j];
            const rawB = poly[(j + 1) % m];
            const a = Array.isArray(rawA) ? { lat: rawA[1], lng: rawA[0] } : { lat: rawA.lat, lng: rawA.lng };
            const b = Array.isArray(rawB) ? { lat: rawB[1], lng: rawB[0] } : { lat: rawB.lat, lng: rawB.lng };
            const res = distToSegmentM(v, a, b);
            if (res.dist < minD) {
              minD = res.dist;
              bestSnap = res.pt;
            }
          }
        });
        return bestSnap ? { lat: Number(bestSnap.lat.toFixed(7)), lng: Number(bestSnap.lng.toFixed(7)) } : { lat: Number(v.lat.toFixed(7)), lng: Number(v.lng.toFixed(7)) };
      });
    }

    async function handleMergeParcelClick(lat, lng) {
      const statusBanner = document.getElementById('mergeBannerText');
      if (statusBanner) {
        statusBanner.innerHTML = '<span class="dot-indicator" style="background-color: var(--amber);"></span> Sedang membaca data batas bidang tanah di titik klik...';
      }
      try {
        let persilData = null;
        if (drawnItems) {
          drawnItems.eachLayer(layer => {
            if (!persilData && layer.getLatLngs) {
              const lls = layer.getLatLngs();
              const ring = Array.isArray(lls[0]) ? lls[0] : lls;
              if (ring && ring.length >= 3) {
                const pts = ring.map(p => ({ lat: Number(p.lat.toFixed(7)), lng: Number(p.lng.toFixed(7)) }));
                if (isPointInsideOrNearPolygon(lat, lng, pts, 0.5)) {
                  const a = roundArea2(calculatePolygonArea(pts));
                  persilData = {
                    found: true,
                    fid: 'Bidang Gambar ' + (mergeParcelsList.length + 1),
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

        if (!persilData || !persilData.found || !persilData.polygon_coords || persilData.polygon_coords.length < 3) {
          if (statusBanner) {
            statusBanner.innerHTML = '<span class="dot-indicator" style="background-color: var(--crimson);"></span> Bidang tanah tidak terdeteksi pada titik klik. Pastikan klik berada tepat di dalam bidang tanah kadastral terdaftar.';
          }
          showToast('Titik klik berada di luar bidang tanah terdaftar. Silakan klik tepat di dalam bidang yang ingin digabungkan.', 'warn');
          return;
        }

        const isAlreadyAdded = mergeParcelsList.some(p => {
          if (persilData.fid && persilData.fid !== '-' && p._internalFid === persilData.fid) return true;
          return false;
        });
        if (isAlreadyAdded) {
          if (statusBanner) {
            statusBanner.innerHTML = `<span class="dot-indicator" style="background-color: var(--amber);"></span> Bidang tanah ini sudah ada dalam daftar gabung.`;
          }
          showToast('Bidang tanah ini sudah terpilih sebelumnya.', 'info');
          return;
        }

        let rawCoords = persilData.polygon_coords.map(p => {
          if (Array.isArray(p)) return { lat: Number(p[1]), lng: Number(p[0]) };
          return { lat: Number(p.lat), lng: Number(p.lng) };
        });
        rawCoords = cleanAndDeduplicateVertices(rawCoords, 0.25, 4.0);

        const existingPolys = [activeVertices, ...mergeParcelsList.map(p => p.coords)];
        const snappedCoords = snapSharedBoundaryVertices(rawCoords, existingPolys, 2.5);

        const newParcelLuas = (persilData.luas_m2 && persilData.luas_m2 > 0)
          ? roundArea2(persilData.luas_m2)
          : roundArea2(calculatePolygonArea(snappedCoords));
        const newParcelLabel = `Bidang ${mergeParcelsList.length + 1}`;

        mergeParcelsList.push({
          coords: snappedCoords,
          fid: newParcelLabel,
          _internalFid: persilData.fid || null,
          luas: newParcelLuas
        });

        const latlngs = snappedCoords.map(p => [p.lat, p.lng]);
        const previewLayer = L.polygon(latlngs, {
          color: '#082449',
          weight: 2.5,
          dashArray: '5, 5',
          fillColor: '#0a2e5c',
          fillOpacity: 0.22,
          interactive: false
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
        if (segLen2 === 0) return { dist: distM(p, a), pt: a };
        const pLat = (p.lat - a.lat) * 111320;
        const pLng = (p.lng - a.lng) * (111320 * Math.cos(midLat * Math.PI / 180));
        const t = Math.max(0, Math.min(1, (pLat * dlat + pLng * dlng) / segLen2));
        const projLat = a.lat + (t * (b.lat - a.lat));
        const projLng = a.lng + (t * (b.lng - a.lng));
        return { dist: distM(p, { lat: projLat, lng: projLng }), pt: { lat: projLat, lng: projLng } };
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
          for (let vIdx = 0; vIdx < normPolys[j].length; vIdx++) {
            const v = normPolys[j][vIdx];
            let k = 0;
            while (k < normPolys[i].length) {
              const a = normPolys[i][k];
              const b = normPolys[i][(k + 1) % normPolys[i].length];
              const dA = distM(v, a);
              const dB = distM(v, b);
              if (dA > 0.5 && dB > 0.5) {
                const res = distToSegmentM(v, a, b);
                if (res.dist <= snapThreshold) {
                  normPolys[i].splice(k + 1, 0, { lat: res.pt.lat, lng: res.pt.lng });
                  k++;
                }
              }
              k++;
            }
          }
        }
      }

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
          if (d1 <= snapThreshold && d2 <= snapThreshold) {
            edges[i].shared = true;
            edges[j].shared = true;
            break;
          }
          const d1s = distM(edges[i].from, edges[j].from);
          const d2s = distM(edges[i].to, edges[j].to);
          if (d1s <= snapThreshold && d2s <= snapThreshold) {
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
        const maxIter = boundaryEdges.length * 2;
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
          const cleanLoop = cleanAndDeduplicateVertices(loop, 1.2, 14.0);
          const loopArea = calculatePolygonArea(cleanLoop);
          if (loopArea >= 12.0) {
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
        return a >= Math.max(15.0, maxLoopArea * 0.05);
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
        for (let iter = 0; iter < 2; iter++) {
          const curGeomArea = activeMultiParts.reduce((sum, part) => sum + calculatePolygonArea(part), 0);
          if (curGeomArea <= 0 || Math.abs(curGeomArea - targetTotalArea) < 0.0001) break;
          const scale = Math.sqrt(targetTotalArea / curGeomArea);
          activeMultiParts = activeMultiParts.map(part => {
            let cLat = 0, cLng = 0;
            part.forEach(v => { cLat += v.lat; cLng += v.lng; });
            cLat /= part.length;
            cLng /= part.length;
            return part.map(v => ({
              lat: cLat + (v.lat - cLat) * scale,
              lng: cLng + (v.lng - cLng) * scale
            }));
          });
        }
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
        mergedPts = cleanAndDeduplicateVertices(mergedPts, 1.2, 14.0);
        for (let iter = 0; iter < 2; iter++) {
          const curGeomArea = calculatePolygonArea(mergedPts);
          if (curGeomArea <= 0 || Math.abs(curGeomArea - targetTotalArea) < 0.0001) break;
          const scale = Math.sqrt(targetTotalArea / curGeomArea);
          let cLat = 0, cLng = 0;
          mergedPts.forEach(v => { cLat += v.lat; cLng += v.lng; });
          cLat /= mergedPts.length;
          cLng /= mergedPts.length;
          mergedPts = mergedPts.map(v => ({
            lat: cLat + (v.lat - cLat) * scale,
            lng: cLng + (v.lng - cLng) * scale
          }));
        }
        activeVertices = mergedPts;
      }

      if (activePinData) {
        activePinData.fid = 'Gabungan ' + mergeParcelsList.length + ' Bidang';
        activePinData.luas_m2 = targetTotalArea;
        activePinData.luas_ha = roundAreaHa6(targetTotalArea);
        const _elNib = document.getElementById('pinNibText');
        if (_elNib) _elNib.innerText = 'Gabungan ' + mergeParcelsList.length + ' Bidang';
        const _elLok = document.getElementById('pinLokasiUtamaText');
        if (_elLok) _elLok.innerText = (activePinData.desa !== '-' && activePinData.kecamatan !== '-') ? `${activePinData.desa}, ${activePinData.kecamatan}` : (activePinData.desa !== '-' ? activePinData.desa : 'Bidang Tanah');
        const _elLuas = document.getElementById('pinLuasBpnText');
        if (_elLuas) _elLuas.innerText = formatAreaM2(targetTotalArea);
        const _elStatus = document.getElementById('pinStatusValidasiText');
        if (_elStatus) _elStatus.innerText = 'Penjumlahan Bidang Terpilih';
      }

      const hud = document.getElementById('canvasHud');
      if (hud) {
        hud.style.display = 'flex';
        const elHudNib = document.getElementById('hudNib');
        if (elHudNib) elHudNib.innerText = activePinData?.fid || 'Gabungan Bidang';
        const elHudArea = document.getElementById('hudBpnArea');
        if (elHudArea) elHudArea.innerText = formatAreaM2(targetTotalArea);
      }

      const elShpLuas = document.getElementById('shpLuasHa') || document.getElementById('shpLuas');
      if (elShpLuas) {
        elShpLuas.value = `${(targetTotalArea / 10000.0).toFixed(6)} Ha`;
      }

      isParcelLocked = true;
      isGeometryManuallyEdited = false;
      renderCanvasPolygon(true);
      cancelMergeMode();
      switchTab('tab-bidang');
      showToast(`Penggabungan berhasil: ${mergeParcelsList.length} bidang digabung menjadi 1 poligon utuh (Luas: ${formatAreaM2(targetTotalArea)}, ${activeVertices.length} patok batas).`, 'success');
    }

    function setupDrawing() {
      drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
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
          snapMarker = L.marker(bestTarget, { icon: snapIcon, interactive: false, zIndexOffset: 2000 }).addTo(map);
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
          fillOpacity: 0.18,
          interactive: false
        }).addTo(map);
      }

      customDrawPoints.forEach((pt, idx) => {
        const marker = L.circleMarker(pt, {
          radius: 5,
          color: '#0a2e5c',
          fillColor: '#ffffff',
          fillOpacity: 1,
          weight: 2,
          interactive: false
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
      showToast(`Poligon selesai: ${finalPts.length} patok berhasil dibuat. Bentuk poligon dapat diedit langsung.`, 'success');
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
    function addVertexToActivePolygon() {
      startAddVertexOnEdgeMode();
    }

    function removeLastVertexFromActive() {
      if (!activeVertices || activeVertices.length <= 3) {
        showToast('Poligon minimal membutuhkan 3 titik patok batas.', 'warn');
        return;
      }
      activeVertices.pop();
      renderCanvasPolygon(true);
      showToast(`Patok terakhir dihapus (sisa: ${activeVertices.length} patok)`, 'info');
    }

    function clearDrawnLayers() {
      drawnItems.clearLayers();
      cancelCustomPolygonDraw();
      clearCanvasRebuilderLayers();
      resetMeasurementLabels();
      showToast('Hasil gambar dan pengukuran berhasil dibersihkan.', 'info');
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

    window.activateMoveVertexMode = activateMoveVertexMode;

    function getClosestPointOnSegment(point, pA, pB, mapObj) {
      const pt = mapObj.latLngToLayerPoint(L.latLng(point.lat, point.lng));
      const a = mapObj.latLngToLayerPoint(L.latLng(pA.lat, pA.lng));
      const b = mapObj.latLngToLayerPoint(L.latLng(pB.lat, pB.lng));

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;

      if (lenSq === 0) {
        return {
          latLng: L.latLng(pA.lat, pA.lng),
          distancePx: Math.hypot(pt.x - a.x, pt.y - a.y),
          t: 0
        };
      }

      let t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq;
      t = Math.max(0.02, Math.min(0.98, t));

      const projX = a.x + t * dx;
      const projY = a.y + t * dy;
      const projLatLng = mapObj.layerPointToLatLng(L.point(projX, projY));
      const distPx = Math.hypot(pt.x - projX, pt.y - projY);

      return {
        latLng: projLatLng,
        distancePx: distPx,
        t: t
      };
    }

    function findClosestPolygonEdge(clickLatLng) {
      if (!map) return null;
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      let best = null;
      let minDistancePx = Infinity;

      parts.forEach((partList, pIdx) => {
        const n = partList.length;
        for (let i = 0; i < n; i++) {
          const nextIdx = (i + 1) % n;
          const pA = partList[i];
          const pB = partList[nextIdx];

          const snap = getClosestPointOnSegment(clickLatLng, pA, pB, map);
          if (snap.distancePx < minDistancePx) {
            minDistancePx = snap.distancePx;
            best = {
              pIdx: pIdx,
              partList: partList,
              segIdx: i,
              nextIdx: nextIdx,
              latLng: snap.latLng,
              distancePx: snap.distancePx,
              fromPt: pA,
              toPt: pB
            };
          }
        }
      });

      return best;
    }

    var isAddVertexOnEdgeMode = false;
    var snapPreviewMarker = null;
    var snapPreviewGuideLine = null;

    function startAddVertexOnEdgeMode(preferredPartIdx = 0) {
      if (map) map.closePopup();
      if (!activeVertices || activeVertices.length < 3) {
        showToast('Pilih bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }
      isAddVertexOnEdgeMode = true;
      if (isFreeDeleteVertexMode) toggleFreeDeleteVertexMode();

      const btnMove = document.getElementById('btnToggleMoveVertex');
      if (btnMove) btnMove.classList.remove('active');
      const btnAdd = document.getElementById('btnToolbarAddVertex');
      if (btnAdd) btnAdd.classList.add('active');

      if (map) {
        map.getContainer().style.cursor = 'crosshair';
        map.off('mousemove', handleAddVertexMouseMove);
        map.on('mousemove', handleAddVertexMouseMove);
        map.off('click', handleAddVertexMapClick);
        map.on('click', handleAddVertexMapClick);
      }

      window.removeEventListener('keydown', handleAddVertexEscKey);
      window.addEventListener('keydown', handleAddVertexEscKey);

      showToast('Mode Tambah Patok Aktif: Klik pada garis bidang batas di mana patok baru ingin ditempatkan (otomatis menempel di garis terdekat).', 'info');
    }

    function stopAddVertexOnEdgeMode() {
      isAddVertexOnEdgeMode = false;
      if (map) {
        map.getContainer().style.cursor = '';
        map.off('mousemove', handleAddVertexMouseMove);
        map.off('click', handleAddVertexMapClick);
      }
      window.removeEventListener('keydown', handleAddVertexEscKey);

      if (snapPreviewMarker && map) {
        map.removeLayer(snapPreviewMarker);
        snapPreviewMarker = null;
      }
      if (snapPreviewGuideLine && map) {
        map.removeLayer(snapPreviewGuideLine);
        snapPreviewGuideLine = null;
      }

      const btnAdd = document.getElementById('btnToolbarAddVertex');
      if (btnAdd) btnAdd.classList.remove('active');
      const btnMove = document.getElementById('btnToggleMoveVertex');
      if (btnMove) btnMove.classList.add('active');
    }

    function handleAddVertexEscKey(e) {
      if (e.key === 'Escape' && isAddVertexOnEdgeMode) {
        stopAddVertexOnEdgeMode();
        showToast('Mode Tambah Patok dibatalkan.', 'info');
      }
    }

    function handleAddVertexMouseMove(e) {
      if (!isAddVertexOnEdgeMode || !map) return;
      const best = findClosestPolygonEdge(e.latlng);
      if (!best) return;

      if (!snapPreviewMarker) {
        const snapIcon = L.divIcon({
          className: 'snap-ghost-node',
          html: '<div style="width:16px;height:16px;background:#166534;border:2px solid #ffffff;border-radius:50%;box-shadow:0 0 0 2px #166534,0 4px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:11px;font-weight:900;line-height:1;">+</div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });
        snapPreviewMarker = L.marker(best.latLng, { icon: snapIcon, interactive: false, zIndexOffset: 3000 }).addTo(map);
      } else {
        snapPreviewMarker.setLatLng(best.latLng);
      }

      if (best.distancePx > 5) {
        const guideCoords = [e.latlng, best.latLng];
        if (!snapPreviewGuideLine) {
          snapPreviewGuideLine = L.polyline(guideCoords, {
            color: '#166534',
            weight: 1.5,
            dashArray: '3, 4',
            opacity: 0.7,
            interactive: false
          }).addTo(map);
        } else {
          snapPreviewGuideLine.setLatLngs(guideCoords);
        }
      } else if (snapPreviewGuideLine) {
        map.removeLayer(snapPreviewGuideLine);
        snapPreviewGuideLine = null;
      }
    }

    function handleAddVertexMapClick(e) {
      if (!isAddVertexOnEdgeMode) return;
      L.DomEvent.stopPropagation(e);

      const best = findClosestPolygonEdge(e.latlng);
      if (!best) {
        showToast('Garis batas bidang tidak ditemukan.', 'warn');
        stopAddVertexOnEdgeMode();
        return;
      }

      isGeometryManuallyEdited = true;
      const newPt = { lat: best.latLng.lat, lng: best.latLng.lng };
      best.partList.splice(best.segIdx + 1, 0, newPt);
      if (best.partList === activeVertices || !activeMultiParts || activeMultiParts.length <= 1) {
        activeVertices = best.partList;
      }

      stopAddVertexOnEdgeMode();
      renderCanvasPolygon(true);
      showToast('Patok baru berhasil ditambahkan pada garis batas bidang.', 'success');
    }

    function addVertexBetween(pIdx, iFrom, iTo) {
      if (map) map.closePopup();
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      const targetPart = parts[pIdx];
      if (!targetPart) return;

      const pA = targetPart[iFrom];
      const pB = targetPart[iTo];
      if (!pA || !pB) return;

      const midLat = (pA.lat + pB.lat) / 2;
      const midLng = (pA.lng + pB.lng) / 2;
      const newPt = { lat: midLat, lng: midLng };

      isGeometryManuallyEdited = true;
      if (iFrom < iTo) {
        targetPart.splice(iFrom + 1, 0, newPt);
      } else {
        targetPart.push(newPt);
      }

      if (targetPart === activeVertices || !activeMultiParts || activeMultiParts.length <= 1) {
        activeVertices = targetPart;
      }

      renderCanvasPolygon(true);
      showToast('Patok baru berhasil ditambahkan di antara dua titik batas.', 'success');
    }

    function openEditVertexModal(pIdx, vIdx) {
      if (map) map.closePopup();
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      const targetPart = parts[pIdx];
      if (!targetPart || !targetPart[vIdx]) return;

      const v = targetPart[vIdx];
      const pfx = parts.length > 1 ? (['A','B','C','D','E','F'][pIdx] || `P${pIdx+1}`) : 'P';
      const nodeLabel = parts.length > 1 ? `${pfx}${vIdx + 1}` : `P${vIdx + 1}`;

      const elModal = document.getElementById('modalEditVertex');
      const elTitle = document.getElementById('editVertexModalTitle');
      const elPart = document.getElementById('editVertexPartIdx');
      const elPoint = document.getElementById('editVertexPointIdx');
      const elLat = document.getElementById('inputEditVertexLat');
      const elLng = document.getElementById('inputEditVertexLng');
      const elUtm = document.getElementById('editVertexUtmHint');

      if (elTitle) elTitle.innerText = `EDIT KOORDINAT PATOK ${nodeLabel}`;
      if (elPart) elPart.value = pIdx;
      if (elPoint) elPoint.value = vIdx;
      if (elLat) elLat.value = v.lat.toFixed(8);
      if (elLng) elLng.value = v.lng.toFixed(8);

      if (elUtm) {
        const utm = (typeof getUtmCoordinates === 'function') ? getUtmCoordinates(v.lat, v.lng) : null;
        elUtm.innerText = utm ? `UTM: X=${utm.easting.toFixed(2)} | Y=${utm.northing.toFixed(2)} (${utm.zone})` : '-';
      }

      if (elModal) elModal.style.display = 'flex';
    }

    function closeEditVertexModal() {
      const elModal = document.getElementById('modalEditVertex');
      if (elModal) elModal.style.display = 'none';
    }

    function saveEditedVertexCoords() {
      const elPart = document.getElementById('editVertexPartIdx');
      const elPoint = document.getElementById('editVertexPointIdx');
      const elLat = document.getElementById('inputEditVertexLat');
      const elLng = document.getElementById('inputEditVertexLng');

      const pIdx = parseInt(elPart?.value || '0', 10);
      const vIdx = parseInt(elPoint?.value || '0', 10);
      const newLat = parseFloat(elLat?.value);
      const newLng = parseFloat(elLng?.value);

      if (isNaN(newLat) || isNaN(newLng) || newLat < -90 || newLat > 90 || newLng < -180 || newLng > 180) {
        showToast('Koordinat Latitude atau Longitude tidak valid.', 'crimson');
        return;
      }

      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      const targetPart = parts[pIdx];
      if (!targetPart || !targetPart[vIdx]) {
        closeEditVertexModal();
        return;
      }

      targetPart[vIdx] = { lat: newLat, lng: newLng };
      if (targetPart === activeVertices || !activeMultiParts || activeMultiParts.length <= 1) {
        activeVertices[vIdx] = { lat: newLat, lng: newLng };
      }

      isGeometryManuallyEdited = true;
      closeEditVertexModal();
      renderCanvasPolygon(true);
      showToast('Koordinat patok berhasil diperbarui.', 'success');
    }

    const inputEditLatEl = document.getElementById('inputEditVertexLat');
    const inputEditLngEl = document.getElementById('inputEditVertexLng');
    function updateEditModalUtm() {
      const lat = parseFloat(inputEditLatEl?.value);
      const lng = parseFloat(inputEditLngEl?.value);
      const elUtm = document.getElementById('editVertexUtmHint');
      if (!isNaN(lat) && !isNaN(lng) && elUtm && typeof getUtmCoordinates === 'function') {
        const utm = getUtmCoordinates(lat, lng);
        elUtm.innerText = `UTM: X=${utm.easting.toFixed(2)} | Y=${utm.northing.toFixed(2)} (${utm.zone})`;
      }
    }
    if (inputEditLatEl) inputEditLatEl.addEventListener('input', updateEditModalUtm);
    if (inputEditLngEl) inputEditLngEl.addEventListener('input', updateEditModalUtm);

    window.startAddVertexOnEdgeMode = startAddVertexOnEdgeMode;
    window.stopAddVertexOnEdgeMode = stopAddVertexOnEdgeMode;
    window.addVertexBetween = addVertexBetween;
    window.openEditVertexModal = openEditVertexModal;
    window.closeEditVertexModal = closeEditVertexModal;
    window.saveEditedVertexCoords = saveEditedVertexCoords;

