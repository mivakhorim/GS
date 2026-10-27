(function() {
  'use strict';

  const STORAGE_KEY = 'duta_geospasi_katalog_bidang';
  const DRIVE_BASE_URL = 'https://www.googleapis.com/drive/v3/files';
  const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const FOLDER_ROOT_NAME = 'Duta Digital Agensi';
  const FOLDER_APP_NAME = 'Duta GeoSpasi';
  const FOLDER_PARCELS_NAME = 'bidang';
  const MASTER_CATALOG_NAME = 'database_katalog_bidang.json';

  let cachedFolderIds = {
    rootFolderId: null,
    appFolderId: null,
    parcelsFolderId: null,
    masterCatalogFileId: null
  };

  function getLocalCatalog() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { type: 'FeatureCollection', features: [] };
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.features)) return parsed;
      return { type: 'FeatureCollection', features: [] };
    } catch (e) {
      return { type: 'FeatureCollection', features: [] };
    }
  }

  function saveLocalCatalog(catalog) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
    } catch (e) {}
  }

  function getAccessToken() {
    if (typeof GoogleAuthManager !== 'undefined' && typeof GoogleAuthManager.getAccessToken === 'function') {
      const tok = GoogleAuthManager.getAccessToken();
      if (tok) return tok;
    }
    if (typeof currentMemberSession !== 'undefined' && currentMemberSession && currentMemberSession.access_token) {
      return currentMemberSession.access_token;
    }
    return localStorage.getItem('duta_google_drive_token') || null;
  }

  async function driveApiFetch(url, options = {}) {
    const token = getAccessToken();
    if (!token) throw new Error('Silakan login dengan Akun Google terlebih dahulu untuk menghubungkan Google Drive.');
    options.headers = options.headers || {};
    options.headers['Authorization'] = 'Bearer ' + token;
    const resp = await fetch(url, options);
    if (resp.status === 401) {
      throw new Error('Sesi otentikasi Google telah berakhir. Silakan login ulang.');
    }
    return resp;
  }

  async function findOrCreateFolder(folderName, parentId = null) {
    let q = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) {
      q += ` and '${parentId}' in parents`;
    } else {
      q += ` and 'root' in parents`;
    }
    const searchUrl = `${DRIVE_BASE_URL}?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
    const resp = await driveApiFetch(searchUrl);
    if (!resp.ok) throw new Error(`Gagal mencari folder ${folderName}`);
    const data = await resp.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }

    const meta = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    };
    if (parentId) {
      meta.parents = [parentId];
    }
    const createResp = await driveApiFetch(DRIVE_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meta)
    });
    if (!createResp.ok) throw new Error(`Gagal membuat folder ${folderName}`);
    const created = await createResp.json();
    return created.id;
  }

  async function ensureFolderStructure() {
    if (cachedFolderIds.appFolderId && cachedFolderIds.parcelsFolderId) {
      return cachedFolderIds;
    }
    const rootId = await findOrCreateFolder(FOLDER_ROOT_NAME, null);
    const appId = await findOrCreateFolder(FOLDER_APP_NAME, rootId);
    const parcelsId = await findOrCreateFolder(FOLDER_PARCELS_NAME, appId);
    cachedFolderIds.rootFolderId = rootId;
    cachedFolderIds.appFolderId = appId;
    cachedFolderIds.parcelsFolderId = parcelsId;
    return cachedFolderIds;
  }

  async function uploadOrUpdateFile(fileName, contentObj, parentFolderId, existingFileId = null) {
    const boundary = '-------314159265358979323846';
    const delimiter = '\r\n--' + boundary + '\r\n';
    const closeDelimiter = '\r\n--' + boundary + '--';

    const metadata = {
      name: fileName,
      mimeType: 'application/json'
    };
    if (!existingFileId && parentFolderId) {
      metadata.parents = [parentFolderId];
    }

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/geo+json; charset=UTF-8\r\n\r\n' +
      (typeof contentObj === 'string' ? contentObj : JSON.stringify(contentObj, null, 2)) +
      closeDelimiter;

    let url = DRIVE_UPLOAD_URL;
    let method = 'POST';

    if (existingFileId) {
      url = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`;
      method = 'PATCH';
    }

    const resp = await driveApiFetch(url, {
      method: method,
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Gagal menyimpan file ke Google Drive: ${errText}`);
    }
    return await resp.json();
  }

  async function syncCatalogToGoogleDrive() {
    const folders = await ensureFolderStructure();
    const catalog = getLocalCatalog();

    let masterId = cachedFolderIds.masterCatalogFileId;
    if (!masterId) {
      const q = `name = '${MASTER_CATALOG_NAME}' and '${folders.appFolderId}' in parents and trashed = false`;
      const searchResp = await driveApiFetch(`${DRIVE_BASE_URL}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`);
      if (searchResp.ok) {
        const found = await searchResp.json();
        if (found.files && found.files.length > 0) {
          masterId = found.files[0].id;
          cachedFolderIds.masterCatalogFileId = masterId;
        }
      }
    }

    const savedMaster = await uploadOrUpdateFile(MASTER_CATALOG_NAME, catalog, folders.appFolderId, masterId);
    if (savedMaster && savedMaster.id) {
      cachedFolderIds.masterCatalogFileId = savedMaster.id;
    }

    return { success: true, count: catalog.features.length, fileId: savedMaster.id };
  }

  async function loadCatalogFromGoogleDrive() {
    const folders = await ensureFolderStructure();
    const q = `name = '${MASTER_CATALOG_NAME}' and '${folders.appFolderId}' in parents and trashed = false`;
    const searchResp = await driveApiFetch(`${DRIVE_BASE_URL}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`);
    if (!searchResp.ok) throw new Error('Gagal memeriksa katalog bidang di Google Drive');
    const found = await searchResp.json();
    if (!found.files || found.files.length === 0) {
      return getLocalCatalog();
    }
    const fileId = found.files[0].id;
    cachedFolderIds.masterCatalogFileId = fileId;
    const downloadResp = await driveApiFetch(`${DRIVE_BASE_URL}/${fileId}?alt=media`);
    if (!downloadResp.ok) throw new Error('Gagal mengunduh berkas katalog dari Google Drive');
    const remoteCatalog = await downloadResp.json();

    if (remoteCatalog && Array.isArray(remoteCatalog.features)) {
      const local = getLocalCatalog();
      const mergedMap = new Map();
      local.features.forEach(f => {
        if (f.id || (f.properties && f.properties.id)) {
          mergedMap.set(f.id || f.properties.id, f);
        }
      });
      remoteCatalog.features.forEach(f => {
        if (f.id || (f.properties && f.properties.id)) {
          mergedMap.set(f.id || f.properties.id, f);
        }
      });
      const merged = {
        type: 'FeatureCollection',
        name: 'Katalog_Bidang_Duta_GeoSpasi',
        features: Array.from(mergedMap.values())
      };
      saveLocalCatalog(merged);
      return merged;
    }
    return getLocalCatalog();
  }

  function collectCurrentActiveParcelGeoJSON() {
    let coords = [];
    if (typeof activePolygon !== 'undefined' && activePolygon && typeof activePolygon.getLatLngs === 'function') {
      const latlngs = activePolygon.getLatLngs();
      const ring = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
      coords = ring.map(ll => [parseFloat(ll.lng.toFixed(7)), parseFloat(ll.lat.toFixed(7))]);
      if (coords.length > 0) {
        coords.push([coords[0][0], coords[0][1]]);
      }
    } else if (typeof activeVertices !== 'undefined' && Array.isArray(activeVertices) && activeVertices.length >= 3) {
      coords = activeVertices.map(v => [parseFloat(v.lng.toFixed(7)), parseFloat(v.lat.toFixed(7))]);
      coords.push([coords[0][0], coords[0][1]]);
    }

    if (coords.length < 4) {
      return null;
    }

    let areaM2 = 0;
    if (typeof calculatePolygonAreaM2 === 'function') {
      areaM2 = calculatePolygonAreaM2();
    } else {
      const el = document.getElementById('canvasLiveAreaM2') || document.getElementById('valLuasM2');
      if (el) {
        const parsed = parseFloat(el.textContent.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (!isNaN(parsed)) areaM2 = parsed;
      }
    }

    let kelilingM = 0;
    const elK = document.getElementById('pinKelilingText') || document.getElementById('valKeliling');
    if (elK) {
      const parsedK = parseFloat(elK.textContent.replace(/[^\d.,]/g, '').replace(',', '.'));
      if (!isNaN(parsedK)) kelilingM = parsedK;
    }

    const centerLat = coords[0][1];
    const centerLng = coords[0][0];

    const patokList = coords.slice(0, coords.length - 1).map((c, idx) => ({
      patok: 'P' + (idx + 1),
      lng: c[0],
      lat: c[1]
    }));

    return {
      type: 'Feature',
      id: 'BID-' + Date.now().toString(36).toUpperCase(),
      geometry: {
        type: 'Polygon',
        coordinates: [coords]
      },
      properties: {
        id: 'BID-' + Date.now().toString(36).toUpperCase(),
        nib: document.getElementById('pinNibText') ? document.getElementById('pinNibText').textContent.trim() : '',
        pemilik: '',
        status_hak: 'Sertipikat Hak Milik (SHM)',
        nomor_hak: document.getElementById('pinNomorHakText') ? document.getElementById('pinNomorHakText').textContent.trim() : '',
        luas_m2: parseFloat(areaM2.toFixed(2)) || 0,
        luas_ha: parseFloat((areaM2 / 10000).toFixed(6)) || 0,
        keliling_m: parseFloat(kelilingM.toFixed(2)) || 0,
        jumlah_patok: patokList.length,
        provinsi: document.getElementById('pinKabkotText') ? '' : '',
        kabupaten: document.getElementById('pinKabkotText') ? document.getElementById('pinKabkotText').textContent.trim() : '',
        kecamatan: document.getElementById('pinKecamatanText') ? document.getElementById('pinKecamatanText').textContent.trim() : '',
        desa: document.getElementById('pinDesaText') ? document.getElementById('pinDesaText').textContent.trim() : '',
        alamat: '',
        penggunaan: 'Rumah Tinggal',
        batas_utara: '',
        batas_timur: '',
        batas_selatan: '',
        batas_barat: '',
        surveyor: 'Duta Digital Agensi',
        tgl_ukur: new Date().toISOString().split('T')[0],
        nilai_taksiran: 0,
        catatan: '',
        center: { lat: centerLat, lng: centerLng },
        koordinat_patok: patokList
      }
    };
  }

  function openParcelAttributesModal(featureOrId = null) {
    let feature = null;
    if (typeof featureOrId === 'string') {
      const catalog = getLocalCatalog();
      feature = catalog.features.find(f => (f.id === featureOrId || (f.properties && f.properties.id === featureOrId)));
    } else if (featureOrId && typeof featureOrId === 'object') {
      feature = featureOrId;
    } else {
      feature = collectCurrentActiveParcelGeoJSON();
    }

    if (!feature) {
      if (typeof showToast === 'function') {
        showToast('Pilih bidang tanah di peta atau gambar poligon terlebih dahulu.', 'warn');
      } else {
        alert('Pilih bidang tanah di peta terlebih dahulu.');
      }
      return;
    }

    const p = feature.properties || {};

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val !== undefined && val !== null ? val : '';
    };

    setVal('formAttrId', feature.id || p.id || 'BID-' + Date.now().toString(36).toUpperCase());
    setVal('formAttrNib', p.nib || '');
    setVal('formAttrPemilik', p.pemilik || '');
    setVal('formAttrStatusHak', p.status_hak || 'Sertipikat Hak Milik (SHM)');
    setVal('formAttrNomorHak', p.nomor_hak || '');
    setVal('formAttrProvinsi', p.provinsi || 'Jawa Tengah');
    setVal('formAttrKabupaten', p.kabupaten || 'Sukoharjo');
    setVal('formAttrKecamatan', p.kecamatan || '');
    setVal('formAttrDesa', p.desa || '');
    setVal('formAttrAlamat', p.alamat || '');
    setVal('formAttrLuasM2', p.luas_m2 || '');
    setVal('formAttrLuasHa', p.luas_ha || '');
    setVal('formAttrKelilingM', p.keliling_m || '');
    setVal('formAttrJumlahPatok', p.jumlah_patok || (feature.geometry && feature.geometry.coordinates && feature.geometry.coordinates[0] ? feature.geometry.coordinates[0].length - 1 : ''));
    setVal('formAttrPenggunaan', p.penggunaan || 'Rumah Tinggal');
    setVal('formAttrBatasUtara', p.batas_utara || '');
    setVal('formAttrBatasTimur', p.batas_timur || '');
    setVal('formAttrBatasSelatan', p.batas_selatan || '');
    setVal('formAttrBatasBarat', p.batas_barat || '');
    setVal('formAttrSurveyor', p.surveyor || 'Duta Digital Agensi');
    setVal('formAttrTglUkur', p.tgl_ukur || new Date().toISOString().split('T')[0]);
    setVal('formAttrNilaiTaksiran', p.nilai_taksiran || '');
    setVal('formAttrCatatan', p.catatan || '');

    window.__currentEditingParcelFeature = feature;

    const modal = document.getElementById('modalAtributBidang');
    if (modal) modal.style.display = 'flex';
  }

  function closeParcelAttributesModal() {
    const modal = document.getElementById('modalAtributBidang');
    if (modal) modal.style.display = 'none';
    window.__currentEditingParcelFeature = null;
  }

  async function saveParcelFromModal(syncToDrive = true) {
    const feature = window.__currentEditingParcelFeature;
    if (!feature) {
      closeParcelAttributesModal();
      return;
    }

    const getVal = id => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };

    const p = feature.properties || {};
    p.id = getVal('formAttrId') || feature.id;
    p.nib = getVal('formAttrNib');
    p.pemilik = getVal('formAttrPemilik');
    p.status_hak = getVal('formAttrStatusHak');
    p.nomor_hak = getVal('formAttrNomorHak');
    p.provinsi = getVal('formAttrProvinsi');
    p.kabupaten = getVal('formAttrKabupaten');
    p.kecamatan = getVal('formAttrKecamatan');
    p.desa = getVal('formAttrDesa');
    p.alamat = getVal('formAttrAlamat');
    p.luas_m2 = parseFloat(getVal('formAttrLuasM2')) || p.luas_m2 || 0;
    p.luas_ha = parseFloat((p.luas_m2 / 10000).toFixed(6)) || 0;
    p.keliling_m = parseFloat(getVal('formAttrKelilingM')) || p.keliling_m || 0;
    p.penggunaan = getVal('formAttrPenggunaan');
    p.batas_utara = getVal('formAttrBatasUtara');
    p.batas_timur = getVal('formAttrBatasTimur');
    p.batas_selatan = getVal('formAttrBatasSelatan');
    p.batas_barat = getVal('formAttrBatasBarat');
    p.surveyor = getVal('formAttrSurveyor');
    p.tgl_ukur = getVal('formAttrTglUkur');
    p.nilai_taksiran = parseFloat(getVal('formAttrNilaiTaksiran')) || 0;
    p.catatan = getVal('formAttrCatatan');

    feature.id = p.id;
    feature.properties = p;

    const catalog = getLocalCatalog();
    const existingIdx = catalog.features.findIndex(f => (f.id === feature.id || (f.properties && f.properties.id === feature.id)));
    if (existingIdx >= 0) {
      catalog.features[existingIdx] = feature;
    } else {
      catalog.features.unshift(feature);
    }
    saveLocalCatalog(catalog);
    renderCatalogUI();
    closeParcelAttributesModal();

    if (typeof showToast === 'function') {
      showToast(`Data bidang ${p.pemilik || p.nib || p.id} tersimpan di katalog lokal.`, 'success');
    }

    if (syncToDrive) {
      try {
        if (typeof showToast === 'function') {
          showToast('Menyinkronkan ke Google Drive...', 'info');
        }
        await syncCatalogToGoogleDrive();
        const folders = await ensureFolderStructure();
        await uploadOrUpdateFile(`${p.id}.geojson`, feature, folders.parcelsFolderId);
        if (typeof showToast === 'function') {
          showToast('Data bidang berhasil tersinkronisasi ke Google Drive!', 'success');
        }
      } catch (err) {
        if (typeof showToast === 'function') {
          showToast(`Sinkronisasi Drive tertunda: ${err.message}`, 'warn');
        }
      }
    }
  }

  function deleteParcel(parcelId) {
    if (!confirm('Apakah Anda yakin ingin menghapus bidang tanah ini dari katalog?')) return;
    const catalog = getLocalCatalog();
    catalog.features = catalog.features.filter(f => (f.id !== parcelId && (!f.properties || f.properties.id !== parcelId)));
    saveLocalCatalog(catalog);
    renderCatalogUI();
    if (typeof showToast === 'function') {
      showToast('Bidang tanah telah dihapus dari katalog.', 'info');
    }
    syncCatalogToGoogleDrive().catch(() => {});
  }

  function loadParcelToMap(parcelId) {
    const catalog = getLocalCatalog();
    const feature = catalog.features.find(f => (f.id === parcelId || (f.properties && f.properties.id === parcelId)));
    if (!feature || !feature.geometry || !feature.geometry.coordinates) {
      if (typeof showToast === 'function') showToast('Geometri bidang tidak ditemukan.', 'error');
      return;
    }

    const ring = feature.geometry.coordinates[0];
    const latlngs = ring.map(c => [c[1], c[0]]);

    if (typeof window.clearCurrentPolygonDrawing === 'function') {
      window.clearCurrentPolygonDrawing();
    }

    if (typeof window.L !== 'undefined' && typeof map !== 'undefined' && map) {
      if (typeof activePolygon !== 'undefined' && activePolygon && map.hasLayer(activePolygon)) {
        map.removeLayer(activePolygon);
      }

      window.activeVertices = latlngs.slice(0, latlngs.length - 1).map(ll => ({ lat: ll[0], lng: ll[1] }));
      window.activePolygon = L.polygon(latlngs, {
        color: '#ff6600',
        weight: 3,
        fillColor: '#ffa500',
        fillOpacity: 0.35
      }).addTo(map);

      map.fitBounds(activePolygon.getBounds(), { padding: [30, 30] });

      if (typeof renderInteractiveVertices === 'function') {
        renderInteractiveVertices();
      }
      if (typeof updateCanvasMeasurements === 'function') {
        updateCanvasMeasurements();
      }
    }

    if (typeof switchTab === 'function') {
      switchTab('tab-digitasi');
    }

    if (typeof showToast === 'function') {
      showToast(`Bidang ${feature.properties.pemilik || feature.properties.nib || parcelId} dimuat ke kanvas.`, 'success');
    }
  }

  function renderCatalogUI() {
    const container = document.getElementById('katalogBidangList');
    if (!container) return;

    const catalog = getLocalCatalog();
    const searchInput = document.getElementById('katalogSearchInput');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let filtered = catalog.features;
    if (query) {
      filtered = filtered.filter(f => {
        const p = f.properties || {};
        return (
          (p.pemilik && p.pemilik.toLowerCase().includes(query)) ||
          (p.nib && p.nib.toLowerCase().includes(query)) ||
          (p.desa && p.desa.toLowerCase().includes(query)) ||
          (p.kecamatan && p.kecamatan.toLowerCase().includes(query)) ||
          (p.id && p.id.toLowerCase().includes(query))
        );
      });
    }

    const countBadge = document.getElementById('katalogTotalCount');
    if (countBadge) countBadge.textContent = `${filtered.length} Bidang`;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 18px 14px; text-align: center; color: #64748b; font-size: 12px; line-height: 1.5;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" style="margin: 0 auto 8px auto; display: block;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">Belum Ada Bidang Tersimpan</div>
          <div>Klik poligon bidang di peta atau gambar poligon baru, lalu tekan tombol <strong>"Simpan ke Drive"</strong>.</div>
        </div>
      `;
      return;
    }

    let html = '';
    filtered.forEach(f => {
      const p = f.properties || {};
      const fId = f.id || p.id;
      const title = p.pemilik || p.nib || fId;
      const sub = [p.status_hak, p.desa, p.kecamatan].filter(Boolean).join(' • ');
      const luasFormatted = Number(p.luas_m2 || 0).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

      html += `
        <div class="katalog-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; transition: border-color 0.15s ease;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 700; font-size: 13px; color: #0a2e5c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title}</div>
              <div style="font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${sub || 'Bidang Tanah Kadastral'}</div>
            </div>
            <span class="badge" style="background: #f1f5f9; color: #0a2e5c; font-weight: 700; font-size: 10px; padding: 2px 6px; border-radius: 4px; border: 1px solid #cbd5e1; white-space: nowrap;">
              ${luasFormatted} m²
            </span>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; color: #475569; border-top: 1px solid #f1f5f9; padding-top: 6px; margin-top: 2px;">
            <span>${p.jumlah_patok || 0} Titik Patok • ${p.tgl_ukur || '-'}</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 2px;">
            <button type="button" class="btn btn-outline btn-sm" onclick="DutaDriveSync.loadParcelToMap('${fId}')" title="Buka dan Sorot di Peta" style="padding: 4px; height: 28px; justify-content: center;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button type="button" class="btn btn-outline btn-sm" onclick="DutaDriveSync.openParcelAttributesModal('${fId}')" title="Edit Formulir Atribut" style="padding: 4px; height: 28px; justify-content: center;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button type="button" class="btn btn-outline btn-sm" onclick="DutaDriveSync.exportSingleParcelGeoJSON('${fId}')" title="Unduh Berkas GeoJSON" style="padding: 4px; height: 28px; justify-content: center;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button type="button" class="btn btn-outline btn-sm" onclick="DutaDriveSync.deleteParcel('${fId}')" title="Hapus Bidang" style="padding: 4px; height: 28px; justify-content: center; color: #dc2626; border-color: #fecaca;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function exportSingleParcelGeoJSON(parcelId) {
    const catalog = getLocalCatalog();
    const feature = catalog.features.find(f => (f.id === parcelId || (f.properties && f.properties.id === parcelId)));
    if (!feature) return;
    const blob = new Blob([JSON.stringify(feature, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${feature.properties.pemilik ? feature.properties.pemilik.replace(/\s+/g, '_') : parcelId}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportAllCatalogGeoJSON() {
    const catalog = getLocalCatalog();
    const blob = new Blob([JSON.stringify(catalog, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `database_katalog_bidang_dutageospasi_${new Date().toISOString().split('T')[0]}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  window.DutaDriveSync = {
    getLocalCatalog,
    saveLocalCatalog,
    syncCatalogToGoogleDrive,
    loadCatalogFromGoogleDrive,
    openParcelAttributesModal,
    closeParcelAttributesModal,
    saveParcelFromModal,
    deleteParcel,
    loadParcelToMap,
    renderCatalogUI,
    exportSingleParcelGeoJSON,
    exportAllCatalogGeoJSON
  };

  document.addEventListener('DOMContentLoaded', function() {
    renderCatalogUI();
    const searchInput = document.getElementById('katalogSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', renderCatalogUI);
    }
  });

})();
