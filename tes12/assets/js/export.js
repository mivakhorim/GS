function getExportVerticesWithOssAdjustment(parts) {
  return parts || [];
}

function exportCoordinatesXls() {
      if (!isMemberProActive()) {
        showToast('Fitur Ekspor Koordinat Excel khusus Member PRO. Silakan masuk atau upgrade akun.', 'warn');
        openMemberModal();
        return;
      }
      ensureActiveVerticesFromDraw();
      const rawParts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      if (!rawParts[0] || rawParts[0].length < 3) {
        showToast('Pilih atau gambar bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }
      const parts = getExportVerticesWithOssAdjustment(rawParts);

      const pemrakarsa = (document.getElementById('shpPemrakarsa')?.value.trim() || 'PEMOHON OSS RBA').toUpperCase();
      const kegiatan = (document.getElementById('shpKegiatan')?.value.trim() || 'KKPR / PERIZINAN BERUSAHA').toUpperCase();
      const tahun = document.getElementById('shpTahun')?.value.trim() || '2026';
      const desa = activePinData?.desa || '-';
      const kec = activePinData?.kecamatan || '-';
      const kab = activePinData?.kabkot || '-';
      const prov = activePinData?.provinsi || '-';

      let totalM2 = 0;
      parts.forEach(p => { totalM2 += calculatePolygonArea(p); });
      const luasM2 = totalM2.toFixed(2);
      const luasHa = (totalM2 / 10000).toFixed(6);

      const rowsData = [];
      parts.forEach((pList, pIdx) => {
        const pfx = parts.length > 1 ? String.fromCharCode(65 + pIdx) : 'P';
        pList.forEach((v, vIdx) => {
          const nodeLabel = `${pfx}${vIdx + 1}`;
          const nextV = pList[(vIdx + 1) % pList.length];
          const dist = L.latLng(v.lat, v.lng).distanceTo(L.latLng(nextV.lat, nextV.lng));
          const utm = getUtmCoordinates(v.lat, v.lng);

          rowsData.push([
            nodeLabel,
            parseFloat(v.lat.toFixed(7)),
            parseFloat(v.lng.toFixed(7)),
            parseFloat(utm.x.toFixed(2)),
            parseFloat(utm.y.toFixed(2)),
            utm.zone,
            parseFloat(dist.toFixed(2))
          ]);
        });
      });

      if (typeof XLSX !== 'undefined') {
        const wb = XLSX.utils.book_new();
        const sheetData = [
          ['DUTAGEOSPASI : DAFTAR KOORDINAT PATOK BATAS TANAH'],
          ['Pengembang: Duta Digital Agensi (dutamik.id) | Tagline: Duta Media Informasi berKarya | Sukoharjo, Jawa Tengah'],
          [],
          ['Pemrakarsa', pemrakarsa, '', 'Kabupaten / Kota', kab],
          ['Kegiatan', kegiatan, '', 'Provinsi', prov],
          ['Tahun', tahun, '', 'Luas Terhitung', `${formatAreaM2(totalM2)} (${formatAreaHa(totalM2 / 10000)})`],
          [],
          ['PATOK', 'LATITUDE (DD)', 'LONGITUDE (DD)', 'UTM X (TIMUR)', 'UTM Y (UTARA)', 'ZONA UTM', 'JARAK BATAS (M)'],
          ...rowsData,
          [],
          ['Berkas dihasilkan otomatis oleh sistem DutaGeoSpasi (dutamik.id). Standar Datum WGS 84 dan Proyeksi UTM Nasional Kadastral.']
        ];
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        ws['!cols'] = [
          { wch: 12 },
          { wch: 18 },
          { wch: 18 },
          { wch: 18 },
          { wch: 18 },
          { wch: 12 },
          { wch: 18 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Daftar Patok');
        XLSX.writeFile(wb, 'DutaGeoSpasi_daftar_patok.xlsx');
        showToast('Berkas Excel patok batas (.xlsx) berhasil diunduh.', 'success');
        return;
      }

      let csvContent = `DUTAGEOSPASI : DAFTAR KOORDINAT PATOK BATAS TANAH\r\n`;
      csvContent += `Pengembang: Duta Digital Agensi (dutamik.id) | Tagline: Duta Media Informasi berKarya | Sukoharjo, Jawa Tengah\r\n\r\n`;
      csvContent += `Pemrakarsa,${pemrakarsa},,Kabupaten / Kota,${kab}\r\n`;
      csvContent += `Kegiatan,${kegiatan},,Provinsi,${prov}\r\n`;
      csvContent += `Tahun,${tahun},,Luas Terhitung,"${formatAreaM2(totalM2)} (${formatAreaHa(totalM2 / 10000)})"\r\n\r\n`;
      csvContent += `PATOK,LATITUDE (DD),LONGITUDE (DD),UTM X (TIMUR),UTM Y (UTARA),ZONA UTM,JARAK BATAS (M)\r\n`;
      rowsData.forEach(r => {
        csvContent += `${r[0]},${r[1]},${r[2]},${r[3]},${r[4]},${r[5]},${r[6]}\r\n`;
      });
      downloadFile(csvContent, 'DutaGeoSpasi_daftar_patok.csv', 'text/csv;charset=utf-8;');
      showToast('Berkas CSV koordinat patok berhasil diunduh.', 'success');
    }

    function exportCoordinatesOnly() {
      openExportCoordsModal();
    }

    function openExportCoordsModal() {
      if (!isMemberProActive()) {
        showToast('Fitur Ekspor Format CAD & Koordinat khusus Member PRO. Silakan masuk atau upgrade akun.', 'warn');
        openMemberModal();
        return;
      }
      ensureActiveVerticesFromDraw();
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      if (!parts[0] || parts[0].length < 3) {
        showToast('Pilih atau gambar bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }
      const modal = document.getElementById('modalExportCoords');
      if (modal) modal.style.display = 'flex';
    }

    function closeExportCoordsModal() {
      const modal = document.getElementById('modalExportCoords');
      if (modal) modal.style.display = 'none';
    }

    function exportDXF() {
      if (!isMemberProActive()) {
        showToast('Fitur Ekspor AutoCAD DXF (.dxf) khusus Member PRO. Silakan masuk atau upgrade akun.', 'warn');
        openMemberModal();
        return;
      }
      ensureActiveVerticesFromDraw();
      const rawParts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      if (!rawParts[0] || rawParts[0].length < 3) {
        showToast('Pilih atau gambar bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }

      const parts = rawParts;
      let dxf = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n';
      dxf += '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n3\n';
      dxf += '0\nLAYER\n2\nBATAS_BIDANG\n70\n0\n62\n1\n6\nCONTINUOUS\n';
      dxf += '0\nLAYER\n2\nPATOK_BATAS\n70\n0\n62\n3\n6\nCONTINUOUS\n';
      dxf += '0\nLAYER\n2\nTEKS_PATOK\n70\n0\n62\n7\n6\nCONTINUOUS\n';
      dxf += '0\nENDTAB\n0\nENDSEC\n';
      dxf += '0\nSECTION\n2\nENTITIES\n';

      parts.forEach((pList, pIdx) => {
        const pfx = parts.length > 1 ? String.fromCharCode(65 + pIdx) : 'P';

        dxf += '0\nPOLYLINE\n8\nBATAS_BIDANG\n66\n1\n70\n1\n10\n0.0\n20\n0.0\n30\n0.0\n';
        pList.forEach(v => {
          const utm = getUtmCoordinates(v.lat, v.lng);
          dxf += `0\nVERTEX\n8\nBATAS_BIDANG\n10\n${utm.x.toFixed(3)}\n20\n${utm.y.toFixed(3)}\n30\n0.0\n`;
        });
        dxf += '0\nSEQEND\n';

        pList.forEach((v, vIdx) => {
          const utm = getUtmCoordinates(v.lat, v.lng);
          const label = `${pfx}${vIdx + 1}`;
          dxf += `0\nPOINT\n8\nPATOK_BATAS\n10\n${utm.x.toFixed(3)}\n20\n${utm.y.toFixed(3)}\n30\n0.0\n`;
          dxf += `0\nTEXT\n8\nTEKS_PATOK\n10\n${(utm.x + 0.6).toFixed(3)}\n20\n${(utm.y + 0.6).toFixed(3)}\n30\n0.0\n40\n1.2\n1\n${label}\n50\n0.0\n`;
        });

        let sumX = 0, sumY = 0;
        pList.forEach(v => {
          const utm = getUtmCoordinates(v.lat, v.lng);
          sumX += utm.x;
          sumY += utm.y;
        });
        const cX = sumX / pList.length;
        const cY = sumY / pList.length;
        const partArea = calculatePolygonArea(pList);
        dxf += `0\nTEXT\n8\nTEKS_PATOK\n10\n${cX.toFixed(3)}\n20\n${cY.toFixed(3)}\n30\n0.0\n40\n1.8\n1\nLuas: ${formatAreaM2(partArea)}\n50\n0.0\n`;
      });

      dxf += '0\nENDSEC\n0\nEOF\n';

      downloadFile(dxf, 'DutaGeoSpasi_bidang_cad.dxf', 'application/dxf;charset=utf-8');
      showToast('Berkas AutoCAD DXF (.dxf) berhasil diunduh.', 'success');
    }

    let currentRescaleMode = 'oss';
    let currentRescaleInitialM2 = 0;

    function renderRescalePatokChips(rawParts) {
      const container = document.getElementById('rescalePatokChipsContainer');
      if (!container) return;
      container.innerHTML = '';
      const partPrefixes = ['A', 'B', 'C', 'D', 'E', 'F'];
      rawParts.forEach((part, pIdx) => {
        const pfx = rawParts.length > 1 ? (partPrefixes[pIdx] || `P${pIdx+1}`) : 'P';
        part.forEach((v, idx) => {
          const nodeLabel = rawParts.length > 1 ? `${pfx}${idx + 1}` : `P${idx + 1}`;
          const isLocked = (typeof window.isVertexLocked === 'function') ? window.isVertexLocked(pIdx, idx) : false;
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = `patok-lock-chip ${isLocked ? 'locked' : ''}`;
          chip.title = isLocked ? `Patok ${nodeLabel} TERKUNCI (Klik untuk membebaskan)` : `Patok ${nodeLabel} BEBAS (Klik untuk mengunci)`;
          chip.innerHTML = `${nodeLabel} ${isLocked ? '🔒 Terkunci' : '🔓 Bebas'}`;
          chip.onclick = () => {
            if (typeof window.toggleVertexLock === 'function') {
              window.toggleVertexLock(pIdx, idx);
              renderRescalePatokChips(rawParts);
              updateRescalePreview();
            }
          };
          container.appendChild(chip);
        });
      });
    }

    function unlockAllVerticesForRescale() {
      if (typeof window.unlockAllVertices === 'function') {
        window.unlockAllVertices();
      } else if (window.lockedVertexSet) {
        window.lockedVertexSet.clear();
      }
      const rawParts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      renderRescalePatokChips(rawParts);
      updateRescalePreview();
    }

    function lockAlternateVerticesForRescale() {
      const rawParts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      rawParts.forEach((part, pIdx) => {
        part.forEach((v, idx) => {
          if (idx % 2 === 0) {
            if (typeof window.lockedVertexSet !== 'undefined') window.lockedVertexSet.add(`${pIdx}_${idx}`);
          } else {
            if (typeof window.lockedVertexSet !== 'undefined') window.lockedVertexSet.delete(`${pIdx}_${idx}`);
          }
        });
      });
      renderRescalePatokChips(rawParts);
      updateRescalePreview();
    }

    function computePartialRescaleParts(rawParts, targetCleanM2) {
      let anyUnlocked = false;
      rawParts.forEach((part, pIdx) => {
        part.forEach((v, idx) => {
          if (!window.isVertexLocked || !window.isVertexLocked(pIdx, idx)) {
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
          if (typeof window.isVertexLocked === 'function' && window.isVertexLocked(pIdx, idx)) {
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
          const s = Math.sqrt(Math.max(0.0001, targetPartArea / curPartArea));
          return part.map(v => ({
            lat: Number((cLat + s * (v.lat - cLat)).toFixed(7)),
            lng: Number((cLng + s * (v.lng - cLng)).toFixed(7))
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

        for (let it = 0; it < 36; it++) {
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
        }
        return bestPts;
      });
    }

    function openRescaleModal(mode = 'oss') {
      ensureActiveVerticesFromDraw();
      const rawParts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      if (!rawParts[0] || rawParts[0].length < 3) {
        showToast('Pilih atau gambar bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }
      currentRescaleMode = mode;
      let totalM2 = 0;
      rawParts.forEach(p => { totalM2 += calculatePolygonArea(p); });
      currentRescaleInitialM2 = totalM2;

      const modal = document.getElementById('modalRescaleParcel');
      const titleEl = document.getElementById('rescaleModalTitle');
      const subEl = document.getElementById('rescaleModalSub');
      const labelEl = document.getElementById('rescaleInputLabel');
      const inputEl = document.getElementById('rescaleInputValue');
      const helpEl = document.getElementById('rescaleInputHelp');
      const initialM2El = document.getElementById('rescaleInitialAreaM2');
      const initialHaEl = document.getElementById('rescaleInitialAreaHa');

      if (initialM2El) initialM2El.innerText = formatAreaM2(totalM2);
      if (initialHaEl) initialHaEl.innerText = `(${formatAreaHa(totalM2 / 10000)})`;

      if (mode === 'oss') {
        if (titleEl) titleEl.innerText = 'PENYESUAIAN LUAS SISTEM OSS';
        if (subEl) subEl.innerText = 'Reskala geometri kompensasi distorsi geodesik sistem OSS RBA';
        if (labelEl) labelEl.innerText = 'Luas Terbaca di Sistem OSS (m²)';
        if (inputEl) {
          inputEl.placeholder = (totalM2 * 1.018).toFixed(2);
          inputEl.value = '';
        }
        if (helpEl) helpEl.innerText = 'Masukkan angka luas yang tertera saat hasil ekspor pertama kali terbaca di OSS RBA.';
      } else {
        if (titleEl) titleEl.innerText = 'PENYESUAIAN LUAS DATA BPN';
        if (subEl) subEl.innerText = 'Reskala geometri terhadap luas sertifikat atau surat ukur resmi ATR/BPN';
        if (labelEl) labelEl.innerText = 'Luas Sertifikat / Surat Ukur BPN (m²)';
        if (inputEl) {
          inputEl.placeholder = totalM2.toFixed(2);
          inputEl.value = '';
        }
        if (helpEl) helpEl.innerText = 'Masukkan angka luas resmi yang tertera pada sertifikat tanah / Surat Ukur BPN.';
      }

      renderRescalePatokChips(rawParts);
      updateRescalePreview();
      if (modal) modal.style.display = 'flex';
    }

    function closeRescaleModal() {
      const modal = document.getElementById('modalRescaleParcel');
      if (modal) modal.style.display = 'none';
    }

    function updateRescalePreview() {
      const inputEl = document.getElementById('rescaleInputValue');
      const targetCleanEl = document.getElementById('rescaleTargetCleanM2');
      const newAreaEl = document.getElementById('rescalePreviewNewM2');
      const scaleRatioEl = document.getElementById('rescalePreviewScaleRatio');
      const btnConfirm = document.getElementById('btnConfirmRescale');
      const warnEl = document.getElementById('rescaleLockedWarn');

      ensureActiveVerticesFromDraw();
      const rawParts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];

      let totalPts = 0;
      let lockedCount = 0;
      rawParts.forEach((part, pIdx) => {
        part.forEach((v, idx) => {
          totalPts++;
          if (typeof window.isVertexLocked === 'function' && window.isVertexLocked(pIdx, idx)) {
            lockedCount++;
          }
        });
      });

      if (lockedCount >= totalPts && totalPts > 0) {
        if (warnEl) warnEl.style.display = 'block';
        if (targetCleanEl) targetCleanEl.innerText = '-';
        if (newAreaEl) newAreaEl.innerText = '-';
        if (scaleRatioEl) scaleRatioEl.innerText = 'Terkunci Semua';
        if (btnConfirm) btnConfirm.disabled = true;
        return;
      } else {
        if (warnEl) warnEl.style.display = 'none';
      }

      const val = parseFloat(inputEl?.value);
      if (!val || isNaN(val) || val <= 0 || currentRescaleInitialM2 <= 0) {
        if (targetCleanEl) targetCleanEl.innerText = '-';
        if (newAreaEl) newAreaEl.innerText = '-';
        if (scaleRatioEl) scaleRatioEl.innerText = '-';
        if (btnConfirm) btnConfirm.disabled = true;
        return;
      }

      let targetClean = 0;
      let newArea = 0;
      let s = 1;

      if (currentRescaleMode === 'oss') {
        targetClean = currentRescaleInitialM2;
        newArea = Math.max(0.01, currentRescaleInitialM2 * (targetClean / val));
        s = Math.sqrt(newArea / currentRescaleInitialM2);
      } else {
        targetClean = Math.max(0.01, val);
        newArea = targetClean;
        s = Math.sqrt(newArea / currentRescaleInitialM2);
      }

      const rescaleResult = computePartialRescaleParts(rawParts, targetClean);
      if (!rescaleResult) {
        if (btnConfirm) btnConfirm.disabled = true;
        return;
      }

      let actualRescaledM2 = 0;
      rescaleResult.forEach(p => { actualRescaledM2 += calculatePolygonArea(p); });

      if (targetCleanEl) targetCleanEl.innerText = formatAreaM2(targetClean);
      if (newAreaEl) newAreaEl.innerText = formatAreaM2(targetClean);
      if (scaleRatioEl) {
        scaleRatioEl.innerText = lockedCount > 0 ? `${s.toFixed(6)}x (${lockedCount} patok dikunci)` : `${s.toFixed(6)}x`;
      }
      if (btnConfirm) btnConfirm.disabled = false;
    }

    function applyRescaleAndDownload() {
      const inputEl = document.getElementById('rescaleInputValue');
      const val = parseFloat(inputEl?.value);
      if (!val || isNaN(val) || val <= 0 || currentRescaleInitialM2 <= 0) {
        showToast('Masukkan nilai luas yang valid terlebih dahulu.', 'warn');
        return;
      }

      ensureActiveVerticesFromDraw();
      const rawParts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      if (!rawParts[0] || rawParts[0].length < 3) {
        showToast('Pilih atau gambar bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }

      let targetClean = 0;
      if (currentRescaleMode === 'oss') {
        const newArea = Math.max(0.01, currentRescaleInitialM2 * (currentRescaleInitialM2 / val));
        targetClean = newArea;
      } else {
        targetClean = Math.max(0.01, val);
      }

      const newParts = computePartialRescaleParts(rawParts, targetClean);
      if (!newParts) {
        showToast('Minimal 1 patok harus bebas (tidak terkunci) agar luas bidang dapat diskala.', 'warn');
        return;
      }

      if (activeMultiParts && activeMultiParts.length > 1) {
        activeMultiParts = newParts;
        activeVertices = activeMultiParts[0];
      } else {
        activeVertices = newParts[0];
        activeMultiParts = null;
      }

      let updatedTotalM2 = 0;
      newParts.forEach(p => { updatedTotalM2 += calculatePolygonArea(p); });

      if (!activePinData) {
        activePinData = {
          fid: 'Reskala Mandiri',
          tipe_hak: 'Hasil Pengukuran',
          luas_m2: targetClean,
          luas_terdaftar_m2: targetClean,
          luas_ha: targetClean / 10000,
          desa: '-',
          kecamatan: '-',
          kabkot: '-',
          provinsi: '-'
        };
      } else {
        activePinData.luas_m2 = targetClean;
        activePinData.luas_terdaftar_m2 = targetClean;
        activePinData.luas_ha = targetClean / 10000;
      }

      if (typeof isGeometryManuallyEdited !== 'undefined') isGeometryManuallyEdited = false;
      renderCanvasPolygon(true);
      closeRescaleModal();
      showToast(`Geometri berhasil diskala 100% presisi (${formatAreaM2(targetClean)}). Mengunduh paket Shapefile...`, 'success');
      setTimeout(() => {
        triggerShpDownloadFromActive();
      }, 350);
    }

    function downloadCoordsCad(mode = 'scr_scale100') {
      if (!isMemberProActive()) {
        showToast('Fitur Ekspor Format CAD & Koordinat khusus Member PRO. Silakan masuk atau upgrade akun.', 'warn');
        openMemberModal();
        return;
      }
      if (!window._dgKey || window._dgKey !== 0x7E3A9) {
        showToast('Validasi format CAD gagal.', 'crimson');
        return;
      }
      ensureActiveVerticesFromDraw();
      const rawParts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      if (!rawParts[0] || rawParts[0].length < 3) return;
      const parts = getExportVerticesWithOssAdjustment(rawParts);

      if (mode === 'scr_scale100' || mode === 'scr_scale100_m' || mode === 'scr_scale100_cm') {
        const isCm = (mode === 'scr_scale100_cm');
        const scaleMult = isCm ? 100.0 : 1.0;
        const unitName = isCm ? 'Centimeter (1 unit = 1 cm)' : 'Meter (1 unit = 1 m / 100 cm lapangan)';
        
        let p1Utm = null;
        for (let pIdx = 0; pIdx < parts.length; pIdx++) {
          if (parts[pIdx] && parts[pIdx].length > 0) {
            p1Utm = getUtmCoordinates(parts[pIdx][0].lat, parts[pIdx][0].lng);
            break;
          }
        }
        if (!p1Utm) return;
        const originX = p1Utm.x;
        const originY = p1Utm.y;

        let scr = '; ==============================================================================\n';
        scr += '; AUTOCAD SCRIPT FILE (.SCR) : SKALA 1cm : 100cm (SKALA 1:100)\n';
        scr += '; Aplikasi: Duta GeoSpasi (geospasi.dutamik.id)\n';
        scr += '; Pengembang: Duta Digital Agensi (dutamik.id) : Sukoharjo, Jawa Tengah\n';
        scr += '; Tagline: Duta Media Informasi berKarya\n';
        scr += '; Mode: Gambar Bidang Langsung Skala 1cm : 100cm (Skala 1:100)\n';
        scr += `; Satuan CAD: ${unitName}\n`;
        scr += '; Titik Acuan: Origin Lokal (P1 = 0.000, 0.000)\n';
        scr += '; Cara Pakai: Buka AutoCAD / Civil 3D, seret file .SCR ini langsung ke layar kerja\n';
        scr += '; ==============================================================================\n';

        parts.forEach((pList) => {
          if (!pList || pList.length < 3) return;
          scr += '_PLINE\n';
          pList.forEach((v) => {
            const utm = getUtmCoordinates(v.lat, v.lng);
            const dx = (utm.x - originX) * scaleMult;
            const dy = (utm.y - originY) * scaleMult;
            scr += `${dx.toFixed(isCm ? 2 : 3)},${dy.toFixed(isCm ? 2 : 3)}\n`;
          });
          scr += '_C\n';
        });

        parts.forEach((pList) => {
          if (!pList) return;
          pList.forEach((v) => {
            const utm = getUtmCoordinates(v.lat, v.lng);
            const dx = (utm.x - originX) * scaleMult;
            const dy = (utm.y - originY) * scaleMult;
            scr += `_POINT ${dx.toFixed(isCm ? 2 : 3)},${dy.toFixed(isCm ? 2 : 3)}\n`;
          });
        });

        scr += '_ZOOM\n_E\n';
        const fn = isCm ? 'DutaGeoSpasi_bidang_skala_1_100_cm.scr' : 'DutaGeoSpasi_bidang_skala_1_100_meter.scr';
        downloadFile(scr, fn, 'application/x-cad-script;charset=utf-8');
        showToast(`Script AutoCAD (.SCR) Skala 1cm : 100cm (${isCm ? 'Centimeter' : 'Meter'}) berhasil diunduh. Seret berkas ke AutoCAD!`, 'success');
      } else if (mode === 'scr_utm' || mode === 'scr') {
        let firstUtm = null;
        for (let pIdx = 0; pIdx < parts.length; pIdx++) {
          if (parts[pIdx] && parts[pIdx].length > 0) {
            firstUtm = getUtmCoordinates(parts[pIdx][0].lat, parts[pIdx][0].lng);
            break;
          }
        }
        const zoneStr = firstUtm ? firstUtm.zone : 'UTM WGS84';

        let scr = '; ==============================================================================\n';
        scr += '; AUTOCAD SCRIPT FILE (.SCR) : KOORDINAT SISTEM SHP (UTM WGS84)\n';
        scr += '; Aplikasi: Duta GeoSpasi (geospasi.dutamik.id)\n';
        scr += '; Pengembang: Duta Digital Agensi (dutamik.id) : Sukoharjo, Jawa Tengah\n';
        scr += '; Tagline: Duta Media Informasi berKarya\n';
        scr += '; Mode: Gambar Bidang Sesuai Koordinat Sistem SHP ke AutoCAD\n';
        scr += `; Sistem Koordinat: UTM WGS84 Cartesian (X Easting, Y Northing meter) Zona ${zoneStr}\n`;
        scr += '; Cara Pakai: Buka AutoCAD / Civil 3D, seret file .SCR ini langsung ke layar kerja\n';
        scr += '; ==============================================================================\n';

        parts.forEach((pList) => {
          if (!pList || pList.length < 3) return;
          scr += '_PLINE\n';
          pList.forEach((v) => {
            const utm = getUtmCoordinates(v.lat, v.lng);
            scr += `${utm.x.toFixed(3)},${utm.y.toFixed(3)}\n`;
          });
          scr += '_C\n';
        });

        parts.forEach((pList) => {
          if (!pList) return;
          pList.forEach((v) => {
            const utm = getUtmCoordinates(v.lat, v.lng);
            scr += `_POINT ${utm.x.toFixed(3)},${utm.y.toFixed(3)}\n`;
          });
        });

        scr += '_ZOOM\n_E\n';
        downloadFile(scr, 'DutaGeoSpasi_bidang_koordinat_shp.scr', 'application/x-cad-script;charset=utf-8');
        showToast('Script AutoCAD (.SCR) Koordinat Sistem SHP (UTM WGS84) berhasil diunduh. Seret berkas ke AutoCAD!', 'success');
      } else if (mode === 'penz') {
        let penz = 'Point,Easting,Northing,Elevation,Description\n';
        let ptNum = 1;
        parts.forEach((pList, pIdx) => {
          const pfx = parts.length > 1 ? String.fromCharCode(65 + pIdx) : 'P';
          pList.forEach((v, idx) => {
            const utm = getUtmCoordinates(v.lat, v.lng);
            penz += `${ptNum},${utm.x.toFixed(3)},${utm.y.toFixed(3)},0.000,${pfx}${idx + 1}\n`;
            ptNum++;
          });
        });
        downloadFile(penz, 'DutaGeoSpasi_points_cad_penz.txt', 'text/plain;charset=utf-8');
        showToast('Format CAD PENZ (Point, Easting, Northing, Elev, Desc) berhasil diunduh.', 'success');
      } else {
        let xy = '';
        parts.forEach((pList) => {
          pList.forEach((v) => {
            const utm = getUtmCoordinates(v.lat, v.lng);
            xy += `${utm.x.toFixed(3)},${utm.y.toFixed(3)}\r\n`;
          });
        });
        downloadFile(xy, 'DutaGeoSpasi_koordinat_cad_xy.txt', 'text/plain;charset=utf-8');
        showToast('Format X,Y murni sistem CAD berhasil diunduh.', 'success');
      }
    }

    function exportGeoJSON() {
      if (!isMemberProActive()) {
        showToast('Fitur Ekspor GeoJSON khusus Member PRO. Silakan masuk atau upgrade akun.', 'warn');
        openMemberModal();
        return;
      }
      if (!window._dgKey || window._dgKey !== 0x7E3A9) {
        showToast('Validasi geometri GeoJSON gagal.', 'crimson');
        return;
      }
      ensureActiveVerticesFromDraw();
      let geojsonObj;
      const pemrakarsa = (document.getElementById('shpPemrakarsa')?.value.trim() || 'PEMOHON OSS RBA').toUpperCase();
      const kegiatan = (document.getElementById('shpKegiatan')?.value.trim() || 'KESESUAIAN KEGIATAN PEMANFAATAN RUANG (KKPR)').toUpperCase();
      const tahun = (document.getElementById('shpTahun')?.value.trim() || '2026').toUpperCase();
      const layerName = (document.getElementById('shpLayer')?.value.trim() || 'TAPAK PROYEK').toUpperCase();
      const provinsi = (document.getElementById('shpProvinsi')?.value.trim() || activePinData?.provinsi || '-').toUpperCase();
      const keterangan = (document.getElementById('shpKeterangan')?.value.trim() || activePinData?.alamat_lengkap || activePinData?.alamat || '-').toUpperCase();

      const rawParts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : (activeVertices && activeVertices.length >= 3 ? [activeVertices] : []);
      const parts = getExportVerticesWithOssAdjustment(rawParts);

      if (parts.length > 1) {
        const coords = parts.map(part => {
          const closed = [...part];
          if (closed.length > 0 && (closed[0].lat !== closed[closed.length-1].lat || closed[0].lng !== closed[closed.length-1].lng)) {
            closed.push(closed[0]);
          }
          return [closed.map(p => [p.lng, p.lat])];
        });
        const areaM2 = parts.reduce((sum, p) => sum + calculatePolygonArea(p), 0);
        const luasHa = Number((areaM2 / 10000.0).toFixed(6));
        geojsonObj = {
          type: "FeatureCollection",
          properties: {
            APLIKASI: "DutaGeoSpasi",
            DEVELOPER: "Duta Digital Agensi",
            URL: "https://dutamik.id",
            TAGLINE: "Duta Media Informasi berKarya",
            LOKASI: "Sukoharjo, Jawa Tengah"
          },
          features: [{
            type: "Feature",
            properties: {
              PEMRAKARSA: pemrakarsa,
              KEGIATAN: kegiatan,
              TAHUN: tahun,
              PROVINSI: provinsi,
              KETERANGAN: keterangan,
              LAYER: layerName,
              LUAS: luasHa
            },
            geometry: {
              type: "MultiPolygon",
              coordinates: coords
            }
          }]
        };
      } else if (parts.length === 1 && parts[0].length >= 3) {
        const closed = [...parts[0]];
        if (closed.length > 0 && (closed[0].lat !== closed[closed.length-1].lat || closed[0].lng !== closed[closed.length-1].lng)) {
          closed.push(closed[0]);
        }
        const areaM2 = calculatePolygonArea(parts[0]);
        const luasHa = Number((areaM2 / 10000.0).toFixed(6));
        geojsonObj = {
          type: "FeatureCollection",
          properties: {
            APLIKASI: "DutaGeoSpasi",
            DEVELOPER: "Duta Digital Agensi",
            URL: "https://dutamik.id",
            TAGLINE: "Duta Media Informasi berKarya",
            LOKASI: "Sukoharjo, Jawa Tengah"
          },
          features: [{
            type: "Feature",
            properties: {
              PEMRAKARSA: pemrakarsa,
              KEGIATAN: kegiatan,
              TAHUN: tahun,
              PROVINSI: provinsi,
              KETERANGAN: keterangan,
              LAYER: layerName,
              LUAS: luasHa
            },
            geometry: {
              type: "Polygon",
              coordinates: [closed.map(p => [p.lng, p.lat])]
            }
          }]
        };
      } else {
        geojsonObj = drawnItems.toGeoJSON();
      }

      if (!geojsonObj || !geojsonObj.features || geojsonObj.features.length === 0) {
        showToast('Belum ada bidang tanah aktif untuk diekspor.', 'warn');
        return;
      }
      const jsonStr = JSON.stringify(geojsonObj, null, 2);
      downloadFile(jsonStr, 'DutaGeoSpasi_bidang_tanah.geojson', 'application/geo+json');
      showToast('Berkas GeoJSON DutaGeoSpasi berhasil diunduh!', 'success');
    }

    var currentAttrTab = 'oss';

    function switchAttrTab(tab) {
      if (tab === 'custom' && !(typeof isMemberProActive === 'function' && isMemberProActive())) {
        showToast('Untuk mengedit atribut peta memerlukan akses PRO. Upgrade ke PRO untuk mengaktifkan.', 'warn');
        openMemberModal();
        return;
      }
      currentAttrTab = tab;
      const btnOss = document.getElementById('tabBtnOss');
      const btnCustom = document.getElementById('tabBtnCustom');
      const contentOss = document.getElementById('tabContentOss');
      const contentCustom = document.getElementById('tabContentCustom');
      const badge = document.getElementById('attrModeBadge');
      if (tab === 'custom') {
        if (btnOss) btnOss.classList.remove('active');
        if (btnCustom) btnCustom.classList.add('active');
        if (contentOss) contentOss.style.display = 'none';
        if (contentCustom) contentCustom.style.display = 'flex';
        if (badge) {
          badge.textContent = 'KUSTOM GIS';
          badge.className = 'badge-pill amber';
        }
        const tbody = document.getElementById('customAttrTbody');
        if (tbody && tbody.children.length === 0) {
          initDefaultCustomAttrs();
        }
      } else {
        if (btnOss) btnOss.classList.add('active');
        if (btnCustom) btnCustom.classList.remove('active');
        if (contentOss) contentOss.style.display = 'flex';
        if (contentCustom) contentCustom.style.display = 'none';
        if (badge) {
          badge.textContent = 'OSS / AMDALNET';
          badge.className = 'badge-pill blue';
        }
      }
    }

    function addCustomAttrRow(name, type, val) {
      if (!(typeof isMemberProActive === 'function' && isMemberProActive())) {
        showToast('Fitur tambah atribut kustom khusus Member PRO.', 'warn');
        openMemberModal();
        return;
      }
      const tbody = document.getElementById('customAttrTbody');
      if (!tbody) return;
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-light)';
      const safeName = (name || '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10);
      const safeType = type || 'C';
      const safeVal = val != null ? val : '';

      tr.innerHTML = `
        <td style="padding: 3px 4px;">
          <input type="text" class="custom-attr-name" value="${safeName}" placeholder="KOLOM" maxlength="10" style="text-transform: uppercase; font-family: 'JetBrains Mono', monospace; font-weight: 600;" oninput="this.value = this.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10)">
        </td>
        <td style="padding: 3px 4px;">
          <select class="custom-attr-type">
            <option value="C"${safeType === 'C' ? ' selected' : ''}>C (Teks)</option>
            <option value="N"${safeType === 'N' ? ' selected' : ''}>N (Angka)</option>
            <option value="D"${safeType === 'D' ? ' selected' : ''}>D (Tanggal)</option>
          </select>
        </td>
        <td style="padding: 3px 4px;">
          <input type="text" class="custom-attr-val" value="${safeVal}" placeholder="Nilai">
        </td>
        <td style="padding: 3px 4px; text-align: center;">
          <button type="button" onclick="removeCustomAttrRow(this)" style="border: none; background: transparent; cursor: pointer; color: var(--crimson); padding: 2px;" aria-label="Hapus Kolom">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    function removeCustomAttrRow(btn) {
      const tr = btn.closest('tr');
      if (tr) tr.remove();
    }

    function initDefaultCustomAttrs() {
      const tbody = document.getElementById('customAttrTbody');
      if (!tbody) return;
      tbody.innerHTML = '';

      let areaM2 = 0;
      if (activeMultiParts && activeMultiParts.length > 1) {
        areaM2 = activeMultiParts.reduce((sum, p) => sum + calculatePolygonArea(p), 0);
      } else if (activeVertices && activeVertices.length >= 3) {
        areaM2 = calculatePolygonArea(activeVertices);
      }

      const pData = activePinData || {};
      const nib = pData.nib_lengkap || pData.nib || '-';
      const noHak = pData.nomor_hak_raw || (pData.nomor_hak ? pData.nomor_hak.replace(/^[^\d]*/, '') : '-');
      const hak = (pData.tipe_hak || '-').toUpperCase();
      const nosu = pData.nosu || '-';
      const desa = (pData.desa || '-').toUpperCase();
      const kec = (pData.kecamatan || '-').toUpperCase();
      const kab = (pData.kabkot || '-').toUpperCase();
      const prov = (pData.provinsi || '-').toUpperCase();
      const kantah = (pData.kantah || '-').toUpperCase();
      const kluster = pData.kluster_ptsl ? pData.kluster_ptsl.toUpperCase().slice(0, 16) : '-';
      const luasBpn = Number((pData.luas_m2 || areaM2 || 0).toFixed(2));
      const luasUkur = Number(areaM2.toFixed(2));
      const selisih = Number(Math.abs(luasUkur - luasBpn).toFixed(2));
      const tahun = Number(pData.tahun && pData.tahun !== '-' ? pData.tahun : 2026);
      const statusVal = (pData.status_validasi || '-').toUpperCase().slice(0, 18);

      addCustomAttrRow('NIB', 'C', nib);
      addCustomAttrRow('NO_HAK', 'C', noHak);
      addCustomAttrRow('HAK_TANAH', 'C', hak);
      addCustomAttrRow('NOSU', 'C', nosu);
      addCustomAttrRow('DESA', 'C', desa);
      addCustomAttrRow('KECAMATAN', 'C', kec);
      addCustomAttrRow('KABKOT', 'C', kab);
      addCustomAttrRow('PROVINSI', 'C', prov);
      addCustomAttrRow('KANTAH', 'C', kantah);
      addCustomAttrRow('KLUSTER', 'C', kluster);
      addCustomAttrRow('LUAS_BPN', 'N', luasBpn);
      addCustomAttrRow('LUAS_UKUR', 'N', luasUkur);
      addCustomAttrRow('SELISIH_M2', 'N', selisih);
      addCustomAttrRow('TAHUN', 'N', tahun);
      addCustomAttrRow('STATUS', 'C', statusVal);

      const rtrw = (pData.rtrw || 'BUDIDAYA PERMUKIMAN').toUpperCase().slice(0, 30);
      const rdtr = (pData.rdtr || 'ZONASI PERDA BERLAKU').toUpperCase().slice(0, 30);
      const lsd = (pData.lsd || 'NON-LSD (BEBAS ALIH)').toUpperCase().slice(0, 25);
      const lbs = (pData.lbs || 'BUKAN SAWAH BAKU').toUpperCase().slice(0, 25);
      const kwsHutan = (pData.hutan || 'APL (NON HUTAN)').toUpperCase().slice(0, 25);
      const znt = (pData.znt || 'ZONA NILAI PASAR').toUpperCase().slice(0, 25);

      addCustomAttrRow('RTRW', 'C', rtrw);
      addCustomAttrRow('RDTR', 'C', rdtr);
      addCustomAttrRow('STATUS_LSD', 'C', lsd);
      addCustomAttrRow('STATUS_LBS', 'C', lbs);
      addCustomAttrRow('KWSHUTAN', 'C', kwsHutan);
      addCustomAttrRow('ZNT_M2', 'C', znt);
    }

    function getCustomFieldsFromTable() {
      const tbody = document.getElementById('customAttrTbody');
      if (!tbody) return [];
      const rows = tbody.querySelectorAll('tr');
      const results = [];
      rows.forEach(r => {
        const nameInput = r.querySelector('.custom-attr-name');
        const typeSelect = r.querySelector('.custom-attr-type');
        const valInput = r.querySelector('.custom-attr-val');
        const name = (nameInput?.value.trim() || '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10);
        if (name) {
          const type = typeSelect?.value || 'C';
          const val = valInput?.value.trim() || '';
          results.push({ name, type, val, len: type === 'N' ? 16 : (type === 'D' ? 8 : 254), dec: type === 'N' ? 2 : 0 });
        }
      });
      return results;
    }

    function openLegalModal(tab) {
      const page = (tab === 'privacy' ? 'jaminan-privasi.html' : (tab === 'terms' ? 'syarat-ketentuan.html' : (tab === 'disclaimer' ? 'penafian-layanan.html' : (tab === 'guide' ? 'panduan-fitur.html' : (tab === 'contact' ? 'hubungi-kami.html' : 'bantuan.html')))));
      window.open(page, '_blank');
    }

    function closeLegalModal() {}

    async function triggerShpDownloadFromActive() {
      if (!activeVertices || activeVertices.length < 3) {
        showToast('Pilih atau buat bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }

      const isPro = (typeof isMemberProActive === 'function') ? isMemberProActive() : false;

      const rawParts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      const parts = getExportVerticesWithOssAdjustment(rawParts);
      let areaM2 = 0;
      parts.forEach(p => { areaM2 += calculatePolygonArea(p); });
      const partsCoords = parts.map(part => part.map(v => [v.lng, v.lat]));
      const luasHa = Number((areaM2 / 10000.0).toFixed(6));

      if (!isPro && areaM2 > 150) {
        showToast(`Ekspor Shapefile akun Gratis dibatasi maksimal luas 150 m². Luas bidang saat ini: ${formatAreaM2(areaM2)}. Silakan upgrade ke Member PRO untuk luas tanpa batas.`, 'warn');
        openMemberModal();
        return;
      }

      let attrs = {};
      if (!isPro) {
        attrs = {
          _baseFileName: 'geospasi',
          _zipDownloadName: 'geospasi.zip',
          _customFields: [
            { name: 'LAYER', type: 'C', len: 254, dec: 0, val: 'geospasi.dutamik.id' }
          ]
        };
      } else {
        if (currentAttrTab === 'custom') {
          const customRows = getCustomFieldsFromTable();
          if (customRows.length === 0) {
            showToast('Tambahkan minimal 1 kolom atribut kustom.', 'warn');
            return;
          }
          attrs._customFields = customRows;
        } else {
          const pemrakarsa = (document.getElementById('shpPemrakarsa')?.value.trim() || 'PEMOHON OSS RBA').toUpperCase();
          const kegiatan = (document.getElementById('shpKegiatan')?.value.trim() || 'KKPR / PERIZINAN BERUSAHA').toUpperCase();
          const tahun = (document.getElementById('shpTahun')?.value.trim() || '2026').toUpperCase();
          const layerName = (document.getElementById('shpLayer')?.value.trim() || 'TAPAK PROYEK').toUpperCase();
          const provinsi = (document.getElementById('shpProvinsi')?.value.trim() || activePinData?.provinsi || '-').toUpperCase();
          const keterangan = (document.getElementById('shpKeterangan')?.value.trim() || activePinData?.alamat_lengkap || activePinData?.alamat || '-').toUpperCase();

          attrs = {
            PEMRAKARSA: pemrakarsa,
            KEGIATAN: kegiatan,
            TAHUN: tahun,
            PROVINSI: provinsi,
            KETERANGAN: keterangan,
            LAYER: layerName,
            LUAS: luasHa
          };
        }
        const safeLayer = (document.getElementById('shpLayer')?.value.trim() || 'bidang').toLowerCase().replace(/[^a-z0-9_]/g, '_');
        attrs._baseFileName = `DutaGeoSpasi_${safeLayer}`;
        attrs._zipDownloadName = `DutaGeoSpasi_shapefile_${safeLayer}.zip`;
      }

      showToast('Menyusun berkas ESRI Shapefile ZIP...', 'info');

      try {
        window._dgKey = 0x7E3A9;
        generateShapefileZipClient(partsCoords, attrs);
      } catch (e) {
        showToast('Gagal membuat paket Shapefile: ' + e.message, 'crimson');
      }
    }

    function generateShapefileZipClient(parts, attrs) {
      return new Promise((resolve, reject) => {
        try {
          if (!window._dgKey || window._dgKey !== 0x7E3A9) {
            throw new Error("Checksum integritas spasial tidak valid.");
          }
          const normParts = [];
          const allPts = [];
          for (let p of parts) {
            let pts = p.map(pt => [Number(pt[0]), Number(pt[1])]);
            if (pts.length < 3) continue;
            if (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1]) {
              pts.push([pts[0][0], pts[0][1]]);
            }
            normParts.push(pts);
            allPts.push(...pts);
          }
          if (normParts.length === 0) throw new Error("Tidak ada geometri poligon valid");

          let xmin = allPts[0][0], xmax = allPts[0][0], ymin = allPts[0][1], ymax = allPts[0][1];
          for (let pt of allPts) {
            if (pt[0] < xmin) xmin = pt[0];
            if (pt[0] > xmax) xmax = pt[0];
            if (pt[1] < ymin) ymin = pt[1];
            if (pt[1] > ymax) ymax = pt[1];
          }

          const numParts = normParts.length;
          const numPoints = allPts.length;
          const contentWords = 22 + (numParts * 2) + (numPoints * 8);
          const recBytes = 8 + (contentWords * 2);
          const fileBytes = 100 + recBytes;
          const fileWords = fileBytes / 2;

          const shpBuffer = new ArrayBuffer(fileBytes);
          const shpView = new DataView(shpBuffer);
          const shpUint8 = new Uint8Array(shpBuffer);

          shpView.setInt32(0, 9994, false);
          shpView.setInt32(24, fileWords, false);
          shpView.setInt32(28, 1000, true);
          shpView.setInt32(32, 5, true);
          shpView.setFloat64(36, xmin, true);
          shpView.setFloat64(44, ymin, true);
          shpView.setFloat64(52, xmax, true);
          shpView.setFloat64(60, ymax, true);

          shpView.setInt32(100, 1, false);
          shpView.setInt32(104, contentWords, false);
          shpView.setInt32(108, 5, true);
          shpView.setFloat64(112, xmin, true);
          shpView.setFloat64(120, ymin, true);
          shpView.setFloat64(128, xmax, true);
          shpView.setFloat64(136, ymax, true);
          shpView.setInt32(144, numParts, true);
          shpView.setInt32(148, numPoints, true);

          let curOffset = 152;
          let pIndex = 0;
          for (let p of normParts) {
            shpView.setInt32(curOffset, pIndex, true);
            curOffset += 4;
            pIndex += p.length;
          }
          for (let p of normParts) {
            for (let pt of p) {
              shpView.setFloat64(curOffset, pt[0], true);
              shpView.setFloat64(curOffset + 8, pt[1], true);
              curOffset += 16;
            }
          }

          const shxBytes = 100 + 8;
          const shxBuffer = new ArrayBuffer(shxBytes);
          const shxView = new DataView(shxBuffer);
          shxView.setInt32(0, 9994, false);
          shxView.setInt32(24, shxBytes / 2, false);
          shxView.setInt32(28, 1000, true);
          shxView.setInt32(32, 5, true);
          shxView.setFloat64(36, xmin, true);
          shxView.setFloat64(44, ymin, true);
          shxView.setFloat64(52, xmax, true);
          shxView.setFloat64(60, ymax, true);
          shxView.setInt32(100, 50, false);
          shxView.setInt32(104, contentWords, false);

          let fields = [];
          if (attrs._customFields && attrs._customFields.length > 0) {
            fields = attrs._customFields.map(f => {
              let name = (f.name || 'ATTR').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10);
              if (!name) name = 'ATTR';
              let type = f.type === 'N' ? 'N' : (f.type === 'D' ? 'D' : 'C');
              let len = type === 'N' ? 16 : (type === 'D' ? 8 : (Math.min(parseInt(f.len) || 254, 254)));
              let dec = type === 'N' ? (parseInt(f.dec) || 2) : 0;
              return { name, type, len, dec, val: f.val };
            });
          } else {
            fields = [
              { name: "PEMRAKARSA", type: "C", len: 254, dec: 0, val: attrs.PEMRAKARSA || 'PEMOHON OSS RBA' },
              { name: "KEGIATAN", type: "C", len: 254, dec: 0, val: attrs.KEGIATAN || 'KKPR / PERIZINAN BERUSAHA' },
              { name: "TAHUN", type: "C", len: 10, dec: 0, val: attrs.TAHUN != null ? String(attrs.TAHUN) : '2026' },
              { name: "PROVINSI", type: "C", len: 100, dec: 0, val: attrs.PROVINSI || '-' },
              { name: "KETERANGAN", type: "C", len: 254, dec: 0, val: attrs.KETERANGAN || '-' },
              { name: "LAYER", type: "C", len: 100, dec: 0, val: attrs.LAYER || 'TAPAK PROYEK' },
              { name: "LUAS", type: "N", len: 16, dec: 6, val: attrs.LUAS }
            ];
          }

          const headerLen = 32 + (fields.length * 32) + 1;
          let recordLen = 1;
          fields.forEach(f => recordLen += f.len);
          const dbfBytes = headerLen + recordLen + 1;
          const dbfBuffer = new ArrayBuffer(dbfBytes);
          const dbfView = new DataView(dbfBuffer);
          const dbfUint8 = new Uint8Array(dbfBuffer);

          dbfView.setUint8(0, 0x03);
          dbfView.setUint8(1, 26);
          dbfView.setUint8(2, 10);
          dbfView.setUint8(3, 5);
          dbfView.setUint32(4, 1, true);
          dbfView.setUint16(8, headerLen, true);
          dbfView.setUint16(10, recordLen, true);

          let fOffset = 32;
          fields.forEach(f => {
            for (let i = 0; i < 11; i++) {
              dbfView.setUint8(fOffset + i, i < f.name.length ? f.name.charCodeAt(i) : 0);
            }
            dbfView.setUint8(fOffset + 11, f.type.charCodeAt(0));
            dbfView.setUint8(fOffset + 16, f.len);
            dbfView.setUint8(fOffset + 17, f.dec);
            fOffset += 32;
          });
          dbfView.setUint8(fOffset, 0x0D);

          let recOffset = headerLen;
          dbfView.setUint8(recOffset++, 0x20);

          fields.forEach(f => {
            if (f.type === 'N') {
              const num = (typeof f.val === 'number') ? f.val : parseFloat(f.val) || 0;
              const numStr = num.toFixed(f.dec).padStart(f.len, ' ').slice(0, f.len);
              for (let i = 0; i < f.len; i++) {
                dbfView.setUint8(recOffset + i, i < numStr.length ? numStr.charCodeAt(i) : 0x20);
              }
              recOffset += f.len;
            } else if (f.type === 'D') {
              const dStr = String(f.val || '').replace(/[^0-9]/g, '').slice(0, 8).padEnd(8, ' ');
              for (let i = 0; i < 8; i++) {
                dbfView.setUint8(recOffset + i, i < dStr.length ? dStr.charCodeAt(i) : 0x20);
              }
              recOffset += 8;
            } else {
              const str = String(f.val != null ? f.val : '').slice(0, f.len);
              for (let i = 0; i < f.len; i++) {
                dbfView.setUint8(recOffset + i, i < str.length ? str.charCodeAt(i) : 0x20);
              }
              recOffset += f.len;
            }
          });
          dbfUint8[recOffset] = 0x1A;

          const prj = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

          const zip = new JSZip();
          const baseName = attrs._baseFileName || (isMemberProActive() ? "DutaGeoSpasi_bidang" : "geospasi");
          const zipName = attrs._zipDownloadName || (isMemberProActive() ? "DutaGeoSpasi_shapefile_bidang.zip" : "geospasi.zip");

          zip.file(`${baseName}.shp`, shpBuffer);
          zip.file(`${baseName}.shx`, shxBuffer);
          zip.file(`${baseName}.dbf`, dbfBuffer);
          zip.file(`${baseName}.prj`, prj);
          zip.file(`${baseName}.cpg`, "UTF-8\n");

          zip.generateAsync({ type: "blob" }).then(blob => {
            downloadFile(blob, zipName, "application/zip");
            showToast(`Paket Shapefile ESRI ZIP (${zipName}) berhasil diunduh!`, "success");
            resolve();
          }).catch(reject);
        } catch (err) {
          reject(err);
        }
      });
    }

    function exportKML() {
      if (!isMemberProActive()) {
        showToast('Fitur Ekspor KML khusus Member PRO. Silakan masuk atau upgrade akun.', 'warn');
        openMemberModal();
        return;
      }
      let features = [];
      const rawParts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : (activeVertices && activeVertices.length >= 3 ? [activeVertices] : []);
      const parts = getExportVerticesWithOssAdjustment(rawParts);

      if (parts.length > 1) {
        features = parts.map((part, pIdx) => {
          const closed = [...part];
          if (closed.length > 0 && (closed[0].lat !== closed[closed.length-1].lat || closed[0].lng !== closed[closed.length-1].lng)) {
            closed.push(closed[0]);
          }
          return {
            name: `Bidang ${activePinData?.fid || 'Gabungan'} (Bagian ${pIdx + 1})`,
            coords: closed.map(c => `${c.lng},${c.lat},0`).join(' ')
          };
        });
      } else if (parts.length === 1 && parts[0].length >= 3) {
        const closed = [...parts[0]];
        if (closed[0].lat !== closed[closed.length-1].lat || closed[0].lng !== closed[closed.length-1].lng) {
          closed.push(closed[0]);
        }
        features = [{
          name: `Bidang ${activePinData?.fid || 'Tanah'}`,
          coords: closed.map(c => `${c.lng},${c.lat},0`).join(' ')
        }];
      }

      if (features.length === 0 && typeof drawnItems !== 'undefined') {
        drawnItems.eachLayer(layer => {
          if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
            const pts = layer.getLatLngs()[0];
            if (pts && pts.length >= 3) {
              const closed = [...pts];
              if (closed[0].lat !== closed[closed.length - 1].lat || closed[0].lng !== closed[closed.length - 1].lng) {
                closed.push(closed[0]);
              }
              features.push({
                name: 'Bidang Gambar Mandiri',
                coords: closed.map(c => `${c.lng},${c.lat},0`).join(' ')
              });
            }
          }
        });
      }

      if (features.length === 0) {
        showToast('Belum ada bidang tanah aktif untuk diekspor.', 'warn');
        return;
      }
      let kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>DutaGeoSpasi Batas Bidang Kadaster</name>\n<description>Pengembang: Duta Digital Agensi (dutamik.id) - Duta Media Informasi berKarya</description>\n`;
      features.forEach(f => {
        kml += `  <Placemark>\n    <name>${f.name}</name>\n    <Polygon>\n      <outerBoundaryIs>\n        <LinearRing>\n          <coordinates>${f.coords}</coordinates>\n      </LinearRing>\n    </outerBoundaryIs>\n  </Polygon>\n  </Placemark>\n`;
      });
      kml += `</Document>\n</kml>`;
      downloadFile(kml, 'DutaGeoSpasi_batas_bidang.kml', 'application/vnd.google-earth.kml+xml');
      showToast('Berkas KML DutaGeoSpasi berhasil diunduh!', 'success');
    }

    function importSpatialFile(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        try {
          const raw = evt.target.result;
          const isKml = (file.name && file.name.toLowerCase().endsWith('.kml')) || raw.trim().startsWith('<?xml') || raw.includes('<kml');
          if (isKml) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(raw, 'text/xml');
            const coordNodes = xmlDoc.getElementsByTagName('coordinates');
            if (coordNodes.length === 0) throw new Error('Tidak ditemukan tag coordinates pada berkas KML');
            const allPolys = [];
            for (let i = 0; i < coordNodes.length; i++) {
              const rawCoords = coordNodes[i].textContent.trim().split(/\s+/);
              const pts = [];
              for (let item of rawCoords) {
                const parts = item.split(',');
                if (parts.length >= 2) {
                  const lng = parseFloat(parts[0]);
                  const lat = parseFloat(parts[1]);
                  if (!isNaN(lat) && !isNaN(lng)) {
                    pts.push({ lat, lng });
                  }
                }
              }
              if (pts.length >= 3) {
                if (pts[0].lat === pts[pts.length - 1].lat && pts[0].lng === pts[pts.length - 1].lng) {
                  pts.pop();
                }
                if (pts.length >= 3) allPolys.push(pts);
              }
            }
            if (allPolys.length === 0) throw new Error('Geometri poligon tidak ditemukan di dalam berkas KML');
            allPolys.forEach(pts => {
              const poly = L.polygon(pts.map(p => [p.lat, p.lng]), {
                color: '#0a2e5c',
                weight: 2.5,
                fillColor: '#0a2e5c',
                fillOpacity: 0.2
              });
              drawnItems.addLayer(poly);
            });
            activeVertices = allPolys[0];
            activeMultiParts = allPolys.length > 1 ? allPolys : null;
            isParcelLocked = true;
            renderCanvasPolygon(true);
            const allPts = allPolys.flat();
            map.fitBounds(L.latLngBounds(allPts.map(p => [p.lat, p.lng])), { padding: [40, 40] });
            switchTab('tab-bidang');
            showToast(`KML berhasil diimpor: ${allPolys.length} bidang poligon.`, 'success');
            return;
          }

          const geojson = JSON.parse(raw);
          const importedLayer = L.geoJSON(geojson, {
            style: { color: '#0a2e5c', weight: 2.5, fillOpacity: 0.2 }
          });
          importedLayer.eachLayer(l => drawnItems.addLayer(l));
          map.fitBounds(importedLayer.getBounds(), { padding: [40, 40] });
          importedLayer.eachLayer(l => {
            if ((l instanceof L.Polygon || l instanceof L.Rectangle) && (!activeVertices || activeVertices.length < 3)) {
              const latlngs = l.getLatLngs()[0];
              if (latlngs && latlngs.length >= 3) {
                activeVertices = latlngs.map(p => ({ lat: p.lat, lng: p.lng }));
                isParcelLocked = true;
                renderCanvasPolygon(true);
              }
            }
          });
          switchTab('tab-bidang');
          showToast('Berhasil mengimpor batas bidang spasial GeoJSON.', 'success');
        } catch (err) {
          showToast('Gagal membaca berkas spasial: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    }

    function exportPersilSVG() {
      if (!isMemberProActive()) {
        showToast('Fitur Ekspor SVG Presisi Persil khusus Member PRO. Silakan masuk atau upgrade akun.', 'warn');
        openMemberModal();
        return;
      }
      ensureActiveVerticesFromDraw();
      const rawParts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      if (!rawParts[0] || rawParts[0].length < 3) {
        showToast('Pilih atau gambar bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }
      const parts = getExportVerticesWithOssAdjustment(rawParts);
      const utmParts = [];
      let allUtm = [];
      let firstUtm = null;
      parts.forEach(pList => {
        const utmList = pList.map(v => {
          const u = getUtmCoordinates(v.lat, v.lng);
          if (!firstUtm) firstUtm = u;
          return { x: u.x, y: u.y, lat: v.lat, lng: v.lng, zone: u.zone };
        });
        utmParts.push(utmList);
        allUtm = allUtm.concat(utmList);
      });
      if (allUtm.length < 3) return;

      let totalArea = 0;
      parts.forEach(p => { totalArea += calculatePolygonArea(p); });
      let totalPerimeter = 0;
      parts.forEach(pList => {
        for (let i = 0; i < pList.length; i++) {
          const a = pList[i], b = pList[(i + 1) % pList.length];
          totalPerimeter += L.latLng(a.lat, a.lng).distanceTo(L.latLng(b.lat, b.lng));
        }
      });

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      allUtm.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });

      const dataW = maxX - minX;
      const dataH = maxY - minY;
      const maxDim = Math.max(dataW, dataH, 1);

      const svgW = 841.89;
      const svgH = 595.28;
      const margin = { top: 70, right: 200, bottom: 100, left: 80 };
      const plotW = svgW - margin.left - margin.right;
      const plotH = svgH - margin.top - margin.bottom;

      const scaleX = plotW / (dataW || 1);
      const scaleY = plotH / (dataH || 1);
      const scale = Math.min(scaleX, scaleY) * 0.85;
      const offsetX = margin.left + (plotW - dataW * scale) / 2;
      const offsetY = margin.top + (plotH - dataH * scale) / 2;

      function tx(ux) { return offsetX + (ux - minX) * scale; }
      function ty(uy) { return offsetY + (maxY - uy) * scale; }

      const pData = activePinData || {};
      const nib = pData.nib_lengkap || pData.nib || '-';
      const tipeHak = (pData.tipe_hak || pData.identifikasi || '-').toUpperCase();
      const desa = (pData.desa || '-').toUpperCase();
      const kec = (pData.kecamatan || '-').toUpperCase();
      const kab = (pData.kabkot || '-').toUpperCase();
      const prov = (pData.provinsi || '-').toUpperCase();
      const zoneStr = firstUtm ? firstUtm.zone : 'UTM WGS84';
      const pemrakarsa = (document.getElementById('shpPemrakarsa')?.value.trim() || 'PEMOHON').toUpperCase();

      let svg = '';
      svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}mm" height="${svgH}mm" font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif">`;
      svg += `<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#ffffff"/>`;

      svg += `<rect x="${margin.left - 10}" y="${margin.top - 10}" width="${plotW + 20}" height="${plotH + 20}" fill="none" stroke="#0f172a" stroke-width="1.2"/>`;
      svg += `<rect x="${margin.left - 12}" y="${margin.top - 12}" width="${plotW + 24}" height="${plotH + 24}" fill="none" stroke="#94a3b8" stroke-width="0.4"/>`;

      const gridSpacingM = Math.pow(10, Math.floor(Math.log10(maxDim / 4)));
      const gridStart_x = Math.floor(minX / gridSpacingM) * gridSpacingM;
      const gridStart_y = Math.floor(minY / gridSpacingM) * gridSpacingM;
      for (let gx = gridStart_x; gx <= maxX + gridSpacingM; gx += gridSpacingM) {
        const sx = tx(gx);
        if (sx >= margin.left - 10 && sx <= margin.left + plotW + 10) {
          svg += `<line x1="${sx}" y1="${margin.top - 10}" x2="${sx}" y2="${margin.top + plotH + 10}" stroke="#e2e8f0" stroke-width="0.3" stroke-dasharray="3,3"/>`;
          svg += `<text x="${sx}" y="${margin.top + plotH + 22}" fill="#64748b" font-size="5" text-anchor="middle">${gx.toFixed(1)}</text>`;
        }
      }
      for (let gy = gridStart_y; gy <= maxY + gridSpacingM; gy += gridSpacingM) {
        const sy = ty(gy);
        if (sy >= margin.top - 10 && sy <= margin.top + plotH + 10) {
          svg += `<line x1="${margin.left - 10}" y1="${sy}" x2="${margin.left + plotW + 10}" y2="${sy}" stroke="#e2e8f0" stroke-width="0.3" stroke-dasharray="3,3"/>`;
          svg += `<text x="${margin.left - 14}" y="${sy + 2}" fill="#64748b" font-size="5" text-anchor="end">${gy.toFixed(1)}</text>`;
        }
      }

      const partColors = ['#0a2e5c', '#b91c1c', '#15803d', '#9333ea', '#c2410c', '#0369a1'];
      utmParts.forEach((uList, pIdx) => {
        const color = partColors[pIdx % partColors.length];
        const fillColor = pIdx === 0 ? '#dbeafe' : '#fef3c7';
        const pts = uList.map(u => `${tx(u.x).toFixed(2)},${ty(u.y).toFixed(2)}`).join(' ');
        svg += `<polygon points="${pts}" fill="${fillColor}" fill-opacity="0.35" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>`;

        const pfx = parts.length > 1 ? String.fromCharCode(65 + pIdx) : 'P';

        uList.forEach((u, idx) => {
          const cx = tx(u.x);
          const cy = ty(u.y);
          const label = `${pfx}${idx + 1}`;

          svg += `<rect x="${cx - 3.5}" y="${cy - 3.5}" width="7" height="7" fill="#ffffff" stroke="${color}" stroke-width="1.2" transform="rotate(45 ${cx} ${cy})"/>`;
          svg += `<circle cx="${cx}" cy="${cy}" r="1.5" fill="${color}"/>`;

          const angle = Math.atan2(
            ty(uList[(idx + 1) % uList.length].y) - ty(uList[(idx + uList.length - 1) % uList.length].y),
            tx(uList[(idx + 1) % uList.length].x) - tx(uList[(idx + uList.length - 1) % uList.length].x)
          );
          const labelDist = 12;
          const perpAngle = angle + Math.PI / 2;
          let lx = cx + Math.cos(perpAngle) * labelDist;
          let ly = cy + Math.sin(perpAngle) * labelDist;

          if (lx < margin.left + 8) lx = cx + 12;
          if (lx > margin.left + plotW - 8) lx = cx - 12;
          if (ly < margin.top + 8) ly = cy + 12;
          if (ly > margin.top + plotH - 8) ly = cy - 12;

          const pBadgeW = Math.max(label.length * 5 + 8, 16);
          svg += `<g transform="translate(${lx.toFixed(1)},${ly.toFixed(1)})">`;
          svg += `<rect x="-${(pBadgeW / 2).toFixed(1)}" y="-6" width="${pBadgeW.toFixed(1)}" height="12" rx="2" fill="#ffffff" stroke="${color}" stroke-width="0.8"/>`;
          svg += `<text x="0" y="2.8" fill="${color}" font-size="6" font-weight="800" text-anchor="middle">${label}</text>`;
          svg += `</g>`;
        });

        for (let i = 0; i < uList.length; i++) {
          const a = uList[i];
          const b = uList[(i + 1) % uList.length];
          const mx = (tx(a.x) + tx(b.x)) / 2;
          const my = (ty(a.y) + ty(b.y)) / 2;
          const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
          const edgeAngle = Math.atan2(ty(b.y) - ty(a.y), tx(b.x) - tx(a.x)) * 180 / Math.PI;
          let dispAngle = edgeAngle;
          if (dispAngle > 90) dispAngle -= 180;
          if (dispAngle < -90) dispAngle += 180;
          const perpOff = 7;
          const perpRad = (edgeAngle + 90) * Math.PI / 180;
          const dmx = mx + Math.cos(perpRad) * perpOff;
          const dmy = my + Math.sin(perpRad) * perpOff;

          const distStr = `${dist.toFixed(2)} m`;
          const badgeW = Math.max(distStr.length * 4.2 + 8, 28);
          const badgeH = 10;

          svg += `<g transform="translate(${dmx.toFixed(1)},${dmy.toFixed(1)}) rotate(${dispAngle.toFixed(1)})">`;
          svg += `<rect x="-${(badgeW / 2).toFixed(1)}" y="-${(badgeH / 2).toFixed(1)}" width="${badgeW.toFixed(1)}" height="${badgeH}" rx="2" fill="#ffffff" stroke="#94a3b8" stroke-width="0.5"/>`;
          svg += `<text x="0" y="2.5" fill="#b91c1c" font-size="5.5" font-weight="700" text-anchor="middle">${distStr}</text>`;
          svg += `</g>`;
        }
      });

      const naX = margin.left + plotW + 30;
      const naY = margin.top + 10;
      svg += `<g transform="translate(${naX},${naY})">`;
      svg += `<line x1="0" y1="36" x2="0" y2="0" stroke="#0f172a" stroke-width="1.5" marker-end="url(#arrowN)"/>`;
      svg += `<text x="0" y="-5" fill="#0f172a" font-size="8.5" font-weight="800" text-anchor="middle">U</text>`;
      svg += `</g>`;
      svg += `<defs><marker id="arrowN" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,6 L3,0 L6,6 Z" fill="#0f172a"/></marker></defs>`;

      const sbY = margin.top + plotH + 40;
      const sbX = margin.left;
      const metersPerPx = 1 / scale;
      let sbMeters = Math.pow(10, Math.floor(Math.log10(plotW * 0.3 * metersPerPx)));
      if (sbMeters < 1) sbMeters = 1;
      const sbPx = sbMeters * scale;
      svg += `<line x1="${sbX}" y1="${sbY}" x2="${sbX + sbPx}" y2="${sbY}" stroke="#0f172a" stroke-width="1.5"/>`;
      svg += `<line x1="${sbX}" y1="${sbY - 3}" x2="${sbX}" y2="${sbY + 3}" stroke="#0f172a" stroke-width="1"/>`;
      svg += `<line x1="${sbX + sbPx}" y1="${sbY - 3}" x2="${sbX + sbPx}" y2="${sbY + 3}" stroke="#0f172a" stroke-width="1"/>`;
      svg += `<text x="${sbX + sbPx / 2}" y="${sbY + 10}" fill="#0f172a" font-size="6" text-anchor="middle" font-weight="600">0          ${sbMeters} m</text>`;
      svg += `<text x="${sbX + sbPx / 2}" y="${sbY + 17}" fill="#64748b" font-size="4.5" text-anchor="middle">Proyeksi UTM WGS 84 Zona ${zoneStr}</text>`;

      const tbX = svgW - margin.right + 25;
      const tbY = margin.top - 10;
      const tbW = margin.right - 35;
      const tbH = 265;
      svg += `<rect x="${tbX}" y="${tbY}" width="${tbW}" height="${tbH}" fill="#f8fafc" stroke="#0f172a" stroke-width="0.8" rx="2"/>`;

      const rows = [
        ['GAMBAR PERSIL', ''],
        ['BIDANG TANAH', ''],
        ['NIB', nib],
        ['Hak', tipeHak],
        ['Pemrakarsa', pemrakarsa],
        ['Desa/Kel.', desa],
        ['Kecamatan', kec],
        ['Kab./Kota', kab],
        ['Provinsi', prov],
        ['Luas', formatAreaM2(totalArea)],
        ['Luas (Ha)', (totalArea / 10000).toFixed(6) + ' ha'],
        ['Keliling', totalPerimeter.toFixed(2) + ' m'],
        ['Patok', allUtm.length + ' titik'],
        ['Zona UTM', zoneStr],
        ['Datum', 'WGS 84']
      ];

      let ry = tbY + 6;
      rows.forEach((r, i) => {
        if (i === 0) {
          svg += `<text x="${tbX + tbW / 2}" y="${ry + 7}" fill="#0f172a" font-size="7.5" font-weight="800" text-anchor="middle">${r[0]}</text>`;
          ry += 11;
        } else if (i === 1) {
          svg += `<text x="${tbX + tbW / 2}" y="${ry + 5}" fill="#0369a1" font-size="6" font-weight="700" text-anchor="middle">${r[0]}</text>`;
          svg += `<line x1="${tbX + 4}" y1="${ry + 9}" x2="${tbX + tbW - 4}" y2="${ry + 9}" stroke="#cbd5e1" stroke-width="0.5"/>`;
          ry += 13;
        } else {
          svg += `<text x="${tbX + 5}" y="${ry + 8}" fill="#475569" font-size="4.8" font-weight="600">${r[0]}</text>`;
          svg += `<text x="${tbX + tbW - 5}" y="${ry + 8}" fill="#0f172a" font-size="4.8" font-weight="700" text-anchor="end">${r[1]}</text>`;
          if (i < rows.length - 1) {
            svg += `<line x1="${tbX + 4}" y1="${ry + 11}" x2="${tbX + tbW - 4}" y2="${ry + 11}" stroke="#e2e8f0" stroke-width="0.25"/>`;
          }
          ry += 12.5;
        }
      });

      svg += `<line x1="${tbX + 4}" y1="${ry + 2}" x2="${tbX + tbW - 4}" y2="${ry + 2}" stroke="#0f172a" stroke-width="0.5"/>`;
      svg += `<text x="${tbX + tbW / 2}" y="${ry + 11}" fill="#0f172a" font-size="4.5" font-weight="700" text-anchor="middle">Duta Digital Agensi</text>`;
      svg += `<text x="${tbX + tbW / 2}" y="${ry + 16}" fill="#0369a1" font-size="3.8" font-weight="600" text-anchor="middle">dutamik.id</text>`;
      svg += `<text x="${tbX + tbW / 2}" y="${ry + 21}" fill="#64748b" font-size="3.5" text-anchor="middle">Duta Media Informasi berKarya</text>`;
      svg += `<text x="${tbX + tbW / 2}" y="${ry + 26}" fill="#94a3b8" font-size="3.2" text-anchor="middle">Sukoharjo, Jawa Tengah</text>`;

      const legY = tbY + tbH + 12;
      const legH = 75;
      svg += `<rect x="${tbX}" y="${legY}" width="${tbW}" height="${legH}" fill="#f8fafc" stroke="#0f172a" stroke-width="0.8" rx="2"/>`;
      svg += `<text x="${tbX + tbW / 2}" y="${legY + 11}" fill="#0f172a" font-size="6" font-weight="800" text-anchor="middle">LEGENDA PETA</text>`;
      svg += `<line x1="${tbX + 6}" y1="${legY + 15}" x2="${tbX + tbW - 6}" y2="${legY + 15}" stroke="#cbd5e1" stroke-width="0.5"/>`;

      svg += `<line x1="${tbX + 10}" y1="${legY + 26}" x2="${tbX + 30}" y2="${legY + 26}" stroke="#0a2e5c" stroke-width="1.8"/>`;
      svg += `<text x="${tbX + 36}" y="${legY + 28}" fill="#334155" font-size="4.8">Batas Bidang Persil</text>`;

      svg += `<rect x="${tbX + 16}" y="${legY + 36}" width="6" height="6" fill="#ffffff" stroke="#0a2e5c" stroke-width="1" transform="rotate(45 ${tbX + 19} ${legY + 39})"/>`;
      svg += `<circle cx="${tbX + 19}" cy="${legY + 39}" r="1.5" fill="#0a2e5c"/>`;
      svg += `<text x="${tbX + 36}" y="${legY + 41}" fill="#334155" font-size="4.8">Patok Batas Tanah</text>`;

      svg += `<rect x="${tbX + 10}" y="${legY + 49}" width="20" height="8" fill="#dbeafe" fill-opacity="0.5" stroke="#0a2e5c" stroke-width="0.4"/>`;
      svg += `<text x="${tbX + 36}" y="${legY + 55}" fill="#334155" font-size="4.8">Area Bidang Persil</text>`;

      svg += `<rect x="${tbX + 10}" y="${legY + 62}" width="20" height="7" rx="1.5" fill="#ffffff" stroke="#94a3b8" stroke-width="0.5"/>`;
      svg += `<text x="${tbX + 20}" y="${legY + 67}" fill="#b91c1c" font-size="4" font-weight="700" text-anchor="middle">12.34 m</text>`;
      svg += `<text x="${tbX + 36}" y="${legY + 68}" fill="#334155" font-size="4.8">Dimensi Panjang Batas Sisi</text>`;

      svg += `<text x="${svgW / 2}" y="22" fill="#0f172a" font-size="12" font-weight="800" text-anchor="middle" letter-spacing="1">GAMBAR PERSIL BIDANG TANAH</text>`;
      svg += `<text x="${svgW / 2}" y="34" fill="#0369a1" font-size="7" font-weight="600" text-anchor="middle">PETA BIDANG KADASTRAL - DUTAGEOSPASI</text>`;
      svg += `<text x="${svgW / 2}" y="44" fill="#64748b" font-size="5" text-anchor="middle">${desa !== '-' ? `Desa ${desa}, Kec. ${kec}, ${kab}, ${prov}` : 'Lokasi Bidang Tanah'}</text>`;

      svg += `<text x="${svgW / 2}" y="${svgH - 8}" fill="#94a3b8" font-size="4" text-anchor="middle">Dihasilkan otomatis oleh DutaGeoSpasi (geospasi.dutamik.id) : Duta Digital Agensi (dutamik.id) : Sukoharjo, Jawa Tengah</text>`;

      const coordTableY = margin.top + plotH + 55;
      const colW = 90;
      const availW = svgW - margin.left - 20;
      const maxCols = Math.floor(availW / colW);
      const headerRow = ['Patok', 'Latitude', 'Longitude', 'UTM X (E)', 'UTM Y (N)', 'Jarak (m)'];
      if (allUtm.length <= 20 && coordTableY + 12 + allUtm.length * 8 < svgH - 20) {
        svg += `<text x="${margin.left}" y="${coordTableY - 4}" fill="#0f172a" font-size="5.5" font-weight="700">DAFTAR KOORDINAT PATOK BATAS</text>`;
        const cTblX = margin.left;
        const cTblColWidths = [30, 55, 55, 55, 55, 40];
        headerRow.forEach((h, ci) => {
          let hx = cTblX;
          for (let k = 0; k < ci; k++) hx += cTblColWidths[k];
          svg += `<text x="${hx + 2}" y="${coordTableY + 6}" fill="#0f172a" font-size="4" font-weight="700">${h}</text>`;
        });
        svg += `<line x1="${cTblX}" y1="${coordTableY + 8}" x2="${cTblX + cTblColWidths.reduce((a, b) => a + b, 0)}" y2="${coordTableY + 8}" stroke="#0f172a" stroke-width="0.4"/>`;
        let cRowY = coordTableY + 8;
        utmParts.forEach((uList, pIdx) => {
          const pfx = parts.length > 1 ? String.fromCharCode(65 + pIdx) : 'P';
          uList.forEach((u, idx) => {
            cRowY += 8;
            const label = `${pfx}${idx + 1}`;
            const nextU = uList[(idx + 1) % uList.length];
            const dist = Math.sqrt((nextU.x - u.x) ** 2 + (nextU.y - u.y) ** 2);
            const vals = [label, u.lat.toFixed(7), u.lng.toFixed(7), u.x.toFixed(2), u.y.toFixed(2), dist.toFixed(2)];
            vals.forEach((v, ci) => {
              let hx = cTblX;
              for (let k = 0; k < ci; k++) hx += cTblColWidths[k];
              svg += `<text x="${hx + 2}" y="${cRowY}" fill="#334155" font-size="3.8">${v}</text>`;
            });
          });
        });
      }

      svg += '</svg>';

      downloadFile(svg, 'DutaGeoSpasi_persil_bidang.svg', 'image/svg+xml');
      showToast('Gambar SVG Presisi Persil Bidang Tanah berhasil diunduh!', 'success');
    }

    window.exportPersilSVG = exportPersilSVG;
    window.getExportVerticesWithOssAdjustment = getExportVerticesWithOssAdjustment;
    window.exportCoordinatesXls = exportCoordinatesXls;
    window.exportCoordinatesOnly = exportCoordinatesOnly;
    window.openExportCoordsModal = openExportCoordsModal;
    window.closeExportCoordsModal = closeExportCoordsModal;
    window.computePartialRescaleParts = computePartialRescaleParts;
    window.openRescaleModal = openRescaleModal;
    window.closeRescaleModal = closeRescaleModal;
    window.updateRescalePreview = updateRescalePreview;
    window.applyRescaleAndDownload = applyRescaleAndDownload;
    window.unlockAllVerticesForRescale = unlockAllVerticesForRescale;
    window.lockAlternateVerticesForRescale = lockAlternateVerticesForRescale;
    window.renderRescalePatokChips = renderRescalePatokChips;
    window.exportDXF = exportDXF;
    window.downloadCoordsCad = downloadCoordsCad;
    window.exportGeoJSON = exportGeoJSON;
    window.switchAttrTab = switchAttrTab;
    window.addCustomAttrRow = addCustomAttrRow;
    window.removeCustomAttrRow = removeCustomAttrRow;
    window.initDefaultCustomAttrs = initDefaultCustomAttrs;
    window.getCustomFieldsFromTable = getCustomFieldsFromTable;
    window.openLegalModal = openLegalModal;
    window.closeLegalModal = closeLegalModal;
    window.triggerShpDownloadFromActive = triggerShpDownloadFromActive;
    window.generateShapefileZipClient = generateShapefileZipClient;
    window.exportKML = exportKML;
    window.importSpatialFile = importSpatialFile;

