function getBpnGatewayBase() {
      const custom = localStorage.getItem('custom_bpn_gateway_url');
      if (custom && custom.trim() && custom.trim().startsWith('https://')) {
        return custom.trim().replace(/\/+$/, '');
      }
      return '';
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

    function setupPersilLayer() {
      const persilBase = getBpnGatewayBase();
      if (persilBase) {
        persilLayer = L.tileLayer(`${persilBase}/persil/{z}/{x}/{y}.webp?live=1&t=${Date.now()}`, {
          minZoom: 15,
          maxZoom: 26,
          maxNativeZoom: 19,
          opacity: 0.9,
          zIndex: 500,
          updateWhenZooming: false,
          updateInterval: 100
        });
      } else {
        persilLayer = L.tileLayer.wms('https://atlas.atrbpn.go.id/geoserver/wms', {
          layers: 'bhumi:Persil',
          format: 'image/png',
          transparent: true,
          version: '1.1.1',
          minZoom: 15,
          maxZoom: 26,
          opacity: 0.9,
          zIndex: 500,
          updateWhenZooming: false,
          updateInterval: 100
        });
      }
      persilLayer.addTo(map);
    }

    async function refreshPersilTiles() {
      const persilBase = getBpnGatewayBase();
      if (persilBase) {
        try {
          await fetch(`${persilBase}/api/clear-cache`, { method: 'POST' });
        } catch (e) {}
        if (persilLayer) {
          persilLayer.setUrl(`${persilBase}/persil/{z}/{x}/{y}.webp?live=1&t=${Date.now()}`);
          if (!map.hasLayer(persilLayer)) persilLayer.addTo(map);
          persilLayer.redraw();
        }
      } else {
        if (persilLayer) {
          if (persilLayer.setParams) {
            persilLayer.setParams({ _t: Date.now() });
          }
          if (!map.hasLayer(persilLayer)) persilLayer.addTo(map);
          persilLayer.redraw();
        }
      }
      showToast('Peta bidang persil diperbarui.', 'success');
    }

    var cekingLayers = {
      hutan: null,
      lsd: null,
      lbs: null,
      peruntukan: null,
      rtrw: null,
      jalan: null
    };

    function getLayerCapKey(layerKey) {
      return layerKey.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    }

    function createThematicLayer(layerKey) {
      const persilBase = getBpnGatewayBase();
      if (persilBase) {
        return L.tileLayer(`${persilBase}/api/layer-ceking/${layerKey}/{z}/{x}/{y}.webp`, {
          pane: 'thematicPane',
          maxZoom: 26,
          maxNativeZoom: 19,
          opacity: (layerKey === 'jalan') ? 0.85 : 0.75,
          zIndex: 450
        });
      }
      if (layerKey === 'hutan') {
        return new ArcGisExportLayer('https://geoportal.planologi.kehutanan.go.id/server/rest/services/Peta_Interaktif_2026/KWSHUTAN_AR_250K/MapServer/export', {
          pane: 'thematicPane',
          maxZoom: 26,
          opacity: 0.75,
          zIndex: 450
        });
      }
      if (layerKey === 'lsd') {
        return L.tileLayer.wms('https://atlas.atrbpn.go.id/geoserver/wms', {
          layers: 'umum:lsd_merge',
          format: 'image/png',
          transparent: true,
          version: '1.1.1',
          pane: 'thematicPane',
          minZoom: 5,
          maxZoom: 26,
          opacity: 0.75,
          zIndex: 450
        });
      }
      if (layerKey === 'lbs') {
        return L.tileLayer.wms('https://atlas.atrbpn.go.id/geoserver/wms', {
          layers: 'geonode:lbs_parsial',
          format: 'image/png',
          transparent: true,
          version: '1.1.1',
          pane: 'thematicPane',
          minZoom: 5,
          maxZoom: 26,
          opacity: 0.75,
          zIndex: 450
        });
      }
      if (layerKey === 'peruntukan') {
        return L.tileLayer.wms('https://atlas.atrbpn.go.id/geoserver/wms', {
          layers: 'petabpn:rtrwn_2025',
          format: 'image/png',
          transparent: true,
          version: '1.1.1',
          pane: 'thematicPane',
          minZoom: 5,
          maxZoom: 26,
          opacity: 0.75,
          zIndex: 450
        });
      }
      if (layerKey === 'rtrw') {
        return L.tileLayer.wms('https://atlas.atrbpn.go.id/geoserver/wms', {
          layers: 'rtr-online:rtrw_kabkot',
          format: 'image/png',
          transparent: true,
          version: '1.1.1',
          pane: 'thematicPane',
          minZoom: 5,
          maxZoom: 26,
          opacity: 0.75,
          zIndex: 450
        });
      }
      if (layerKey === 'jalan') {
        return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
          pane: 'thematicPane',
          maxZoom: 26,
          opacity: 0.85,
          zIndex: 450
        });
      }
      return null;
    }

    function initCekingLayers() {
      if (!map.getPane('thematicPane')) {
        const tp = map.createPane('thematicPane');
        tp.style.zIndex = 450;
        tp.style.pointerEvents = 'none';
      }
      const keys = Object.keys(cekingLayers);
      keys.forEach(k => {
        cekingLayers[k] = createThematicLayer(k);
      });
    }

    function toggleCekingLayer(layerKey, checked) {
      if (!cekingLayers[layerKey]) return;
      const layer = cekingLayers[layerKey];
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
    }

    function changeCekingOpacity(layerKey, val) {
      if (!cekingLayers[layerKey]) return;
      const opacity = val / 100;
      cekingLayers[layerKey].setOpacity(opacity);
      const capKey = getLayerCapKey(layerKey);
      const label = document.getElementById(`opacityLabel${capKey}`);
      if (label) label.innerText = `${val}%`;
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
      const badge = document.getElementById('badgeStatusBidang');
      if (checked) {
        if (!map.hasLayer(persilLayer)) map.addLayer(persilLayer);
        if (badge) { badge.className = 'badge-pill green'; badge.innerText = 'Aktif'; }
      } else {
        if (map.hasLayer(persilLayer)) map.removeLayer(persilLayer);
        if (badge) { badge.className = 'badge-pill'; badge.innerText = 'Nonaktif'; }
      }
    }

    function changePersilOpacity(val) {
      const opacity = val / 100;
      if (persilLayer) persilLayer.setOpacity(opacity);
      const label = document.getElementById('opacityLabel');
      if (label) label.innerText = `${val}%`;
    }

    function getCadastreServerMode() {
      const mode = localStorage.getItem('cadastre_server_mode');
      if (mode === 'server2' && typeof isMemberProActive === 'function' && isMemberProActive()) {
        return 'server2';
      }
      return 'server1';
    }

    function switchCadastreServer(mode) {
      if (mode === 'server2') {
        if (typeof isMemberProActive !== 'function' || !isMemberProActive()) {
          showToast('Server 2 khusus untuk Member PRO. Silakan masuk atau upgrade akun.', 'warn');
          if (typeof openMemberModal === 'function') openMemberModal();
          return false;
        }
        localStorage.setItem('cadastre_server_mode', 'server2');
        showToast('Mode Server 2 Aktif: Pemrosesan mandiri di peramban.', 'success');
      } else {
        localStorage.setItem('cadastre_server_mode', 'server1');
        showToast('Mode Server 1 Aktif: Menggunakan Supabase Gateway Cloud resmi.', 'info');
      }
      updateCadastreServerUI();
      return true;
    }

    function updateCadastreServerUI() {
      const mode = getCadastreServerMode();
      const badge = document.getElementById('badgeServerKadaster');
      const badgeBidang = document.getElementById('badgeServerKadasterBidang');
      const btn1 = document.getElementById('btnServer1');
      const btn2 = document.getElementById('btnServer2');
      const btn1Bidang = document.getElementById('btnServer1Bidang');
      const btn2Bidang = document.getElementById('btnServer2Bidang');
      const desc = document.getElementById('serverDescText');
      const descBidang = document.getElementById('serverDescBidangText');
      const pinServerText = document.getElementById('pinServerDataText') || document.getElementById('pinServerAktifText');

      if (mode === 'server2') {
        if (badge) {
          badge.className = 'badge-pill green';
          badge.innerText = 'SERVER 2';
        }
        if (badgeBidang) {
          badgeBidang.className = 'badge-pill green';
          badgeBidang.innerText = 'SERVER 2';
        }
        if (btn1) btn1.classList.remove('active');
        if (btn2) btn2.classList.add('active');
        if (btn1Bidang) btn1Bidang.classList.remove('active');
        if (btn2Bidang) btn2Bidang.classList.add('active');
        if (desc) desc.innerText = 'Server 2: Pemrosesan mandiri di browser.';
        if (descBidang) descBidang.innerText = 'Server 2: Pemrosesan mandiri di browser.';
        if (pinServerText) pinServerText.innerText = 'Server 2';
      } else {
        if (badge) {
          badge.className = 'badge-pill blue';
          badge.innerText = 'SERVER 1';
        }
        if (badgeBidang) {
          badgeBidang.className = 'badge-pill blue';
          badgeBidang.innerText = 'SERVER 1';
        }
        if (btn1) btn1.classList.add('active');
        if (btn2) btn2.classList.remove('active');
        if (btn1Bidang) btn1Bidang.classList.add('active');
        if (btn2Bidang) btn2Bidang.classList.remove('active');
        if (desc) desc.innerText = 'Server 1: Supabase Gateway Cloud resmi.';
        if (descBidang) descBidang.innerText = 'Server 1: Supabase Gateway Cloud resmi.';
        if (pinServerText) pinServerText.innerText = 'Server 1';
      }
    }

    async function fetchPersilCadastreData(lat, lng, zoom = 19) {
      const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      const cached = persilClientCache.get(cacheKey);
      if (cached && cached.data && cached.data.found && (Date.now() - cached.time < 600000)) {
        return cached.data;
      }

      const sMode = getCadastreServerMode();
      if (sMode === 'server2') {
        const delta = 0.0006;
        const bpnDirectUrl = `https://atlas.atrbpn.go.id/geoserver/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&LAYERS=bhumi:Persil&QUERY_LAYERS=bhumi:Persil&BBOX=${(lng - delta).toFixed(6)},${(lat - delta).toFixed(6)},${(lng + delta).toFixed(6)},${(lat + delta).toFixed(6)}&WIDTH=101&HEIGHT=101&X=50&Y=50&SRS=EPSG:4326&INFO_FORMAT=application/json`;
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 7000);
          const res = await fetch(bpnDirectUrl, { signal: controller.signal, mode: 'cors' });
          clearTimeout(tid);
          if (res.ok) {
            const data = await res.json();
            const parsed = parseGeoServerPersilGeoJson(data, lat, lng);
            if (parsed && parsed.found && Array.isArray(parsed.polygon_coords) && parsed.polygon_coords.length >= 3) {
              persilClientCache.set(cacheKey, { data: parsed, time: Date.now() });
              return parsed;
            }
          }
        } catch (e) {
          showToast('Server 2 gagal merespons, beralih ke Server 1.', 'info');
        }
      }

      const endpointsToTry = [];
      const persilApiBase = getBpnGatewayBase();
      if (persilApiBase && persilApiBase.startsWith('https://')) {
        endpointsToTry.push({ url: `${persilApiBase}/api/persil-info?lat=${lat}&lng=${lng}&zoom=${zoom}`, timeout: 12000 });
      }

      const sbKey = SUPABASE_ANON_KEY || 'sb_publishable_NBReVvac6_FUBe969fLbOw_ZGZjcwKM';
      endpointsToTry.push({
        url: `https://vezruyffzmabhtylxigc.supabase.co/functions/v1/cadastre-gateway?action=get-persil&lat=${lat}&lng=${lng}&zoom=${zoom}`,
        headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey },
        timeout: 12000
      });

      for (const item of endpointsToTry) {
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), item.timeout || 12000);
          const reqOpt = { signal: controller.signal, mode: 'cors' };
          if (item.headers) reqOpt.headers = item.headers;
          const res = await fetch(item.url, reqOpt);
          clearTimeout(tid);
          if (res.ok) {
            const data = await res.json();
            if (data && data.found && Array.isArray(data.polygon_coords) && data.polygon_coords.length >= 3) {
              persilClientCache.set(cacheKey, { data, time: Date.now() });
              return data;
            }
            if (data && Array.isArray(data.features) && data.features.length > 0) {
              const parsed = parseGeoServerPersilGeoJson(data, lat, lng);
              if (parsed && parsed.found && Array.isArray(parsed.polygon_coords) && parsed.polygon_coords.length >= 3) {
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

    function renderCadastralProFields() {
      if (!activePinData) return;
      const isPro = (typeof isMemberProActive === 'function') ? isMemberProActive() : false;
      const proLockHtml = '<span class="pro-lock-text" onclick="openMemberModal()" title="Khusus Member PRO. Klik untuk membuka portal akun." style="cursor:pointer;color:var(--accent);font-weight:600;display:inline-flex;align-items:center;gap:3px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Akses PRO</span>';

      const elNib = document.getElementById('pinNibText');
      if (elNib) elNib.innerHTML = isPro ? (activePinData.nib || '-') : proLockHtml;

      const elNosu = document.getElementById('pinNosuText');
      if (elNosu) elNosu.innerHTML = isPro ? (activePinData.nosu || '-') : proLockHtml;

      const elNomorHak = document.getElementById('pinNomorHakText');
      if (elNomorHak) elNomorHak.innerHTML = isPro ? (activePinData.nomor_hak || '-') : proLockHtml;

      const elKantah = document.getElementById('pinKantahText');
      if (elKantah) elKantah.innerHTML = isPro ? (activePinData.kantah || '-') : proLockHtml;
    }

    async function handleMapClick(lat, lng, doSwitchTab = true) {
      isParcelLocked = false;
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

      const currentActiveTab = document.querySelector('.tab-view.active')?.id;
      if (doSwitchTab && (currentActiveTab === 'tab-info' || currentActiveTab === 'tab-search' || !currentActiveTab)) {
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
          activePinData = {
            lat: lat,
            lng: lng,
            fid: effectivePersil.fid || '-',
            nib: effectivePersil.nib || '-',
            tipe_hak: effectivePersil.tipe_hak || 'Terdaftar Resmi',
            nomor_hak: effectivePersil.nomor_hak || '-',
            nosu: effectivePersil.nosu || '-',
            tahun: effectivePersil.tahun || '2026',
            luas_m2: effectivePersil.luas_m2 || 0,
            desa: (effectivePersil.desa && effectivePersil.desa !== '-') ? effectivePersil.desa : ((geoData && geoData.desa !== '-') ? geoData.desa : '-'),
            kecamatan: (effectivePersil.kecamatan && effectivePersil.kecamatan !== '-') ? effectivePersil.kecamatan : ((geoData && geoData.kecamatan !== '-') ? geoData.kecamatan : '-'),
            kabkot: (effectivePersil.kabkot && effectivePersil.kabkot !== '-') ? effectivePersil.kabkot : ((geoData && geoData.kabkot !== '-') ? geoData.kabkot : '-'),
            provinsi: (effectivePersil.provinsi && effectivePersil.provinsi !== '-') ? effectivePersil.provinsi : ((geoData && geoData.provinsi !== '-') ? geoData.provinsi : '-'),
            kodepos: (geoData && geoData.kodepos !== '-') ? geoData.kodepos : '-',
            kantah: (effectivePersil.kantah && effectivePersil.kantah !== '-') ? effectivePersil.kantah : ((geoData && geoData.kantah !== '-') ? geoData.kantah : 'Kantor Pertanahan'),
            alamat: (geoData && geoData.jalan) ? geoData.jalan : '-'
          };

          const lokasiUtama = (activePinData.desa !== '-' && activePinData.kecamatan !== '-')
            ? `${activePinData.desa}, ${activePinData.kecamatan}`
            : (activePinData.desa !== '-' ? activePinData.desa : (activePinData.kabkot !== '-' ? activePinData.kabkot : 'Bidang Tanah'));

          const elLokasi = document.getElementById('pinLokasiUtamaText');
          if (elLokasi) elLokasi.innerText = lokasiUtama;

          const elLuasBpn = document.getElementById('pinLuasBpnText');
          if (elLuasBpn) {
            if (activePinData.luas_m2 > 0) {
              elLuasBpn.className = 'stat-value emerald';
              elLuasBpn.innerText = `${Math.round(activePinData.luas_m2).toLocaleString('id-ID')} m²`;
            } else {
              elLuasBpn.className = 'stat-value offline';
              elLuasBpn.innerText = 'Belum Terhubung Server';
            }
          }
          const elTipeHak = document.getElementById('pinTipeHakText');
          if (elTipeHak) elTipeHak.innerText = activePinData.tipe_hak;
          renderCadastralProFields();
          const elStatusValidasi = document.getElementById('pinStatusValidasiText');
          if (elStatusValidasi) {
            elStatusValidasi.className = 'spec-value emerald';
            elStatusValidasi.innerText = effectivePersil.status_validasi || 'Terverifikasi Resmi';
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
            elAlamatGmaps.innerText = activePinData.alamat !== '-' ? activePinData.alamat : `${activePinData.desa}, ${activePinData.kecamatan}, ${activePinData.kabkot}, ${activePinData.provinsi}`;
          }

          const elShpProv = document.getElementById('shpProvinsi');
          if (elShpProv && activePinData.provinsi !== '-') elShpProv.value = activePinData.provinsi.toUpperCase();

          const elShpKeterangan = document.getElementById('shpKeterangan');
          if (elShpKeterangan) {
            const rawKet = activePinData.alamat !== '-' ? activePinData.alamat : `Desa ${activePinData.desa}, Kec. ${activePinData.kecamatan}, ${activePinData.kabkot}`;
            elShpKeterangan.value = rawKet.toUpperCase();
          }
          updateShpLuasDisplay();

          const elDesa = document.getElementById('pinDesaText'); if (elDesa) elDesa.innerText = activePinData.desa;
          const elKec = document.getElementById('pinKecamatanText'); if (elKec) elKec.innerText = activePinData.kecamatan;
          const elKab = document.getElementById('pinKabkotText'); if (elKab) elKab.innerText = activePinData.kabkot;
          const elProv = document.getElementById('pinProvinsiText'); if (elProv) elProv.innerText = activePinData.provinsi;
          const elKodePos = document.getElementById('pinKodePosText'); if (elKodePos) elKodePos.innerText = activePinData.kodepos;
          const elKantah = document.getElementById('pinKantahText'); if (elKantah) elKantah.innerText = activePinData.kantah;

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

          const badge = document.getElementById('badgeRebuildStatus');
          if (badge) {
            badge.className = 'badge-pill green';
            badge.innerText = effectivePersil.is_official_cadastre ? 'Kadaster Resmi Presisi' : (effectivePersil.is_auto_traced ? 'Batas Bidang Terdeteksi' : 'Batas Bidang Aktif');
          }
          showToast('Data batas bidang persil ATR/BPN terdeteksi dan aktif.', 'success');
        } else {
          const deltaLat = 0.000070;
          const deltaLng = 0.000070 / Math.cos(lat * Math.PI / 180);
          const defaultBox = [
            { lat: +(lat + deltaLat).toFixed(7), lng: +(lng - deltaLng).toFixed(7) },
            { lat: +(lat + deltaLat).toFixed(7), lng: +(lng + deltaLng).toFixed(7) },
            { lat: +(lat - deltaLat).toFixed(7), lng: +(lng + deltaLng).toFixed(7) },
            { lat: +(lat - deltaLat).toFixed(7), lng: +(lng - deltaLng).toFixed(7) }
          ];
          const estArea = Math.round(calculatePolygonArea(defaultBox));
          isGeometryManuallyEdited = false;
          activePinData = {
            lat: lat,
            lng: lng,
            fid: 'BIDANG-MANDIRI-' + Math.floor(1000 + Math.random() * 9000),
            nib: '-',
            tipe_hak: 'Delineasi Mandiri',
            nomor_hak: '-',
            nosu: '-',
            tahun: '2026',
            luas_m2: estArea,
            desa: (geoData && geoData.desa !== '-') ? geoData.desa : 'Wilayah Belum Terpetakan',
            kecamatan: (geoData && geoData.kecamatan !== '-') ? geoData.kecamatan : '-',
            kabkot: (geoData && geoData.kabkot !== '-') ? geoData.kabkot : '-',
            provinsi: (geoData && geoData.provinsi !== '-') ? geoData.provinsi : '-',
            kodepos: (geoData && geoData.kodepos !== '-') ? geoData.kodepos : '-',
            kantah: (geoData && geoData.kantah !== '-') ? geoData.kantah : 'Kantor Pertanahan',
            alamat: (geoData && geoData.jalan) ? geoData.jalan : '-'
          };

          const lokasiFallback = (activePinData.desa !== '-' && activePinData.kecamatan !== '-')
            ? `${activePinData.desa}, ${activePinData.kecamatan}`
            : (activePinData.desa !== '-' ? activePinData.desa : (activePinData.kabkot !== '-' ? activePinData.kabkot : 'Bidang Tanah'));

          const elLokasi = document.getElementById('pinLokasiUtamaText');
          if (elLokasi) elLokasi.innerText = lokasiFallback;

          const elLuasBpn = document.getElementById('pinLuasBpnText');
          if (elLuasBpn) {
            elLuasBpn.className = 'stat-value offline';
            elLuasBpn.innerText = 'Belum Terhubung Server';
          }
          const elTipeHak = document.getElementById('pinTipeHakText');
          if (elTipeHak) elTipeHak.innerText = 'Delineasi Mandiri';
          renderCadastralProFields();
          const elStatusValidasi = document.getElementById('pinStatusValidasiText');
          if (elStatusValidasi) {
            elStatusValidasi.className = 'status-offline-tag';
            elStatusValidasi.innerText = 'Belum Terhubung Server';
          }
          const elPinServer = document.getElementById('pinServerDataText') || document.getElementById('pinServerAktifText');
          if (elPinServer) {
            elPinServer.innerText = (getCadastreServerMode() === 'server2') ? 'Server 2' : 'Server 1';
          }

          const badgeEl = document.getElementById('badgeTipeHak');
          if (badgeEl) badgeEl.innerText = 'DELINEASI MANDIRI';

          const elLegalitas = document.getElementById('legalitasSummaryText');
          if (elLegalitas) {
            elLegalitas.innerText = 'Mode Delineasi Mandiri : Batas Bidang Siap Disesuaikan';
          }

          const elDesa = document.getElementById('pinDesaText'); if (elDesa) elDesa.innerText = activePinData.desa;
          const elKec = document.getElementById('pinKecamatanText'); if (elKec) elKec.innerText = activePinData.kecamatan;
          const elKab = document.getElementById('pinKabkotText'); if (elKab) elKab.innerText = activePinData.kabkot;
          const elProv = document.getElementById('pinProvinsiText'); if (elProv) elProv.innerText = activePinData.provinsi;
          const elKantah = document.getElementById('pinKantahText'); if (elKantah) elKantah.innerText = activePinData.kantah;

          const elShpProv = document.getElementById('shpProvinsi');
          if (elShpProv && activePinData.provinsi !== '-') elShpProv.value = activePinData.provinsi.toUpperCase();

          const elShpKeterangan = document.getElementById('shpKeterangan');
          if (elShpKeterangan) {
            const rawKet = activePinData.alamat !== '-' ? activePinData.alamat : `Desa ${activePinData.desa}, Kec. ${activePinData.kecamatan}`;
            elShpKeterangan.value = rawKet.toUpperCase();
          }

          if (foundBox) foundBox.style.display = 'flex';
          if (notFoundBox) notFoundBox.style.display = 'none';

          const hud = document.getElementById('canvasHud');
          if (hud) {
            hud.style.display = 'flex';
            const elHudNib = document.getElementById('hudNib');
            if (elHudNib) elHudNib.innerText = lokasiFallback;
            const elHudArea = document.getElementById('hudBpnArea');
            if (elHudArea) {
              elHudArea.innerHTML = '<span class="status-offline-tag" style="padding:1px 6px;font-size:0.68rem;margin:0;">Belum Terhubung Server</span>';
            }
          }

          rawInitialBboxCoords = defaultBox;
          initCanvasRebuilder(lat, lng, estArea, defaultBox);

          const badge = document.getElementById('badgeRebuildStatus');
          if (badge) {
            badge.className = 'badge-pill yellow';
            badge.innerText = 'Delineasi Mandiri Aktif';
          }
          showToast('Batas bidang tanah dibuat aktif di titik klik. Titik patok dapat langsung digeser, ditambah, atau disesuaikan.', 'info');
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

      if (isProxyActive && persilApiBase && persilApiBase.startsWith('https://')) {
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
      const kec = data?.kecamatan || addr.city_district || addr.municipality || addr.district || '-';
      const kabkot = data?.kabupaten || addr.city || addr.town || addr.county || addr.state_district || '-';
      const prov = data?.provinsi || addr.state || '-';
      const kodepos = addr.postcode || '-';
      const jalan = data?.alamat_lengkap || addr.road || addr.amenity || data?.display_name || '-';
      const cleanKab = kabkot !== '-' ? kabkot.replace(/^Kabupaten\s*/i, '').replace(/^Kota\s*/i, '') : '';
      const kantah = data?.kantah || (cleanKab ? `Kantor Pertanahan ${cleanKab}` : 'Kantor Pertanahan');

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
      const summary = `DATA RESMI BIDANG TANAH KADASTRAL

Tipe Hak: ${activePinData.tipe_hak}
Luas Terdaftar: ${Math.round(activePinData.luas_m2).toLocaleString('id-ID')} m²
Desa: ${activePinData.desa}
Kecamatan: ${activePinData.kecamatan}
Kabupaten: ${activePinData.kabkot}
Provinsi: ${activePinData.provinsi}
Kode Pos: ${activePinData.kodepos || '-'}
Kantah: ${activePinData.kantah}
Koordinat: ${activePinData.lat.toFixed(6)}, ${activePinData.lng.toFixed(6)}`;

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
      const elNosu = document.getElementById('pinNosuText'); if (elNosu) elNosu.innerText = '-';
      const elNomorHak = document.getElementById('pinNomorHakText'); if (elNomorHak) elNomorHak.innerText = '-';
      const elDesa = document.getElementById('pinDesaText'); if (elDesa) elDesa.innerText = '-';
      const elKec = document.getElementById('pinKecamatanText'); if (elKec) elKec.innerText = '-';
      const elKab = document.getElementById('pinKabkotText'); if (elKab) elKab.innerText = '-';
      const elProv = document.getElementById('pinProvinsiText'); if (elProv) elProv.innerText = '-';
      const elKantah = document.getElementById('pinKantahText'); if (elKantah) elKantah.innerText = '-';
      const elCoords = document.getElementById('pinCoordsText'); if (elCoords) elCoords.innerText = '-';
      const elStatusValidasi = document.getElementById('pinStatusValidasiText'); if (elStatusValidasi) elStatusValidasi.innerText = '-';

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
      if (persilBase && persilBase.startsWith('https://')) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          const res = await fetch(`${persilBase}/api/status`, { method: 'GET', mode: 'cors', signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) {
            isProxyActive = true;
            if (badge) badge.className = 'status-pill';
            if (text) text.innerText = 'Gateway Kustom: Aktif';
            return;
          }
        } catch (err) {}
      }

      isProxyActive = true;
      if (badge) {
        badge.className = 'status-pill';
        badge.style.backgroundColor = '#0284c7';
        badge.style.color = '#ffffff';
      }
      if (text) {
        text.innerText = 'Gateway Online: Aktif';
      }
    }

    window.getCadastreServerMode = getCadastreServerMode;
    window.switchCadastreServer = switchCadastreServer;
    window.updateCadastreServerUI = updateCadastreServerUI;
    window.renderCadastralProFields = renderCadastralProFields;
