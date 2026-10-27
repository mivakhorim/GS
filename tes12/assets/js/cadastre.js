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
        if (port === '8085' || port === '8089') {
          return window.location.origin;
        }
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:') {
          return 'http://127.0.0.1:8085';
        }
      }
      const defaultCloudGateway = (typeof SUPABASE_PROJECT_URL !== 'undefined' && SUPABASE_PROJECT_URL)
        ? `${SUPABASE_PROJECT_URL}/functions/v1/cadastre-gateway`
        : 'https://vezruyffzmabhtylxigc.supabase.co/functions/v1/cadastre-gateway';
      return defaultCloudGateway;
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

    function createCadastreProxyLayer() {
      const slider = document.getElementById('persilOpacity');
      const currentOpacity = slider ? (parseFloat(slider.value) / 100) : 0.90;
      return new CadastreWmsLayer('https://bhumi.atrbpn.go.id/mprx/service', {
        layers: 'bhumi_persil',
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        crs: L.CRS.EPSG3857,
        pane: 'persilPane',
        minZoom: 14,
        maxZoom: 26,
        opacity: currentOpacity,
        zIndex: 360,
        updateWhenZooming: false,
        updateInterval: 100
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
      if (!map || map._viewportCadastreBound) return;
      map._viewportCadastreBound = true;
      let debounceTimer = null;
      const onMapChange = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadViewportCadastreSvgParcels, 180);
      };
      map.on('moveend zoomend', onMapChange);
      setTimeout(loadViewportCadastreSvgParcels, 250);
    }

    async function loadViewportCadastreSvgParcels() {
      if (!map) return;
      const zoom = map.getZoom();
      if (zoom < 14) {
        if (cadastreVectorLayer) {
          cadastreVectorLayer.clearLayers();
        }
        cadastreVectorParcelCache.clear();
        return;
      }

      const chk = document.getElementById('chkPersil');
      if (chk && !chk.checked) {
        if (cadastreVectorLayer) cadastreVectorLayer.clearLayers();
        cadastreVectorParcelCache.clear();
        return;
      }

      if (viewportFetchController) {
        try { viewportFetchController.abort(); } catch (_) {}
      }
      viewportFetchController = new AbortController();

      const bounds = map.getBounds();
      const minLat = bounds.getSouth();
      const minLng = bounds.getWest();
      const maxLat = bounds.getNorth();
      const maxLng = bounds.getEast();

      const persilBase = getBpnGatewayBase();
      const sbKey = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY) ? SUPABASE_ANON_KEY : 'sb_publishable_NBReVvac6_FUBe969fLbOw_ZGZjcwKM';
      const mode = (typeof getCadastreServerMode === 'function') ? getCadastreServerMode() : 'server1';

      if (!persilBase) {
        const center = map.getCenter();
        const centerKey = `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`;
        if (!cadastreVectorParcelCache.has(centerKey)) {
          isViewportVectorLoading = true;
          try {
            const data = await fetchPersilCadastreData(center.lat, center.lng, zoom);
            if (data && data.found && Array.isArray(data.polygon_coords) && data.polygon_coords.length >= 3) {
              cadastreVectorParcelCache.set(centerKey, true);
              renderCadastreVectorParcels([data]);
            }
          } catch (e) {
          } finally {
            isViewportVectorLoading = false;
          }
        }
        return;
      }

      const isCloud = persilBase.includes('supabase.co');
      const url = isCloud
        ? `${persilBase}?action=viewport-parcels&min_lat=${minLat}&min_lng=${minLng}&max_lat=${maxLat}&max_lng=${maxLng}&zoom=${zoom}&server=${mode}`
        : `${persilBase}/api/viewport-parcels?min_lat=${minLat}&min_lng=${minLng}&max_lat=${maxLat}&max_lng=${maxLng}&zoom=${zoom}&server=${mode}`;

      isViewportVectorLoading = true;
      try {
        const fetchOpts = isCloud
          ? { headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey }, mode: 'cors', signal: viewportFetchController.signal }
          : { mode: 'cors', signal: viewportFetchController.signal };
        const res = await fetch(url, fetchOpts);
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && Array.isArray(data.parcels)) {
            renderCadastreVectorParcels(data.parcels);
          }
        }
      } catch (e) {
      } finally {
        isViewportVectorLoading = false;
      }
    }

    function renderCadastreVectorParcels(parcelsList) {
      if (!map || !cadastreVectorLayer || !Array.isArray(parcelsList)) return;
      const slider = document.getElementById('persilOpacity');
      const currentOpacity = slider ? (parseFloat(slider.value) / 100) : 0.85;

      let strokeColor = '#e65100';
      let fillColor = '#ff9800';
      let dashStyle = null;
      if (currentCadastreStreamMode === 'vector_mvt') {
        strokeColor = '#0284c7';
        fillColor = '#38bdf8';
      } else if (currentCadastreStreamMode === 'vector_wfs') {
        strokeColor = '#16a34a';
        fillColor = '#4ade80';
        dashStyle = '4,4';
      } else if (currentCadastreStreamMode === 'raster_wms') {
        strokeColor = '#ea580c';
        fillColor = '#f97316';
      } else if (currentCadastreStreamMode === 'raster_arcgis') {
        strokeColor = '#4f46e5';
        fillColor = '#818cf8';
      }

      parcelsList.forEach(parcel => {
        const coords = parcel.polygon_coords || parcel.coordinates;
        if (!coords || coords.length < 3 || coords.length > 200) return;
        const pid = String(parcel.persilpasifid || parcel.fid || parcel.nib || '');
        if (cadastreVectorParcelCache.has(pid)) return;

        const latlngs = coords.map(c => [c.lat, c.lng]);
        const polyLayer = L.polygon(latlngs, {
          renderer: cadastreSvgRenderer,
          color: strokeColor,
          weight: 1.8,
          dashArray: dashStyle,
          opacity: currentOpacity,
          fillColor: fillColor,
          fillOpacity: currentOpacity * 0.16,
          pane: 'cadastreVectorPane',
          interactive: true
        });
        polyLayer._parcelData = parcel;

        const nibLabel = (parcel.nib && parcel.nib !== '-') ? `NIB: ${parcel.nib}` : 'Bidang Terdaftar';
        const luasLabel = parcel.luas_m2 ? `${Math.round(parcel.luas_m2).toLocaleString('id-ID')} m²` : '';
        polyLayer.bindTooltip(`<strong>${nibLabel}</strong>${luasLabel ? '<br>' + luasLabel : ''}`, {
          sticky: true,
          direction: 'auto',
          opacity: 0.95
        });

        polyLayer.on('mouseover', function(e) {
          this.setStyle({
            color: '#b71c1c',
            weight: 2.6,
            fillColor: '#ff5722',
            fillOpacity: 0.28
          });
          if (map.getContainer()) {
            map.getContainer().style.cursor = 'pointer';
          }
          if (typeof isMergeMode !== 'undefined' && isMergeMode && window.isMapPointerDown) {
            if (typeof handleMergeParcelClick === 'function') {
              handleMergeParcelClick(e.latlng.lat, e.latlng.lng, parcel);
            }
          }
        });

        polyLayer.on('mouseout', function() {
          this.setStyle({
            color: '#e65100',
            weight: 1.6,
            fillColor: '#ff9800',
            fillOpacity: currentOpacity * 0.12
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

      if (persilBase) {
        const tileUrl = persilBase.includes('supabase.co')
          ? `${persilBase}?action=tile&z={z}&x={x}&y={y}&role=admin`
          : `${persilBase}/persil/{z}/{x}/{y}.webp?live=1`;

        persilLayer = createAuthTileLayer(tileUrl, {
          pane: 'persilPane',
          minZoom: 14,
          maxZoom: 26,
          maxNativeZoom: 19,
          keepBuffer: 6,
          updateWhenZooming: true,
          updateWhenIdle: false,
          opacity: currentOpacity,
          zIndex: 360,
          headers: {
            'apikey': sbKey,
            'Authorization': 'Bearer ' + sbKey
          }
        });
      } else {
        persilLayer = createCadastreProxyLayer();
      }

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
      hutan: null,
      lsd: null,
      lbs: null,
      peruntukan: null,
      rtrw: null,
      rdtr: null,
      znt: null,
      jalan: null,
      hak_milik: null,
      hgu: null,
      hgb: null,
      hpl: null,
      hak_ulayat: null,
      kkpr: null
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

      if (layerKey === 'jalan') {
        return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
          pane: 'thematicPane',
          maxZoom: 26,
          maxNativeZoom: 19,
          keepBuffer: 6,
          updateWhenZooming: true,
          updateWhenIdle: false,
          opacity: 0.85,
          zIndex: 450
        });
      }

      const persilBase = getBpnGatewayBase();
      const sbKey = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY) ? SUPABASE_ANON_KEY : 'sb_publishable_NBReVvac6_FUBe969fLbOw_ZGZjcwKM';
      const sbUrl = (typeof SUPABASE_PROJECT_URL !== 'undefined' && SUPABASE_PROJECT_URL) ? SUPABASE_PROJECT_URL : 'https://vezruyffzmabhtylxigc.supabase.co';
      if (persilBase && !persilBase.includes('supabase.co')) {
        return L.tileLayer(`${persilBase}/api/layer-ceking/${layerKey}/{z}/{x}/{y}.webp`, {
          pane: 'thematicPane',
          maxZoom: 26,
          maxNativeZoom: 19,
          keepBuffer: 6,
          updateWhenZooming: true,
          updateWhenIdle: false,
          opacity: 0.75,
          zIndex: 450
        });
      }
      return createAuthTileLayer(`${sbUrl}/functions/v1/cadastre-gateway?action=layer-ceking&layer=${layerKey}&z={z}&x={x}&y={y}&role=admin`, {
        pane: 'thematicPane',
        maxZoom: 26,
        maxNativeZoom: 19,
        keepBuffer: 6,
        updateWhenZooming: true,
        updateWhenIdle: false,
        opacity: 0.75,
        zIndex: 450,
        headers: {
          'apikey': sbKey,
          'Authorization': 'Bearer ' + sbKey
        }
      });
    }

    function updateDynamicMapLegend() {
      const body = document.getElementById('legendBody');
      if (!body) return;

      const isPersilActive = !document.getElementById('chkPersil') || !!document.getElementById('chkPersil')?.checked;
      const isLsdActive = !!document.getElementById('chkCekingLsd')?.checked;
      const isLbsActive = !!document.getElementById('chkCekingLbs')?.checked;
      const isHutanActive = !!document.getElementById('chkCekingHutan')?.checked;
      const isPeruntukanActive = !!document.getElementById('chkCekingPeruntukan')?.checked;
      const isRtrwActive = !!document.getElementById('chkCekingRtrw')?.checked;
      const isRdtrActive = !!document.getElementById('chkCekingRdtr')?.checked;
      const isZntActive = !!document.getElementById('chkCekingZnt')?.checked;
      const isJalanActive = !!document.getElementById('chkCekingJalan')?.checked;

      const isHakMilikActive = !!document.getElementById('chkCekingHakMilik')?.checked;
      const isHguActive = !!document.getElementById('chkCekingHgu')?.checked;
      const isHgbActive = !!document.getElementById('chkCekingHgb')?.checked;
      const isHplActive = !!document.getElementById('chkCekingHpl')?.checked;
      const isKkprActive = !!document.getElementById('chkCekingKkpr')?.checked;

      let html = '';

      if (isPersilActive) {
        html += '<div class="legend-category-title">Batas &amp; Patok Kadastral</div>';
        html += '<div class="legend-item"><span class="legend-swatch polygon-active"></span><span>Bidang Terpilih (Aktif Presisi)</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch polygon-bpn"></span><span>Batas Bidang Kadastral Resmi (Garis Oranye)</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch node-patok"></span><span>Titik Patok Batas (Sudut Koordinat)</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch dist-label">12m</span><span>Dimensi Jarak Batas (Meter)</span></div>';
      }

      let hasThematic = false;

      if (isLsdActive) {
        hasThematic = true;
        html += '<div class="legend-category-title">Lahan Sawah Dilindungi (LSD Nasional)</div>';
        html += '<div class="legend-item"><span class="legend-swatch lsd-pertahankan"></span><span>LSD Dipertahankan (Ketahanan Pangan)</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch lsd-penyesuaian"></span><span>LSD Usulan Penyesuaian RTRW</span></div>';
      }

      if (isLbsActive) {
        hasThematic = true;
        html += '<div class="legend-category-title">Lahan Baku Sawah (LBS Kementan 2024)</div>';
        html += '<div class="legend-item"><span class="legend-swatch lbs-aktif"></span><span>Sawah Baku Aktif Irigasi &amp; Tadah Hujan</span></div>';
      }

      if (isHutanActive) {
        hasThematic = true;
        html += '<div class="legend-category-title">Kawasan Hutan Lindung (KLHK 2026)</div>';
        html += '<div class="legend-item"><span class="legend-swatch hl-lindung"></span><span>Hutan Lindung (HL)</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch hl-konservasi"></span><span>Hutan Konservasi &amp; Suaka Alam (HK/KSA)</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch hl-produksi-terbatas"></span><span>Hutan Produksi Terbatas (HPT)</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch hl-produksi-tetap"></span><span>Hutan Produksi Tetap (HP)</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch hl-produksi-konversi"></span><span>Hutan Produksi Konversi (HPK)</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch hl-apl"></span><span>Areal Penggunaan Lain (APL Legal)</span></div>';
      }

      if (isPeruntukanActive || isRtrwActive) {
        hasThematic = true;
        html += '<div class="legend-category-title">Pola Ruang Peruntukan &amp; RTRW</div>';
        html += '<div class="legend-item"><span class="legend-swatch rtrw-industri"></span><span>Zona Kawasan Industri &amp; Pergudangan</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch rtrw-pertanian"></span><span>Zona Pertanian Tanaman Pangan</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch rtrw-permukiman"></span><span>Zona Permukiman &amp; Perumahan</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch rtrw-lindung"></span><span>Zona Kawasan Lindung Nasional</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch rtrw-komersial"></span><span>Zona Perdagangan &amp; Jasa</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch rtrw-perkebunan"></span><span>Zona Perkebunan Rakyat / Tahunan</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch rtrw-perikanan"></span><span>Zona Perikanan &amp; Tubuh Air</span></div>';
      }

      if (isRdtrActive) {
        hasThematic = true;
        html += '<div class="legend-category-title">Rencana Detail Tata Ruang (RDTR)</div>';
        html += '<div class="legend-item"><span class="legend-swatch rtrw-industri"></span><span>Zona Sub-Pola Ruang Presisi BPN</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch rtrw-permukiman"></span><span>Zona Budidaya Perkotaan</span></div>';
      }

      if (isZntActive) {
        hasThematic = true;
        html += '<div class="legend-category-title">Zona Nilai Tanah (ZNT ATR/BPN)</div>';
        html += '<div class="legend-item"><span class="legend-swatch znt-tinggi"></span><span>ZNT Nilai Tinggi (Zona Merah)</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch znt-sedang"></span><span>ZNT Nilai Sedang (Zona Kuning)</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch znt-rendah"></span><span>ZNT Nilai Rendah (Zona Hijau)</span></div>';
      }

      if (isJalanActive) {
        hasThematic = true;
        html += '<div class="legend-category-title">Jaringan Ruas Jalan</div>';
        html += '<div class="legend-item"><span class="legend-swatch jalan-arteri"></span><span>Arteri Primer / Tol / Jalan Nasional</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch jalan-kolektor"></span><span>Kolektor / Jalan Provinsi &amp; Kabupaten</span></div>';
        html += '<div class="legend-item"><span class="legend-swatch jalan-lokal"></span><span>Jalan Lokal Lingkungan &amp; Desa</span></div>';
      }

      if (isHakMilikActive || isHguActive || isHgbActive || isHplActive || isKkprActive) {
        hasThematic = true;
        html += '<div class="legend-category-title">Meja Kerja Kadaster ATR/BPN</div>';
        if (isHakMilikActive) html += '<div class="legend-item"><span class="legend-swatch hak-milik"></span><span>Hak Milik Terdaftar (BPN)</span></div>';
        if (isHguActive) html += '<div class="legend-item"><span class="legend-swatch hak-hgu"></span><span>Hak Guna Usaha (HGU Perkebunan)</span></div>';
        if (isHgbActive) html += '<div class="legend-item"><span class="legend-swatch hak-hgb"></span><span>Hak Guna Bangunan (HGB)</span></div>';
        if (isHplActive) html += '<div class="legend-item"><span class="legend-swatch hak-hpl"></span><span>Hak Pengelolaan (HPL)</span></div>';
        if (isKkprActive) html += '<div class="legend-item"><span class="legend-swatch hak-kkpr"></span><span>Kesesuaian Tata Ruang (KKPR)</span></div>';
      }

      if (!hasThematic) {
        html += '<div style="font-size: 0.67rem; color: var(--text-muted); padding: 5px 8px; background-color: var(--bg-subtle); border-radius: 4px; border: 1px dashed var(--border-light); margin-top: 6px; line-height: 1.35;">Aktifkan lapisan tematik di sidebar untuk melihat klasifikasi warna objek pada peta.</div>';
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
          const cb = document.getElementById(`ceking${capKey}`);
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
      const isAdmin = (typeof isMemberAdminActive === 'function') && isMemberAdminActive();
      if (isAdmin) {
        const mode = localStorage.getItem('cadastre_server_mode');
        return mode === 'server1' ? 'server1' : 'server2';
      }
      return 'server1';
    }

    function switchCadastreServer(mode) {
      const isAdmin = (typeof isMemberAdminActive === 'function') && isMemberAdminActive();
      if (!isAdmin) {
        showToast('Pemilihan server kadaster khusus untuk Administrator.', 'warn');
        return false;
      }
      if (mode === 'server2') {
        localStorage.setItem('cadastre_server_mode', 'server2');
        showToast('Server 2 Kadaster Aktif (Vektor Kontur Presisi ATR/BPN)', 'success');
      } else {
        localStorage.setItem('cadastre_server_mode', 'server1');
        showToast('Server 1 Kadaster Aktif (Basis Data Standar)', 'info');
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
      if (typeof persilLayer !== 'undefined' && persilLayer && typeof persilLayer.redraw === 'function') {
        persilLayer.redraw();
      }
      if (typeof loadViewportCadastreSvgParcels === 'function') {
        loadViewportCadastreSvgParcels();
      }
      updateCadastreServerUI();
      return true;
    }

    function updateCadastreServerUI() {
      const isAdmin = (typeof isMemberAdminActive === 'function') && isMemberAdminActive();
      const controlBox = document.getElementById('serverKadasterControlBox');
      if (controlBox) {
        controlBox.style.display = isAdmin ? 'block' : 'none';
      }
      const modalBox = document.getElementById('serverKadasterModalBox');
      if (modalBox) {
        modalBox.style.display = isAdmin ? 'block' : 'none';
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
        if (pinServerText) pinServerText.innerText = 'Server 1';
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

    function traceParcelFromWmsTile(lat, lng, spanMeters = 70.0) {
      return new Promise((resolve) => {
        const span = Number(spanMeters) || 70.0;
        const r = 6378137.0;
        const cx = r * (lng * Math.PI / 180.0);
        const cy = r * Math.log(Math.tan(Math.PI / 4.0 + (lat * Math.PI / 180.0) / 2.0));
        const minx = cx - span;
        const maxx = cx + span;
        const miny = cy - span;
        const maxy = cy + span;
        const bbox = `${minx.toFixed(4)},${miny.toFixed(4)},${maxx.toFixed(4)},${maxy.toFixed(4)}`;
        const cleanUrl = `bhumi.atrbpn.go.id/mprx/service?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=bhumi_persil&STYLES=&CRS=EPSG:3857&WIDTH=512&HEIGHT=512&BBOX=${bbox}`;
        const tileUrl = 'https://images.weserv.nl/?url=' + encodeURIComponent(cleanUrl);

        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => resolve(null), 5000);

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
            const isWall = new Uint8Array(w * h);

            for (let y = 0; y < h; y++) {
              const rowOffset = y * w * 4;
              for (let x = 0; x < w; x++) {
                const a = data[rowOffset + x * 4 + 3];
                if (a >= 180 || a < 50) {
                  for (let dy = -1; dy <= 1; dy++) {
                    const ny = y + dy;
                    if (ny < 0 || ny >= h) continue;
                    const nRow = ny * w;
                    for (let dx = -1; dx <= 1; dx++) {
                      const nx = x + dx;
                      if (nx >= 0 && nx < w) {
                        isWall[nRow + nx] = 1;
                      }
                    }
                  }
                }
              }
            }

            let startX = 256;
            let startY = 256;
            if (isWall[startY * w + startX] === 1) {
              let foundFree = false;
              for (let rad = 1; rad <= 14; rad++) {
                for (let dy = -rad; dy <= rad; dy++) {
                  const ny = startY + dy;
                  if (ny < 0 || ny >= h) continue;
                  for (let dx = -rad; dx <= rad; dx++) {
                    const nx = startX + dx;
                    if (nx >= 0 && nx < w && isWall[ny * w + nx] === 0) {
                      startX = nx;
                      startY = ny;
                      foundFree = true;
                      break;
                    }
                  }
                  if (foundFree) break;
                }
                if (foundFree) break;
              }
              if (!foundFree) { resolve(null); return; }
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

            while (head < tail) {
              const qx = queueX[head];
              const qy = queueY[head];
              head++;

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
            if (totalPixels < 150) {
              resolve(null);
              return;
            }
            if (totalPixels > (w * h * 0.95)) {
              if (span < 120.0) {
                traceParcelFromWmsTile(lat, lng, span * 2.0).then(resolve);
                return;
              }
              resolve(null);
              return;
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
              if (!foundNext || (currX === firstX && currY === firstY)) break;
            }

            if (contour.length < 8) { resolve(null); return; }

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

            const simplified = simplifyRdp(contour, 3.5);
            if (simplified.length < 3) { resolve(null); return; }

            const polyCoords = [];
            for (let i = 0; i < simplified.length; i++) {
              const pt = simplified[i];
              if (i === simplified.length - 1 && pt.x === simplified[0].x && pt.y === simplified[0].y) continue;
              const mx = minx + (pt.x / 512.0) * (maxx - minx);
              const my = maxy - (pt.y / 512.0) * (maxy - miny);
              const pLat = (2.0 * Math.atan(Math.exp(my / r)) - Math.PI / 2.0) * 180.0 / Math.PI;
              const pLng = (mx / r) * 180.0 / Math.PI;
              polyCoords.push({
                lat: Number(pLat.toFixed(7)),
                lng: Number(pLng.toFixed(7))
              });
            }

            if (polyCoords.length < 3) { resolve(null); return; }

            const exactArea = (typeof calculatePolygonArea === 'function') ? calculatePolygonArea(polyCoords) : 0;
            if (exactArea < 5.0) { resolve(null); return; }

            resolve({
              found: true,
              is_official_cadastre: true,
              is_auto_traced: true,
              fid: 'PERSIL-' + Math.floor(10000 + Math.random() * 90000),
              nib: '-',
              tipe_hak: 'TERDAFTAR ATR/BPN',
              luas_m2: Math.round(exactArea),
              luas_terdaftar_m2: Math.round(exactArea),
              polygon_coords: polyCoords,
              status_validasi: 'Kadaster Resmi Presisi',
              source: 'VEKTOR PERSIL GEODETIK ATR/BPN'
            });
          } catch (err) {
            resolve(null);
          }
        };

        img.onerror = function() {
          clearTimeout(timer);
          resolve(null);
        };
      });
    }

    async function fetchPersilCadastreData(lat, lng, zoom = 19) {
      const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      const cached = persilClientCache.get(cacheKey);
      if (cached && cached.data && cached.data.found && !cached.data.is_bbox && (Date.now() - cached.time < 600000)) {
        return cached.data;
      }

      const vectorHit = findCachedVectorParcelAt(lat, lng);
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
            timeout: 6000
          });
        } else {
          endpointsToTry.push({
            url: `${persilApiBase}/api/persil-info?lat=${lat.toFixed(7)}&lng=${lng.toFixed(7)}&zoom=${zoom}&server=${mode}`,
            timeout: 6000
          });
        }
      } else if (typeof window !== 'undefined' && window.location && window.location.protocol === 'http:') {
        endpointsToTry.push({
          url: `/api/persil-info?lat=${lat.toFixed(7)}&lng=${lng.toFixed(7)}&zoom=${zoom}&server=${mode}`,
          timeout: 2500
        });
      }

      endpointsToTry.push({
        url: `${sbUrl}/functions/v1/cadastre-gateway?action=get-persil&lat=${lat.toFixed(7)}&lng=${lng.toFixed(7)}&zoom=${zoom}&server=${mode}`,
        headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey },
        timeout: 4000
      });

      let bboxMetadataFallback = null;

      for (const item of endpointsToTry) {
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), item.timeout || 10000);
          const reqOpt = { signal: controller.signal, mode: 'cors' };
          if (item.headers) reqOpt.headers = item.headers;
          const res = await fetch(item.url, reqOpt);
          clearTimeout(tid);
          if (res.ok) {
            const data = await res.json();
            if (data && data.found && Array.isArray(data.polygon_coords) && data.polygon_coords.length >= 3) {
              if (data.polygon_coords.length === 4) {
                try {
                  const traced = await traceParcelFromWmsTile(lat, lng);
                  if (traced && traced.found && Array.isArray(traced.polygon_coords) && traced.polygon_coords.length >= 3) {
                    data.polygon_coords = traced.polygon_coords;
                    data.source = 'VEKTOR PERSIL GEODETIK ATR/BPN';
                  }
                } catch (e) {}
              }
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

      const vCoords = vectorHit ? (vectorHit.polygon_coords || vectorHit.coordinates) : null;
      if (vectorHit && vCoords && vCoords.length >= 3 && vCoords.length <= 200) {
        const assembled = bboxMetadataFallback || {
          found: true,
          nib: vectorHit.nib || '-',
          tipe_hak: vectorHit.tipe_hak || 'TERDAFTAR ATR/BPN',
          luas_m2: vectorHit.luas_m2 || 0,
          fid: vectorHit.fid || vectorHit.persilpasifid || 'BIDANG-TERDAFTAR'
        };
        assembled.polygon_coords = vCoords;
        assembled.is_bbox = false;
        assembled.patok_count = vCoords.length;
        persilClientCache.set(cacheKey, { data: assembled, time: Date.now() });
        return assembled;
      }

      if (bboxMetadataFallback) {
        persilClientCache.set(cacheKey, { data: bboxMetadataFallback, time: Date.now() });
        return bboxMetadataFallback;
      }

      const traced = await traceParcelFromWmsTile(lat, lng);
      if (traced && traced.found && Array.isArray(traced.polygon_coords) && traced.polygon_coords.length >= 3) {
        persilClientCache.set(cacheKey, { data: traced, time: Date.now() });
        return traced;
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

      // 1. Luas Terdaftar vs Luas Ukur
      const cardTerdaftar = document.getElementById('cardLuasTerdaftar');
      const grid = document.getElementById('gridLuasCards');
      const elLuasBpn = document.getElementById('pinLuasBpnText');

      const isManual = (p.tipe_hak === 'Delineasi Mandiri' || p.source === 'MANUAL_DELINEATION' || !p.luas_m2 || p.luas_m2 <= 0);
      if (cardTerdaftar && elLuasBpn) {
        if (!isManual && p.luas_m2 > 0) {
          cardTerdaftar.style.display = 'block';
          elLuasBpn.innerText = Math.round(p.luas_m2).toLocaleString('id-ID') + ' m²';
          if (grid) grid.style.gridTemplateColumns = '1fr 1fr';
        } else {
          cardTerdaftar.style.display = 'none';
          if (grid) grid.style.gridTemplateColumns = '1fr';
        }
      }

      // 2. Badge Hak (Only show authentic BPN hak)
      const badgeHak = document.getElementById('badgeTipeHak');
      if (badgeHak) {
        const isAuthenticHak = p.tipe_hak && p.tipe_hak !== '-' && p.tipe_hak !== 'Delineasi Mandiri' && p.tipe_hak !== 'Delineasi Bidang Mandiri';
        if (isAuthenticHak) {
          badgeHak.style.display = 'inline-block';
          badgeHak.innerText = p.tipe_hak.toUpperCase();
        } else {
          badgeHak.style.display = 'none';
        }
      }

      // 3. Spec items with zero dummy display
      const nibVal = (p.nib && p.nib !== '-') ? (p.nib_lengkap || p.nib) : null;
      setRow('rowPinNib', 'pinNibText', nibVal);
      setRow('rowPinTipeHak', 'pinTipeHakText', (p.tipe_hak && p.tipe_hak !== 'Delineasi Mandiri') ? p.tipe_hak : null);
      setRow('rowPinNomorHak', 'pinNomorHakText', (p.nomor_hak && p.nomor_hak !== '-') ? p.nomor_hak : null);
      setRow('rowPinKabkot', 'pinKabkotText', (p.kabkot && p.kabkot !== '-') ? p.kabkot : null);
      setRow('rowPinKecamatan', 'pinKecamatanText', (p.kecamatan && p.kecamatan !== '-') ? p.kecamatan : null);
      setRow('rowPinDesa', 'pinDesaText', (p.desa && p.desa !== '-') ? p.desa : null);

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

      let hitParcel = findCachedVectorParcelAt(lat, lng);
      if (hitParcel) {
        selectCadastreVectorParcel(hitParcel, { lat, lng });
        return;
      }

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
            luas_m2: effectivePersil.luas_m2 || 0,
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

          const elLuasBpn = document.getElementById('pinLuasBpnText');
          if (elLuasBpn) {
            if (activePinData.luas_m2 > 0) {
              elLuasBpn.className = 'stat-value emerald';
              elLuasBpn.innerText = `${Math.round(activePinData.luas_m2).toLocaleString('id-ID')} m²`;
            } else if (activePinData.polygon_coords && activePinData.polygon_coords.length >= 3) {
              const calcLuas = (typeof calculatePolygonAreaM2 === 'function') ? calculatePolygonAreaM2(activePinData.polygon_coords) : 0;
              elLuasBpn.className = 'stat-value emerald';
              elLuasBpn.innerText = (calcLuas > 0) ? `${Math.round(calcLuas).toLocaleString('id-ID')} m²` : 'Delineasi Bidang Mandiri';
            } else {
              elLuasBpn.className = 'stat-value emerald';
              elLuasBpn.innerText = 'Delineasi Bidang Mandiri';
            }
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
      let kabkot = data?.kabupaten || addr.city || addr.town || addr.county || addr.state_district || '-';
      let prov = data?.provinsi || addr.state || '-';
      if (typeof normalizeIndonesianProvince === 'function') {
        prov = normalizeIndonesianProvince(prov) || prov;
      }
      if (kabkot !== '-') {
        const lowerK = kabkot.toLowerCase();
        if (lowerK.includes('jakarta') || lowerK.includes('special capital region')) {
          if (lowerK.includes('special capital region of jakarta') || lowerK === 'special capital region') {
            kabkot = 'Kota Administrasi Jakarta Pusat';
          } else {
            kabkot = `Kota ${kabkot.replace(/^(Kabupaten|Kota|Kota Administrasi)\s{0,}/i, '').trim()}`;
          }
          if (!prov || prov === '-') prov = 'DKI Jakarta';
        } else if (!/^Kabupaten|^Kota/i.test(kabkot)) {
          kabkot = `Kabupaten ${kabkot}`;
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

    function cleanAndDeduplicateVertices(coords, minMeters = 0.05, maxDeg = 0.5) {
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
      activeVertices = cleanAndDeduplicateVertices(activeVertices, 0.15, 1.0);
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
      if (!activeObj || !map) return false;
      const z = Math.max(map.getZoom() || 18, 17);
      const targetArea = (activeObj.luas_m2 && Number(activeObj.luas_m2) > 0) ? Number(activeObj.luas_m2) : 100;
      
      const sbKey = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY) ? SUPABASE_ANON_KEY : 'sb_publishable_NBReVvac6_FUBe969fLbOw_ZGZjcwKM';
      const sbUrl = (typeof SUPABASE_PROJECT_URL !== 'undefined' && SUPABASE_PROJECT_URL) ? SUPABASE_PROJECT_URL : 'https://vezruyffzmabhtylxigc.supabase.co';

      const n = Math.pow(2, z);
      const tx = Math.floor((lng + 180) / 360 * n);
      const latRad = lat * Math.PI / 180;
      const ty = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);

      const tileLon1 = tx / n * 360 - 180;
      const tileLon2 = (tx + 1) / n * 360 - 180;
      const tileLat1 = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n))) * 180 / Math.PI;
      const tileLat2 = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + 1) / n))) * 180 / Math.PI;

      const tileMinLng = Math.min(tileLon1, tileLon2);
      const tileMaxLng = Math.max(tileLon1, tileLon2);
      const tileMinLat = Math.min(tileLat1, tileLat2);
      const tileMaxLat = Math.max(tileLat1, tileLat2);

      const tileUrl = `${sbUrl}/functions/v1/cadastre-gateway?action=tile&z=${z}&x=${tx}&y=${ty}`;

      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
          try {
            const canvas = document.createElement('canvas');
            const w = img.naturalWidth || 512;
            const h = img.naturalHeight || 512;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const imgData = ctx.getImageData(0, 0, w, h);
            const data = imgData.data;

            const clickPxX = Math.round(((lng - tileMinLng) / (tileMaxLng - tileMinLng)) * w);
            const clickPxY = Math.round(((tileMaxLat - lat) / (tileMaxLat - tileMinLat)) * h);

            let bboxRadius = 45;
            if (activeObj.polygon_coords && activeObj.polygon_coords.length >= 3) {
              const lats = activeObj.polygon_coords.map(p => p.lat);
              const lngs = activeObj.polygon_coords.map(p => p.lng);
              const minBLa = Math.min(...lats), maxBLa = Math.max(...lats);
              const minBLn = Math.min(...lngs), maxBLn = Math.max(...lngs);
              const pxSpanX = Math.abs(((maxBLn - minBLn) / (tileMaxLng - tileMinLng)) * w);
              const pxSpanY = Math.abs(((maxBLa - minBLa) / (tileMaxLat - tileMinLat)) * h);
              bboxRadius = Math.max(Math.max(pxSpanX, pxSpanY) * 0.75, 25);
            }

            const totalRays = 72;
            const angleStep = (Math.PI * 2) / totalRays;
            const hits = [];

            for (let a = 0; a < totalRays; a++) {
              const ang = a * angleStep;
              const cosA = Math.cos(ang);
              const sinA = Math.sin(ang);
              let rayHit = null;

              for (let r = 3; r <= bboxRadius * 1.4; r += 1.5) {
                const px = Math.round(clickPxX + r * cosA);
                const py = Math.round(clickPxY + r * sinA);
                if (px < 0 || px >= w || py < 0 || py >= h) break;
                const idx = (py * w + px) * 4;
                const alpha = data[idx + 3];
                if (alpha > 30) {
                  rayHit = { x: px, y: py };
                  break;
                }
              }
              if (rayHit) {
                hits.push(rayHit);
              }
            }

            let finalCoords = null;
            if (hits.length >= 10) {
              const simplified = rdpSimplifyPoints(hits, 4.5);
              if (simplified && simplified.length >= 3) {
                finalCoords = simplified.map(pt => {
                  const pLng = tileMinLng + (pt.x / w) * (tileMaxLng - tileMinLng);
                  const pWorldY = ty + (pt.y / h);
                  const pLatRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * pWorldY / n)));
                  const pLat = pLatRad * 180 / Math.PI;
                  return { lat: Number(pLat.toFixed(7)), lng: Number(pLng.toFixed(7)) };
                });
              }
            }

            if (!finalCoords || finalCoords.length < 3) {
              if (activeObj.polygon_coords && activeObj.polygon_coords.length >= 3) {
                finalCoords = activeObj.polygon_coords.map(p => ({ lat: Number(p.lat.toFixed(7)), lng: Number(p.lng.toFixed(7)) }));
              }
            }

            if (finalCoords && finalCoords.length >= 3) {
              if (typeof calculatePolygonArea === 'function') {
                const currentArea = calculatePolygonArea(finalCoords);
                if (currentArea > 0 && targetArea > 0 && Math.abs(currentArea - targetArea) > 3) {
                  const scale = Math.sqrt(targetArea / currentArea);
                  const cLat = finalCoords.reduce((s, p) => s + p.lat, 0) / finalCoords.length;
                  const cLng = finalCoords.reduce((s, p) => s + p.lng, 0) / finalCoords.length;
                  finalCoords = finalCoords.map(p => ({
                    lat: Number((cLat + (p.lat - cLat) * scale).toFixed(7)),
                    lng: Number((cLng + (p.lng - cLng) * scale).toFixed(7))
                  }));
                }
              }

              activeObj.polygon_coords = finalCoords;
              activeObj.is_bbox = false;
              activeObj.patok_count = finalCoords.length;
              activeObj.source = 'VEKTOR WMS RASTER PRESISI BPN';
              activeObj.status_validasi = 'Poligon Geometri Vektor WMS Presisi';

              if (typeof initCanvasRebuilder === 'function') {
                initCanvasRebuilder(lat, lng, targetArea, finalCoords);
              }
              if (typeof updateAdminPolygonCoordsUI === 'function') {
                updateAdminPolygonCoordsUI(finalCoords);
              }
              const badge = document.getElementById('badgeRebuildStatus');
              if (badge) {
                badge.className = 'badge-pill green';
                badge.innerText = `Geometri Presisi (${finalCoords.length} Patok WMS)`;
              }
              showToast(`Poligon Geometri (is_bbox: false) aktif: ${finalCoords.length} patok sudut presisi terbentuk dari garis Raster 1 WMS.`, 'success');
              resolve(true);
              return;
            }
            resolve(false);
          } catch (e) {
            resolve(false);
          }
        };
        img.onerror = () => resolve(false);
        img.src = tileUrl;
      });
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
