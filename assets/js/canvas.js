function parseDbfBuffer(buffer, encoding) {
  if (!buffer || buffer.byteLength < 32) {
    return { fields: [], records: [] };
  }
  const view = new DataView(buffer);
  const numRecords = view.getInt32(4, true);
  const headerLen = view.getInt16(8, true);
  const recordLen = view.getInt16(10, true);

  if (headerLen <= 32 || recordLen <= 1 || headerLen > buffer.byteLength) {
    return { fields: [], records: [] };
  }

  let textDecoder;
  try {
    textDecoder = new TextDecoder(encoding || 'utf-8', { fatal: false });
  } catch (e) {
    textDecoder = new TextDecoder('utf-8', { fatal: false });
  }

  const uint8 = new Uint8Array(buffer);
  const fields = [];
  let fOffset = 32;

  while (fOffset + 32 <= headerLen) {
    if (uint8[fOffset] === 0x0D) break;
    const nameBytes = [];
    for (let i = 0; i < 11; i++) {
      const b = uint8[fOffset + i];
      if (b === 0) break;
      nameBytes.push(b);
    }
    const rawName = String.fromCharCode(...nameBytes).trim().toUpperCase();
    const type = String.fromCharCode(uint8[fOffset + 11]).toUpperCase();
    const len = uint8[fOffset + 16];
    const dec = uint8[fOffset + 17];

    if (rawName && len > 0) {
      fields.push({
        name: rawName,
        type: type,
        length: len,
        decimals: dec
      });
    }
    fOffset += 32;
  }

  if (fields.length === 0) {
    return { fields: [], records: [] };
  }

  const records = [];
  let recOffset = headerLen;

  for (let r = 0; r < numRecords; r++) {
    if (recOffset + recordLen > buffer.byteLength) break;
    const delFlag = uint8[recOffset];
    const isDeleted = (delFlag === 0x2A);
    let fieldOffset = recOffset + 1;
    const recordObj = {};

    for (let f = 0; f < fields.length; f++) {
      const field = fields[f];
      const sliceBytes = uint8.subarray(fieldOffset, fieldOffset + field.length);
      const strVal = textDecoder.decode(sliceBytes).trim();

      let parsedVal = strVal;
      if (field.type === 'N' || field.type === 'F') {
        if (strVal === '') {
          parsedVal = null;
        } else {
          const num = Number(strVal);
          parsedVal = isNaN(num) ? strVal : num;
        }
      } else if (field.type === 'L') {
        parsedVal = (strVal === 'T' || strVal === 't' || strVal === 'Y' || strVal === 'y');
      }

      recordObj[field.name] = parsedVal;
      fieldOffset += field.length;
    }

    if (!isDeleted) {
      records.push(recordObj);
    }
    recOffset += recordLen;
  }

  return { fields, records };
}

function findAttrValue(record, possibleKeys) {
  if (!record) return null;
  const keys = Object.keys(record);
  for (let i = 0; i < possibleKeys.length; i++) {
    const target = possibleKeys[i].toUpperCase();
    for (let j = 0; j < keys.length; j++) {
      const k = keys[j];
      const upperK = k.toUpperCase();
      if (upperK === target || upperK.indexOf(target) !== -1) {
        const val = record[k];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
    }
  }
  return null;
}

function populateCustomAttrTableFromImport(fields, primaryRecord) {
  const tbody = document.getElementById('customAttrTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!fields || fields.length === 0) return;

  fields.forEach(f => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-light)';
    const safeName = f.name.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10);
    let typeChar = 'C';
    if (f.type === 'N' || f.type === 'F') typeChar = 'N';
    else if (f.type === 'D') typeChar = 'D';
    const rawVal = (primaryRecord && primaryRecord[f.name] !== undefined && primaryRecord[f.name] !== null) ? primaryRecord[f.name] : '';
    const safeVal = String(rawVal);

    tr.innerHTML = `
      <td style="padding: 3px 4px;">
        <input type="text" class="custom-attr-name" value="${safeName}" placeholder="KOLOM" maxlength="10" style="text-transform: uppercase; font-family: 'JetBrains Mono', monospace; font-weight: 600;" oninput="this.value = this.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10)">
      </td>
      <td style="padding: 3px 4px;">
        <select class="custom-attr-type">
          <option value="C"${typeChar === 'C' ? ' selected' : ''}>C (Teks)</option>
          <option value="N"${typeChar === 'N' ? ' selected' : ''}>N (Angka)</option>
          <option value="D"${typeChar === 'D' ? ' selected' : ''}>D (Tanggal)</option>
        </select>
      </td>
      <td style="padding: 3px 4px;">
        <input type="text" class="custom-attr-val" value="${escapeHtml(safeVal)}" placeholder="Nilai">
      </td>
      <td style="padding: 3px 4px; text-align: center;">
        <button type="button" onclick="this.closest('tr')?.remove()" style="border: none; background: transparent; cursor: pointer; color: var(--crimson); padding: 2px;" aria-label="Hapus Kolom">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openShpAttributesModal() {
  const modal = document.getElementById('modalShpAttributes');
  if (modal) modal.style.display = 'flex';
  const filterInput = document.getElementById('inputFilterShpAttr');
  if (filterInput) {
    filterInput.value = '';
    filterShpAttrTable('');
    filterInput.focus();
  }
}

function closeShpAttributesModal() {
  const modal = document.getElementById('modalShpAttributes');
  if (modal) modal.style.display = 'none';
}

function renderShpAttributesTable(records, fields) {
  const thead = document.getElementById('shpAttrThead');
  const tbody = document.getElementById('shpAttrTbody');
  if (!thead || !tbody) return;

  if (!fields || fields.length === 0 || !records || records.length === 0) {
    thead.innerHTML = '<tr><th style="padding: 6px 8px; width: 40px; text-align: center;">#</th><th style="padding: 6px 8px; text-align: left;">Atribut</th></tr>';
    tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Tidak ada data atribut di dalam berkas .dbf.</td></tr>';
    return;
  }

  let headHtml = '<tr><th style="padding: 6px 8px; width: 40px; text-align: center;">#</th>';
  fields.forEach(f => {
    headHtml += `<th style="padding: 6px 8px; text-align: left; white-space: nowrap;">${escapeHtml(f.name)} <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: normal;">(${escapeHtml(f.type)})</span></th>`;
  });
  headHtml += '</tr>';
  thead.innerHTML = headHtml;

  let bodyHtml = '';
  records.forEach((rec, idx) => {
    bodyHtml += `<tr><td style="padding: 5px 8px; text-align: center; font-family: 'JetBrains Mono', monospace; color: var(--text-muted);">${idx + 1}</td>`;
    fields.forEach(f => {
      const val = rec[f.name];
      const displayVal = (val !== null && val !== undefined && String(val).trim() !== '') ? escapeHtml(String(val)) : '-';
      bodyHtml += `<td style="padding: 5px 8px; font-family: 'JetBrains Mono', monospace; white-space: nowrap;">${displayVal}</td>`;
    });
    bodyHtml += '</tr>';
  });
  tbody.innerHTML = bodyHtml;
}

function filterShpAttrTable(query) {
  const tbody = document.getElementById('shpAttrTbody');
  if (!tbody) return;
  const q = (query || '').toLowerCase().trim();
  const rows = tbody.querySelectorAll('tr');
  rows.forEach(r => {
    if (!q) {
      r.style.display = '';
      return;
    }
    const text = r.textContent.toLowerCase();
    r.style.display = text.indexOf(q) !== -1 ? '' : 'none';
  });
}

function copyShpAttrCsv() {
  if (!window.lastImportedShpData || !window.lastImportedShpData.records || window.lastImportedShpData.records.length === 0) {
    showToast('Belum ada data atribut yang dapat disalin.', 'warn');
    return;
  }
  const fields = window.lastImportedShpData.fields;
  const records = window.lastImportedShpData.records;

  const headerLine = fields.map(f => `"${f.name.replace(/"/g, '""')}"`).join(',');
  const lines = [headerLine];

  records.forEach(r => {
    const rowValues = fields.map(f => {
      const val = r[f.name];
      if (val === null || val === undefined) return '""';
      return `"${String(val).replace(/"/g, '""')}"`;
    });
    lines.push(rowValues.join(','));
  });

  const csvContent = lines.join('\r\n');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(csvContent).then(() => {
      showToast('Seluruh tabel atribut format CSV berhasil disalin ke clipboard!', 'success');
    }).catch(() => {
      showToast('Gagal menyalin CSV secara otomatis.', 'crimson');
    });
  } else {
    showToast('Clipboard API tidak didukung pada browser ini.', 'warn');
  }
}

function copyShpAttrJson() {
  if (!window.lastImportedShpData || !window.lastImportedShpData.records || window.lastImportedShpData.records.length === 0) {
    showToast('Belum ada data atribut yang dapat disalin.', 'warn');
    return;
  }
  const jsonContent = JSON.stringify(window.lastImportedShpData.records, null, 2);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(jsonContent).then(() => {
      showToast('Seluruh tabel atribut format JSON berhasil disalin ke clipboard!', 'success');
    }).catch(() => {
      showToast('Gagal menyalin JSON secara otomatis.', 'crimson');
    });
  } else {
    showToast('Clipboard API tidak didukung pada browser ini.', 'warn');
  }
}

async function handleImportZipFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    showToast('Membaca arsip ZIP Shapefile...', 'info');
    const zip = await JSZip.loadAsync(file);

    const shpFileEntry = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.shp'));
    if (!shpFileEntry) {
      showToast('Berkas .shp tidak ditemukan di dalam arsip ZIP.', 'crimson');
      return;
    }

    const cpgFileEntry = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.cpg'));
    let encoding = 'utf-8';
    if (cpgFileEntry) {
      try {
        const cpgText = (await cpgFileEntry.async('text')).trim().toLowerCase();
        if (cpgText.indexOf('1252') !== -1) encoding = 'windows-1252';
        else if (cpgText.indexOf('850') !== -1) encoding = 'ibm850';
        else if (cpgText.indexOf('iso-8859') !== -1) encoding = cpgText;
      } catch (e) {}
    }

    let dbfData = { fields: [], records: [] };
    const dbfFileEntry = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.dbf'));
    if (dbfFileEntry) {
      try {
        const dbfBuffer = await dbfFileEntry.async('arraybuffer');
        dbfData = parseDbfBuffer(dbfBuffer, encoding);
      } catch (errDbf) {
        dbfData = { fields: [], records: [] };
      }
    }

    const buffer = await shpFileEntry.async('arraybuffer');
    const view = new DataView(buffer);

    if (view.byteLength < 100) {
      showToast('Format berkas .shp tidak valid atau rusak.', 'crimson');
      return;
    }

    const fileCode = view.getInt32(0, false);
    if (fileCode !== 9994) {
      showToast('Kode header ESRI Shapefile tidak cocok.', 'crimson');
      return;
    }

    let offset = 100;
    const parsedPolygons = [];

    while (offset + 8 <= view.byteLength) {
      const recNum = view.getInt32(offset, false);
      const contentLenWords = view.getInt32(offset + 4, false);
      const contentBytes = contentLenWords * 2;
      const recEnd = offset + 8 + contentBytes;
      if (recEnd > view.byteLength) break;

      const shapeType = view.getInt32(offset + 8, true);
      if (shapeType === 5) {
        const numParts = view.getInt32(offset + 8 + 36, true);
        const numPoints = view.getInt32(offset + 8 + 40, true);
        const partStarts = [];
        for (let p = 0; p < numParts; p++) {
          partStarts.push(view.getInt32(offset + 8 + 44 + p * 4, true));
        }
        const ptsStartOffset = offset + 8 + 44 + numParts * 4;

        for (let p = 0; p < numParts; p++) {
          const sIdx = partStarts[p];
          const eIdx = (p + 1 < numParts) ? partStarts[p + 1] : numPoints;
          const partPts = [];
          for (let i = sIdx; i < eIdx; i++) {
            const px = view.getFloat64(ptsStartOffset + i * 16, true);
            const py = view.getFloat64(ptsStartOffset + i * 16 + 8, true);
            partPts.push({ lat: Number(py.toFixed(7)), lng: Number(px.toFixed(7)) });
          }
          if (partPts.length > 2) {
            if (partPts[0].lat === partPts[partPts.length - 1].lat && partPts[0].lng === partPts[partPts.length - 1].lng) {
              partPts.pop();
            }
            if (partPts.length >= 3) {
              parsedPolygons.push(partPts);
            }
          }
        }
      }
      offset = recEnd;
    }

    if (parsedPolygons.length === 0) {
      showToast('Tidak ada geometri poligon (Shape Type 5) yang ditemukan di berkas SHP.', 'warn');
      return;
    }

    if (parsedPolygons.length === 1) {
      activeVertices = parsedPolygons[0];
      activeMultiParts = null;
    } else {
      activeMultiParts = parsedPolygons;
      activeVertices = parsedPolygons[0];
    }
    isParcelLocked = true;

    const allPts = parsedPolygons.flat();
    const bounds = L.latLngBounds(allPts.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40] });

    renderCanvasPolygon(true);
    renderVertexHandles();
    renderEdgeDistanceLabels();

    const totalArea = parsedPolygons.reduce((sum, poly) => sum + calculatePolygonArea(poly), 0);
    const hudBpn = document.getElementById('hudBpnArea');
    if (hudBpn) hudBpn.innerText = `${Math.round(totalArea).toLocaleString('id-ID')} m²`;

    window.lastImportedShpData = {
      fileName: file.name,
      shpName: shpFileEntry.name,
      fields: dbfData.fields,
      records: dbfData.records,
      polygons: parsedPolygons,
      totalAreaM2: totalArea
    };

    const badge = document.getElementById('importedShpAttributesBadge');
    if (badge) badge.style.display = 'block';

    const fnEl = document.getElementById('importedShpFileName');
    if (fnEl) fnEl.innerText = file.name;

    const metaEl = document.getElementById('importedShpMetaInfo');
    if (metaEl) metaEl.innerText = `${dbfData.records.length} Baris Data : ${dbfData.fields.length} Kolom Atribut`;

    const statFile = document.getElementById('shpAttrStatFile');
    if (statFile) statFile.innerText = file.name;

    const statRecords = document.getElementById('shpAttrStatRecords');
    if (statRecords) statRecords.innerText = `${dbfData.records.length} Baris`;

    const statFields = document.getElementById('shpAttrStatFields');
    if (statFields) statFields.innerText = `${dbfData.fields.length} Kolom`;

    renderShpAttributesTable(dbfData.records, dbfData.fields);

    const primaryRec = dbfData.records[0] || {};

    const valPemrakarsa = findAttrValue(primaryRec, ['PEMRAKARSA', 'PEMOHON', 'NAMA_PEM', 'OWNER', 'NAMA', 'PEMILIK']);
    if (valPemrakarsa) {
      const el = document.getElementById('shpPemrakarsa');
      if (el) el.value = valPemrakarsa.toUpperCase();
    }

    const valKegiatan = findAttrValue(primaryRec, ['KEGIATAN', 'PROYEK', 'NAMA_KEG', 'USAHA', 'KEG_USAHA', 'PENGGUNAAN', 'LANDUSE', 'FUNGSI']);
    if (valKegiatan) {
      const el = document.getElementById('shpKegiatan');
      if (el) el.value = valKegiatan.toUpperCase();
    }

    const valTahun = findAttrValue(primaryRec, ['TAHUN', 'THN', 'YEAR']);
    if (valTahun) {
      const el = document.getElementById('shpTahun');
      if (el) el.value = valTahun;
    }

    const valProv = findAttrValue(primaryRec, ['PROVINSI', 'PROV', 'PROV_NAME', 'WILAYAH']);
    if (valProv) {
      const el = document.getElementById('shpProvinsi');
      if (el) el.value = valProv.toUpperCase();
    }

    const valKet = findAttrValue(primaryRec, ['KETERANGAN', 'KET', 'STATUS', 'CATATAN', 'REMARKS', 'DESKRIPSI', 'INFO']);
    if (valKet) {
      const el = document.getElementById('shpKeterangan');
      if (el) el.value = valKet.toUpperCase();
    }

    const valLayer = findAttrValue(primaryRec, ['LAYER', 'NAMA_LAYER', 'TIPE', 'JENIS', 'LAYERNAME']);
    if (valLayer) {
      const el = document.getElementById('shpLayer');
      if (el) el.value = valLayer.toUpperCase();
    }

    const elLuasHa = document.getElementById('shpLuasHa') || document.getElementById('shpLuas');
    if (elLuasHa) elLuasHa.value = `${(totalArea / 10000.0).toFixed(6)} Ha`;

    populateCustomAttrTableFromImport(dbfData.fields, primaryRec);

    const valNib = findAttrValue(primaryRec, ['NIB', 'NO_NIB', 'NOMOR_NIB']);
    const valTipeHak = findAttrValue(primaryRec, ['HAK_TANAH', 'TIPE_HAK', 'JENIS_HAK', 'HAK']);
    const valNomorHak = findAttrValue(primaryRec, ['NO_HAK', 'NOMOR_HAK']);
    const valNosu = findAttrValue(primaryRec, ['NOSU', 'NO_SU', 'SURAT_UKUR', 'NO_SURAT_UKUR']);
    const valDesa = findAttrValue(primaryRec, ['DESA', 'KELURAHAN', 'DESA_KEL']);
    const valKec = findAttrValue(primaryRec, ['KECAMATAN', 'KEC']);
    const valKab = findAttrValue(primaryRec, ['KABKOT', 'KABUPATEN', 'KOTA', 'KAB_KOTA']);
    const valKantah = findAttrValue(primaryRec, ['KANTAH', 'KANTOR_PERTANAHAN', 'KANTOR_BPN']);
    const valLuasBpn = findAttrValue(primaryRec, ['LUAS_BPN', 'LUAS_M2', 'LUAS_ASAL', 'LUAS']);
    const valKluster = findAttrValue(primaryRec, ['KLUSTER', 'KLUSTER_PTSL']);
    const valRtrw = findAttrValue(primaryRec, ['RTRW', 'POLA_RUANG']);
    const valRdtr = findAttrValue(primaryRec, ['RDTR', 'ZONASI_RDTR']);
    const valLsd = findAttrValue(primaryRec, ['STATUS_LSD', 'LSD']);
    const valLbs = findAttrValue(primaryRec, ['STATUS_LBS', 'LBS']);
    const valHutan = findAttrValue(primaryRec, ['KWSHUTAN', 'HUTAN', 'STATUS_HUTAN']);
    const valZnt = findAttrValue(primaryRec, ['ZNT_M2', 'ZNT', 'ZONA_NILAI']);
    const valZntRange = findAttrValue(primaryRec, ['ZNT_RANGE', 'RENTANG_NILAI']);

    const centerLat = allPts.reduce((s, p) => s + p.lat, 0) / allPts.length;
    const centerLng = allPts.reduce((s, p) => s + p.lng, 0) / allPts.length;

    activePinData = {
      lat: centerLat,
      lng: centerLng,
      fid: valNib || file.name,
      nib: valNib || '-',
      nib_lengkap: valNib || '-',
      tipe_hak: valTipeHak || 'Hak Milik',
      nomor_hak: valNomorHak || '-',
      nomor_hak_raw: valNomorHak || '-',
      nosu: valNosu || '-',
      tahun: valTahun || '2026',
      luas_m2: valLuasBpn ? (parseFloat(valLuasBpn) || Math.round(totalArea)) : Math.round(totalArea),
      desa: valDesa || '-',
      kecamatan: valKec || '-',
      kabkot: valKab || '-',
      provinsi: valProv || '-',
      kantah: valKantah || 'Kantor Pertanahan',
      kluster_ptsl: valKluster || 'Kluster K1 (Hak Terbit)',
      akurasibidang: 'Terestrial / Import ESRI SHP',
      alatukur: 'ESRI Shapefile DBF Atribut',
      status_validasi: 'Import Atribut Valid',
      rtrw: valRtrw || 'Kawasan Budidaya / Permukiman',
      rdtr: valRdtr || 'Zonasi Perda RDTR Berlaku',
      lsd: valLsd || 'Non-LSD (Bebas Alih Fungsi)',
      lbs: valLbs || 'Bukan Lahan Baku Sawah',
      hutan: valHutan || 'APL (Non Hutan Boleh Disertifikatkan)',
      znt: valZnt || 'Zona Nilai Pasar Wajar',
      znt_range: valZntRange || 'Belum Dipetakan ZNT Nasional',
      alamat: [valDesa, valKec, valKab].filter(v => v && v !== '-').join(', ') || 'Lokasi Impor Shapefile'
    };

    const lokasiUtama = (activePinData.desa !== '-' && activePinData.kecamatan !== '-')
      ? `${activePinData.desa}, ${activePinData.kecamatan}`
      : (activePinData.desa !== '-' ? activePinData.desa : (activePinData.kabkot !== '-' ? activePinData.kabkot : 'Bidang Impor'));

    const elLokasi = document.getElementById('pinLokasiUtamaText');
    if (elLokasi) elLokasi.innerText = lokasiUtama;

    const elLuasBpnText = document.getElementById('pinLuasBpnText');
    if (elLuasBpnText) {
      elLuasBpnText.className = 'stat-value emerald';
      elLuasBpnText.innerText = `${Math.round(totalArea).toLocaleString('id-ID')} m²`;
    }

    const elTipeHakText = document.getElementById('pinTipeHakText');
    if (elTipeHakText) elTipeHakText.innerText = activePinData.tipe_hak;

    if (typeof renderCadastralProFields === 'function') {
      renderCadastralProFields();
    }

    if (activePolygonLayer) {
      let popupHtml = `
        <div style="font-size: 0.8rem; font-family: 'Plus Jakarta Sans', sans-serif; min-width: 190px;">
          <strong style="color: var(--accent, #0a2e5c);">Bidang Shapefile Terimpor</strong><br>
          <strong>Luas:</strong> ${Math.round(totalArea).toLocaleString('id-ID')} m² (${(totalArea / 10000.0).toFixed(6)} Ha)<br>
          <strong>Titik Batas:</strong> ${allPts.length} koordinat
      `;
      if (dbfData.records.length > 0) {
        const keys = Object.keys(primaryRec).slice(0, 4);
        popupHtml += `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-light, #e2e8f0); font-size: 0.72rem;">`;
        popupHtml += `<div style="font-weight: 700; color: var(--accent, #0a2e5c); margin-bottom: 3px;">Atribut (${dbfData.fields.length} Kolom):</div>`;
        keys.forEach(k => {
          popupHtml += `<div><span style="color: var(--text-muted, #64748b);">${escapeHtml(k)}:</span> <strong>${primaryRec[k] !== null && primaryRec[k] !== undefined ? escapeHtml(String(primaryRec[k])) : '-'}</strong></div>`;
        });
        popupHtml += `<button type="button" class="btn btn-primary btn-sm" onclick="openShpAttributesModal()" style="margin-top: 6px; width: 100%; font-size: 0.69rem; padding: 4px 6px;">Buka Tabel Atribut</button>`;
        popupHtml += `</div>`;
      }
      popupHtml += `</div>`;
      activePolygonLayer.bindPopup(popupHtml);
    }

    if (typeof renderCoordinatesTable === 'function') renderCoordinatesTable();

    const infoMsg = dbfData.fields.length > 0
      ? `Shapefile ZIP berhasil dimuat: ${parsedPolygons.length} bidang, ${dbfData.records.length} data atribut (${dbfData.fields.length} kolom).`
      : `Shapefile ZIP berhasil dimuat: ${parsedPolygons.length} bidang (${Math.round(totalArea).toLocaleString('id-ID')} m²).`;

    showToast(infoMsg, 'success');
    switchTab('tab-bidang');
  } catch (err) {
    showToast('Gagal memproses berkas ZIP Shapefile: ' + err.message, 'crimson');
  } finally {
    event.target.value = '';
  }
}

function openServerModal() {
  const modal = document.getElementById('serverModal');
  if (modal) modal.style.display = 'flex';
  const inputB = document.getElementById('inputBpnGatewayUrl');
  if (inputB) inputB.value = localStorage.getItem('custom_bpn_gateway_url') || '';
}

window.parseDbfBuffer = parseDbfBuffer;
window.findAttrValue = findAttrValue;
window.populateCustomAttrTableFromImport = populateCustomAttrTableFromImport;
window.openShpAttributesModal = openShpAttributesModal;
window.closeShpAttributesModal = closeShpAttributesModal;
window.renderShpAttributesTable = renderShpAttributesTable;
window.filterShpAttrTable = filterShpAttrTable;
window.copyShpAttrCsv = copyShpAttrCsv;
window.copyShpAttrJson = copyShpAttrJson;
window.handleImportZipFile = handleImportZipFile;
window.openServerModal = openServerModal;
