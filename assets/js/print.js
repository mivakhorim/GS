function togglePrintDimensions(show) {
      const mapCont = document.getElementById('printMapContainer');
      if (mapCont) {
        mapCont.classList.toggle('hide-print-dimensions', !show);
      }
      updatePrintLegend();
    }

    function syncPrintTitleFromKop(val) {
      const magTitle = document.getElementById('magTitleInput');
      if (magTitle) magTitle.value = val;
    }


    function triggerPublisherLogoUpload() {
      if (!isMemberProActive()) {
        showToast('Kustomisasi logo & identitas penerbit khusus Member PRO.', 'warn');
        openMemberModal();
        return;
      }
      const fileInput = document.getElementById('kopPublisherLogoFile');
      if (fileInput) fileInput.click();
    }

    function handlePublisherLogoSelected(event) {
      if (!isMemberProActive()) return;
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (file.size > 2097152) {
        showToast('Ukuran file logo maksimal 2MB.', 'warn');
        return;
      }
      const reader = new FileReader();
      reader.onload = function(e) {
        const dataUrl = e.target.result;
        const img = document.getElementById('kopPublisherLogoImg');
        if (img) img.src = dataUrl;
        try {
          localStorage.setItem('duta_custom_publisher_logo', dataUrl);
        } catch (err) {}
        showToast('Logo penerbit kustom berhasil dipasang.', 'success');
      };
      reader.readAsDataURL(file);
    }

    function handlePublisherChange() {
      if (!isMemberProActive()) {
        showToast('Kustomisasi identitas penerbit khusus Member PRO.', 'warn');
        initPublisherKop();
        openMemberModal();
        return;
      }
      const nameEl = document.getElementById('kopPublisherNameInput');
      const infoEl = document.getElementById('kopPublisherInfoInput');
      if (nameEl) localStorage.setItem('duta_custom_publisher_name', nameEl.value);
      if (infoEl) localStorage.setItem('duta_custom_publisher_info', infoEl.value);
    }

    function initPublisherKop() {
      const isPro = isMemberProActive();
      const nameEl = document.getElementById('kopPublisherNameInput');
      const infoEl = document.getElementById('kopPublisherInfoInput');
      const imgEl = document.getElementById('kopPublisherLogoImg');
      const badgeEl = document.getElementById('kopProBadgePublisher');

      if (isPro) {
        if (badgeEl) badgeEl.textContent = 'PRO AKTIF';
        const savedLogo = localStorage.getItem('duta_custom_publisher_logo');
        const savedName = localStorage.getItem('duta_custom_publisher_name');
        const savedInfo = localStorage.getItem('duta_custom_publisher_info');
        if (savedLogo && imgEl) imgEl.src = savedLogo;
        if (savedName && nameEl) nameEl.value = savedName;
        if (savedInfo && infoEl) infoEl.value = savedInfo;
        if (nameEl) nameEl.readOnly = false;
        if (infoEl) infoEl.readOnly = false;
      } else {
        if (badgeEl) badgeEl.textContent = 'PRO FITUR';
        if (imgEl) imgEl.src = 'assets/img/logo.png';
        if (nameEl) {
          nameEl.value = 'Duta Digital Agensi (dutamik.id)';
          nameEl.readOnly = true;
        }
        if (infoEl) {
          infoEl.value = 'Duta Media Informasi berKarya : Sukoharjo, Jawa Tengah';
          infoEl.readOnly = true;
        }
      }
    }

    function openMapPrintModal() {
      if (typeof isMobileDevice === 'function' && isMobileDevice()) {
        processDirectMobilePdfPrint();
        return;
      }
      const modal = document.getElementById('modalPrintMap');
      if (!modal) return;
      modal.style.display = 'flex';

      const shpPem = document.getElementById('shpPemrakarsa')?.value.trim() || 'PEMOHON OSS RBA';
      const shpKeg = document.getElementById('shpKegiatan')?.value.trim() || 'KKPR / PERIZINAN BERUSAHA';
      const inpPem = document.getElementById('printPemrakarsaInput');
      if (inpPem && !inpPem.value) inpPem.value = shpPem.toUpperCase();
      const inpKeg = document.getElementById('printKegiatanInput');
      if (inpKeg && !inpKeg.value) inpKeg.value = shpKeg.toUpperCase();

      updatePrintKopContent();
      initPublisherKop();
      adjustMobilePrintScale();
      syncMagnifierFromKop();
      setupKopMagnifierClickListeners();

      setTimeout(() => {
        initOrUpdatePrintMaps();
        adjustMobilePrintScale();
        syncMagnifierFromKop();
      }, 250);
    }

    function closeMapPrintModal() {
      const modal = document.getElementById('modalPrintMap');
      if (modal) modal.style.display = 'none';
    }

    function changePrintPaperSize(size) {
      const sheet = document.getElementById('printMapSheet');
      if (!sheet) return;
      let dynStyle = document.getElementById('dynamicPagePrintStyle');
      if (!dynStyle) {
        dynStyle = document.createElement('style');
        dynStyle.id = 'dynamicPagePrintStyle';
        document.head.appendChild(dynStyle);
      }
      if (size === 'a3') {
        sheet.classList.add('a3');
        dynStyle.textContent = '@media print { @page { size: A3 landscape; margin: 0 !important; } html, body { width: 420mm !important; height: 297mm !important; margin: 0 !important; padding: 0 !important; } .print-sheet-paper.a3 { width: 420mm !important; height: 297mm !important; margin: 0 auto !important; padding: 10mm !important; } }';
      } else {
        sheet.classList.remove('a3');
        dynStyle.textContent = '@media print { @page { size: A4 landscape; margin: 0 !important; } html, body { width: 297mm !important; height: 210mm !important; margin: 0 !important; padding: 0 !important; } .print-sheet-paper { width: 297mm !important; height: 210mm !important; margin: 0 auto !important; padding: 8mm !important; } }';
      }
      setTimeout(() => {
        if (printMapInstance) {
          printMapInstance.invalidateSize();
          fitPrintMapBounds();
        }
        if (printInsetInstance) {
          printInsetInstance.invalidateSize();
          const bounds = printMapInstance ? printMapInstance.getBounds() : null;
          initOrUpdatePrintInset(bounds);
        }
        adjustMobilePrintScale();
      }, 200);
    }

    function updatePrintKopContent() {
      const elTitle = document.getElementById('kopMapTitleInput') || document.getElementById('kopMapTitle');
      const inpTitle = elTitle?.value?.trim() || elTitle?.innerText?.trim() || 'PETA TAPAK PROYEK & KAWASAN';
      const inpPem = document.getElementById('shpPemrakarsa')?.value.trim() || 'PEMOHON OSS RBA';
      const inpKeg = document.getElementById('shpKegiatan')?.value.trim() || 'KKPR / PERIZINAN BERUSAHA';
      const inpTahun = document.getElementById('shpTahun')?.value.trim() || '2026';

      if (elTitle && document.activeElement !== elTitle) {
        if ('value' in elTitle) elTitle.value = inpTitle.toUpperCase();
        else elTitle.innerText = inpTitle.toUpperCase();
      }

      const elPem = document.getElementById('kopPemrakarsa');
      if (elPem) elPem.innerText = inpPem.toUpperCase();

      const elKeg = document.getElementById('kopKegiatan');
      if (elKeg) elKeg.innerText = inpKeg.toUpperCase();

      const elTahun = document.getElementById('kopTahun');
      if (elTahun) elTahun.innerText = inpTahun;

      const elLuas = document.getElementById('kopLuas');
      if (elLuas) {
        const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
        let totalM2 = 0;
        parts.forEach(p => {
          if (p && p.length >= 3) {
            totalM2 += calculatePolygonArea(p);
          }
        });
        if (totalM2 > 0) {
          elLuas.innerText = `${formatAreaM2(totalM2)} (${formatAreaHa(totalM2)})`;
        } else {
          elLuas.innerText = '-';
        }
      }
    }

    function syncPrintMapScale() {
      if (!printMapInstance) return;
      const centerLat = printMapInstance.getCenter().lat;
      const curZoom = printMapInstance.getZoom();
      const currentMetersPerPx = 156543.03392 * Math.cos(centerLat * Math.PI / 180) / Math.pow(2, curZoom);
      const rawRatio = currentMetersPerPx / 0.0002645833333333333;
      const stdScale = (typeof getStandardScale === 'function') ? getStandardScale(rawRatio) : Math.round(rawRatio / 50) * 50;
      const metersPerPx = stdScale * 0.0002645833333333333;
      updatePrintScaleBar(metersPerPx, stdScale);
    }

    function updatePrintScaleBar(metersPerPx, stdScale) {
      const scaleStr = `SKALA 1 : ${stdScale.toLocaleString('id-ID')}`;
      const scaleEl = document.getElementById('kopScaleNumber');
      if (scaleEl) scaleEl.innerText = scaleStr;
      const magSkala = document.getElementById('magSkalaDisplay');
      if (magSkala) magSkala.innerText = scaleStr;

      const barContainer = document.getElementById('kopScaleBar');
      if (!barContainer) return;

      let totalDist = 20;
      if (stdScale <= 100) totalDist = 5;
      else if (stdScale <= 250) totalDist = 10;
      else if (stdScale <= 500) totalDist = 20;
      else if (stdScale <= 1000) totalDist = 50;
      else if (stdScale <= 1500) totalDist = 75;
      else if (stdScale <= 2000) totalDist = 100;
      else if (stdScale <= 2500) totalDist = 100;
      else if (stdScale <= 5000) totalDist = 200;
      else if (stdScale <= 10000) totalDist = 500;
      else if (stdScale <= 25000) totalDist = 1000;
      else totalDist = 2000;

      const barWidthPx = Math.round(totalDist / metersPerPx);
      const fmt = (val) => val >= 1000 ? `${(val / 1000).toLocaleString('id-ID')} km` : `${val.toLocaleString('id-ID')} m`;

      barContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center;">
          <div style="display: flex; width: ${barWidthPx}px; height: 5px; border: 1px solid #000000; box-sizing: border-box;">
            <div style="flex: 1; background-color: #000000;"></div>
            <div style="flex: 1; background-color: #ffffff;"></div>
            <div style="flex: 1; background-color: #000000;"></div>
            <div style="flex: 1; background-color: #ffffff;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; width: ${barWidthPx}px; font-size: 6.5px; font-family: 'JetBrains Mono', monospace; margin-top: 2px;">
            <span>0</span>
            <span>${fmt(totalDist / 4)}</span>
            <span>${fmt(totalDist / 2)}</span>
            <span>${fmt(totalDist)}</span>
          </div>
        </div>
      `;
    }

    function updatePrintLegend() {
      const container = document.getElementById('printLegendContainer');
      if (!container) return;

      const items = [];
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      const hasPolygon = parts[0] && parts[0].length >= 3;
      const hasPatok = parts[0] && parts[0].length >= 1;

      if (hasPolygon) {
        items.push(`
          <div class="print-legend-item">
            <div class="print-legend-symbol">
              <svg class="print-legend-swatch" width="18" height="12" viewBox="0 0 18 12" style="border: 1.5px solid #ffffff; box-shadow: 0 0 2px rgba(0,0,0,0.85); background: #0284c7; border-radius: 2px; vertical-align: middle;">
                <line x1="-2" y1="4" x2="6" y2="-4" stroke="#ffffff" stroke-width="1.8"/>
                <line x1="2" y1="12" x2="14" y2="0" stroke="#ffffff" stroke-width="1.8"/>
                <line x1="8" y1="14" x2="20" y2="2" stroke="#ffffff" stroke-width="1.8"/>
              </svg>
            </div>
            <span>Batas Bidang Tanah</span>
          </div>
        `);
      }

      if (hasPatok) {
        items.push(`
          <div class="print-legend-item">
            <div class="print-legend-symbol">
              <div class="print-legend-point" style="background-color: #0a2e5c; border: 1.2px solid #ffffff;"></div>
            </div>
            <span>Titik Patok Batas</span>
          </div>
        `);
      }

      const chkDim = document.getElementById('chkPrintToggleDimensi');
      const showDim = chkDim ? chkDim.checked : true;
      if (hasPolygon && showDim) {
        items.push(`
          <div class="print-legend-item">
            <div class="print-legend-symbol">
              <div class="print-legend-line" style="background-color: #0a2e5c; height: 1.8px;"></div>
            </div>
            <span>Dimensi Panjang Batas</span>
          </div>
        `);
      }

      if (typeof persilLayer !== 'undefined' && persilLayer && map && map.hasLayer(persilLayer)) {
        items.push(`
          <div class="print-legend-item">
            <div class="print-legend-symbol">
              <div class="print-legend-line" style="background-color: #ea580c; height: 2px;"></div>
            </div>
            <span>Peta Bidang Kadastral</span>
          </div>
        `);
      }

      if (typeof customPois !== 'undefined' && customPois && customPois.length > 0) {
        const renderedTypes = new Set();
        customPois.forEach(poi => {
          if (!renderedTypes.has(poi.type)) {
            renderedTypes.add(poi.type);
            const details = (typeof getPoiTypeDetails === 'function') ? getPoiTypeDetails(poi.type) : { label: poi.name || 'POI', color: '#0a2e5c' };
            items.push(`
              <div class="print-legend-item">
                <div class="print-legend-symbol">
                  <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${details.color}; border: 1px solid #ffffff;"></div>
                </div>
                <span>${details.label}</span>
              </div>
            `);
          }
        });
      }

      if (typeof cekingLayers !== 'undefined' && cekingLayers) {
        if (cekingLayers.lsd && map && map.hasLayer(cekingLayers.lsd)) {
          items.push(`
            <div class="print-legend-item">
              <div class="print-legend-symbol">
                <div class="print-legend-swatch" style="background-color: #059669; border: 1px solid #047857;"></div>
              </div>
              <span>LSD Dipertahankan (Pangan)</span>
            </div>
            <div class="print-legend-item">
              <div class="print-legend-symbol">
                <div class="print-legend-swatch" style="background-color: #65a30d; border: 1px solid #4d7c0f;"></div>
              </div>
              <span>LSD Penyesuaian RTRW</span>
            </div>
          `);
        }

        if (cekingLayers.lbs && map && map.hasLayer(cekingLayers.lbs)) {
          items.push(`
            <div class="print-legend-item">
              <div class="print-legend-symbol">
                <div class="print-legend-swatch" style="background-color: #0284c7; border: 1px solid #0369a1;"></div>
              </div>
              <span>Lahan Baku Sawah (LBS)</span>
            </div>
          `);
        }

        if (cekingLayers.hutan && map && map.hasLayer(cekingLayers.hutan)) {
          items.push(`
            <div class="print-legend-item">
              <div class="print-legend-symbol">
                <div class="print-legend-swatch" style="background-color: #14532d; border: 1px solid #052e16;"></div>
              </div>
              <span>Kawasan Hutan Lindung (HL)</span>
            </div>
            <div class="print-legend-item">
              <div class="print-legend-symbol">
                <div class="print-legend-swatch" style="background-color: #ca8a04; border: 1px solid #a16207;"></div>
              </div>
              <span>Hutan Produksi (HP/HPT)</span>
            </div>
            <div class="print-legend-item">
              <div class="print-legend-symbol">
                <div class="print-legend-swatch" style="background-color: #94a3b8; border: 1px solid #64748b;"></div>
              </div>
              <span>Areal Penggunaan Lain (APL)</span>
            </div>
          `);
        }

        if (cekingLayers.peruntukan && map && map.hasLayer(cekingLayers.peruntukan)) {
          items.push(`
            <div class="print-legend-item">
              <div class="print-legend-symbol">
                <div class="print-legend-swatch" style="background-color: #d97706; border: 1px solid #b45309;"></div>
              </div>
              <span>Zona Pola Ruang Permukiman</span>
            </div>
            <div class="print-legend-item">
              <div class="print-legend-symbol">
                <div class="print-legend-swatch" style="background-color: #b91c1c; border: 1px solid #991b1b;"></div>
              </div>
              <span>Zona Perdagangan &amp; Jasa</span>
            </div>
            <div class="print-legend-item">
              <div class="print-legend-symbol">
                <div class="print-legend-swatch" style="background-color: #334155; border: 1px solid #1e293b;"></div>
              </div>
              <span>Zona Industri &amp; Pergudangan</span>
            </div>
            <div class="print-legend-item">
              <div class="print-legend-symbol">
                <div class="print-legend-swatch" style="background-color: #15803d; border: 1px solid #166534;"></div>
              </div>
              <span>Zona Pertanian Tanaman Pangan</span>
            </div>
          `);
        }

        if (cekingLayers.rtrw && map && map.hasLayer(cekingLayers.rtrw)) {
          items.push(`
            <div class="print-legend-item">
              <div class="print-legend-symbol">
                <div class="print-legend-swatch" style="background-color: #78350f; border: 1px solid #451a03;"></div>
              </div>
              <span>RTRW Perkebunan / Non-Pangan</span>
            </div>
            <div class="print-legend-item">
              <div class="print-legend-symbol">
                <div class="print-legend-swatch" style="background-color: #0284c7; border: 1px solid #0369a1;"></div>
              </div>
              <span>RTRW Perikanan / Tubuh Air</span>
            </div>
          `);
        }

        if (cekingLayers.jalan && map && map.hasLayer(cekingLayers.jalan)) {
          items.push(`
            <div class="print-legend-item">
              <div class="print-legend-symbol">
                <div class="print-legend-line" style="background-color: #ea580c; height: 2.5px;"></div>
              </div>
              <span>Jalan Arteri / Nasional</span>
            </div>
            <div class="print-legend-item">
              <div class="print-legend-symbol">
                <div class="print-legend-line" style="background-color: #eab308; height: 2px;"></div>
              </div>
              <span>Jalan Kolektor &amp; Lokal</span>
            </div>
          `);
        }
      }

      if (typeof kelurahanHighlightLayer !== 'undefined' && kelurahanHighlightLayer && map && map.hasLayer(kelurahanHighlightLayer)) {
        items.push(`
          <div class="print-legend-item">
            <div class="print-legend-symbol">
              <div class="print-legend-swatch" style="background-color: rgba(37, 99, 235, 0.15); border: 1.5px dashed #2563eb;"></div>
            </div>
            <span>Batas Administrasi Desa</span>
          </div>
        `);
      }

      if (items.length === 0) {
        container.innerHTML = '<div style="color: #64748b; font-size: 7.2px; line-height: 1.5; font-style: italic; padding: 4px 0;">Tidak ada lapisan tematik aktif</div>';
      } else {
        container.innerHTML = items.join('');
      }
    }

    function updatePrintMapGraticule() {
      const mapContainer = document.getElementById('printMapContainer');
      const svg = document.getElementById('printGraticuleSvg');
      if (!printMapInstance || !mapContainer || !svg) return;

      const w = mapContainer.clientWidth;
      const h = mapContainer.clientHeight;
      if (w <= 0 || h <= 0) return;

      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

      const bounds = printMapInstance.getBounds();
      const west = bounds.getWest();
      const east = bounds.getEast();
      const south = bounds.getSouth();
      const north = bounds.getNorth();

      const gNw = document.getElementById('gratNw');
      const gNe = document.getElementById('gratNe');
      const gSw = document.getElementById('gratSw');
      const gSe = document.getElementById('gratSe');
      if (gNw) gNw.innerText = `${toDecimalDegreeString(west, true)}, ${toDecimalDegreeString(north, false)}`;
      if (gNe) gNe.innerText = `${toDecimalDegreeString(east, true)}, ${toDecimalDegreeString(north, false)}`;
      if (gSw) gSw.innerText = `${toDecimalDegreeString(west, true)}, ${toDecimalDegreeString(south, false)}`;
      if (gSe) gSe.innerText = `${toDecimalDegreeString(east, true)}, ${toDecimalDegreeString(south, false)}`;

      const mNw = document.getElementById('magGratNw'); if (mNw && gNw) mNw.innerText = 'NW: ' + gNw.innerText;
      const mNe = document.getElementById('magGratNe'); if (mNe && gNe) mNe.innerText = 'NE: ' + gNe.innerText;
      const mSw = document.getElementById('magGratSw'); if (mSw && gSw) mSw.innerText = 'SW: ' + gSw.innerText;
      const mSe = document.getElementById('magGratSe'); if (mSe && gSe) mSe.innerText = 'SE: ' + gSe.innerText;

      const lngStep = getNiceDegreeStep(east - west, 4);
      const latStep = getNiceDegreeStep(north - south, 4);

      const elements = [];

      for (let lng = Math.ceil(west / lngStep) * lngStep; lng < east; lng += lngStep) {
        const pt = printMapInstance.latLngToContainerPoint([north, lng]);
        const x = Math.round(pt.x);
        if (x > 30 && x < w - 30) {
          elements.push(`<line x1="${x}" y1="0" x2="${x}" y2="7" stroke="#0f172a" stroke-width="1.2" />`);
          elements.push(`<text x="${x}" y="17" font-size="7.5" font-weight="700" font-family="'JetBrains Mono',monospace" fill="#0f172a" text-anchor="middle" style="paint-order: stroke fill; stroke: #ffffff; stroke-width: 2.5px; stroke-linejoin: round;">${toDecimalDegreeString(lng, true)}</text>`);

          elements.push(`<line x1="${x}" y1="${h}" x2="${x}" y2="${h - 7}" stroke="#0f172a" stroke-width="1.2" />`);
          elements.push(`<text x="${x}" y="${h - 10}" font-size="7.5" font-weight="700" font-family="'JetBrains Mono',monospace" fill="#0f172a" text-anchor="middle" style="paint-order: stroke fill; stroke: #ffffff; stroke-width: 2.5px; stroke-linejoin: round;">${toDecimalDegreeString(lng, true)}</text>`);
        }
      }

      for (let lat = Math.ceil(south / latStep) * latStep; lat < north; lat += latStep) {
        const pt = printMapInstance.latLngToContainerPoint([lat, west]);
        const y = Math.round(pt.y);
        if (y > 25 && y < h - 25) {
          elements.push(`<line x1="0" y1="${y}" x2="7" y2="${y}" stroke="#0f172a" stroke-width="1.2" />`);
          elements.push(`<text x="14" y="${y}" transform="rotate(-90, 14, ${y})" font-size="7.5" font-weight="700" font-family="'JetBrains Mono',monospace" fill="#0f172a" text-anchor="middle" style="paint-order: stroke fill; stroke: #ffffff; stroke-width: 2.5px; stroke-linejoin: round;">${toDecimalDegreeString(lat, false)}</text>`);

          elements.push(`<line x1="${w}" y1="${y}" x2="${w - 7}" y2="${y}" stroke="#0f172a" stroke-width="1.2" />`);
          elements.push(`<text x="${w - 14}" y="${y}" transform="rotate(-90, ${w - 14}, ${y})" font-size="7.5" font-weight="700" font-family="'JetBrains Mono',monospace" fill="#0f172a" text-anchor="middle" style="paint-order: stroke fill; stroke: #ffffff; stroke-width: 2.5px; stroke-linejoin: round;">${toDecimalDegreeString(lat, false)}</text>`);
        }
      }

      for (let lng = Math.ceil(west / lngStep) * lngStep; lng < east; lng += lngStep) {
        for (let lat = Math.ceil(south / latStep) * latStep; lat < north; lat += latStep) {
          const pt = printMapInstance.latLngToContainerPoint([lat, lng]);
          const x = Math.round(pt.x);
          const y = Math.round(pt.y);
          if (x > 30 && x < w - 30 && y > 25 && y < h - 25) {
            elements.push(`<line x1="${x - 4}" y1="${y}" x2="${x + 4}" y2="${y}" stroke="#ffffff" stroke-width="1.4" opacity="0.85" />`);
            elements.push(`<line x1="${x}" y1="${y - 4}" x2="${x}" y2="${y + 4}" stroke="#ffffff" stroke-width="1.4" opacity="0.85" />`);
            elements.push(`<line x1="${x - 4}" y1="${y}" x2="${x + 4}" y2="${y}" stroke="#0f172a" stroke-width="0.8" opacity="0.7" />`);
            elements.push(`<line x1="${x}" y1="${y - 4}" x2="${x}" y2="${y + 4}" stroke="#0f172a" stroke-width="0.8" opacity="0.7" />`);
          }
        }
      }

      svg.innerHTML = elements.join('');
      if (typeof syncMagnifierFromKop === 'function') {
        syncMagnifierFromKop();
      }
    }

    function zoomPrintMap(delta) {
      if (!printMapInstance) return;
      if (delta > 0) printMapInstance.zoomIn();
      else printMapInstance.zoomOut();
    }

    function panPrintMap(dx, dy) {
      if (!printMapInstance) return;
      printMapInstance.panBy([dx, dy], { animate: false });
    }

    function fitPrintMapBounds() {
      if (!printMapInstance) return;
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      let bounds = null;
      if (parts[0] && parts[0].length >= 3) {
        parts.forEach(pList => {
          const poly = L.polygon(pList.map(v => [v.lat, v.lng]));
          if (!bounds) bounds = poly.getBounds();
          else bounds.extend(poly.getBounds());
        });
      }
      if (bounds && bounds.isValid()) {
        printMapInstance.fitBounds(bounds, { padding: [45, 45], animate: false });
        setTimeout(() => {
          const centerLat = bounds.getCenter().lat;
          const curZoom = printMapInstance.getZoom();
          const currentMetersPerPx = 156543.03392 * Math.cos(centerLat * Math.PI / 180) / Math.pow(2, curZoom);
          const rawRatio = currentMetersPerPx / 0.0002645833333333333;
          const stdScale = (typeof getStandardScale === 'function') ? getStandardScale(rawRatio) : Math.round(rawRatio / 50) * 50;
          const exactZoom = getExactZoomForScale(stdScale, centerLat);
          printMapInstance.setView(bounds.getCenter(), exactZoom, { animate: false });
          const metersPerPx = stdScale * 0.0002645833333333333;
          updatePrintScaleBar(metersPerPx, stdScale);
          updatePrintMapGraticule();
          updatePrintLegend();
          initOrUpdatePrintInset(bounds);
        }, 150);
      } else if (map) {
        printMapInstance.setView(map.getCenter(), map.getZoom(), { animate: false });
        syncPrintMapScale();
        updatePrintLegend();
      }
    }

    function initOrUpdatePrintMaps() {
      const container = document.getElementById('printMapContainer');
      const insetContainer = document.getElementById('printInsetContainer');
      if (!container || !insetContainer) return;

      if (!printMapInstance) {
        printMapInstance = L.map('printMapContainer', {
          zoomControl: false,
          attributionControl: false,
          fadeAnimation: false,
          zoomSnap: 0,
          zoomDelta: 0.25,
          dragging: true,
          touchZoom: true,
          scrollWheelZoom: true,
          doubleClickZoom: true,
          boxZoom: true
        });

        if (!printMapInstance.getPane('thematicPane')) {
          printMapInstance.createPane('thematicPane');
          printMapInstance.getPane('thematicPane').style.zIndex = 340;
        }
        if (!printMapInstance.getPane('persilPane')) {
          printMapInstance.createPane('persilPane');
          printMapInstance.getPane('persilPane').style.zIndex = 360;
        }

        printMapInstance.on('moveend zoomend', () => {
          updatePrintMapGraticule();
          syncPrintMapScale();
        });
      } else {
        if (!printMapInstance.getPane('thematicPane')) {
          printMapInstance.createPane('thematicPane');
          printMapInstance.getPane('thematicPane').style.zIndex = 340;
        }
        if (!printMapInstance.getPane('persilPane')) {
          printMapInstance.createPane('persilPane');
          printMapInstance.getPane('persilPane').style.zIndex = 360;
        }
      }

      printMapInstance.eachLayer(l => printMapInstance.removeLayer(l));

      if (currentBaseLayer instanceof L.LayerGroup) {
        currentBaseLayer.eachLayer(sub => {
          if (sub._url) {
            L.tileLayer(sub._url, {
              maxZoom: 26,
              maxNativeZoom: 19,
              crossOrigin: 'anonymous',
              subdomains: sub.options?.subdomains || 'abc'
            }).addTo(printMapInstance);
          }
        });
      } else if (currentBaseLayer && currentBaseLayer._url) {
        L.tileLayer(currentBaseLayer._url, {
          maxZoom: 26,
          maxNativeZoom: 19,
          crossOrigin: 'anonymous',
          subdomains: currentBaseLayer.options?.subdomains || 'abc'
        }).addTo(printMapInstance);
      } else {
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 26,
          maxNativeZoom: 19,
          crossOrigin: 'anonymous'
        }).addTo(printMapInstance);
      }

      if (typeof cekingLayers !== 'undefined' && cekingLayers) {
        const activeCekingKeys = Object.keys(cekingLayers).filter(k => cekingLayers[k] && map && map.hasLayer(cekingLayers[k]));
        activeCekingKeys.forEach(k => {
          if (typeof createThematicLayer === 'function') {
            const l = createThematicLayer(k);
            if (l) {
              l.addTo(printMapInstance);
            }
          }
        });
      }

      if (typeof persilLayer !== 'undefined' && persilLayer && map && map.hasLayer(persilLayer)) {
        const persilBase = (typeof getBpnGatewayBase === 'function') ? getBpnGatewayBase() : '';
        const pOpacity = (typeof persilLayer.options?.opacity !== 'undefined') ? persilLayer.options.opacity : 0.9;
        const tileUrl = persilBase
          ? `${persilBase}/persil/{z}/{x}/{y}.webp`
          : `/persil/{z}/{x}/{y}.webp`;
        L.tileLayer(tileUrl, {
          pane: 'persilPane',
          maxZoom: 26,
          maxNativeZoom: 19,
          opacity: pOpacity,
          zIndex: 360,
          crossOrigin: 'anonymous'
        }).addTo(printMapInstance);
      }

      if (typeof kelurahanHighlightLayer !== 'undefined' && kelurahanHighlightLayer && map && map.hasLayer(kelurahanHighlightLayer)) {
        if (typeof kelurahanHighlightLayer.toGeoJSON === 'function') {
          L.geoJSON(kelurahanHighlightLayer.toGeoJSON(), {
            style: {
              color: '#2563eb',
              weight: 2,
              dashArray: '4, 4',
              fillColor: '#3b82f6',
              fillOpacity: 0.12
            }
          }).addTo(printMapInstance);
        }
      }

      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      let bounds = null;

      if (parts[0] && parts[0].length >= 3) {
        if (typeof window.ensureBidangHatchPattern === 'function') {
          window.ensureBidangHatchPattern(printMapInstance);
        }
        parts.forEach((pList, pIdx) => {
          const latlngs = pList.map(v => [v.lat, v.lng]);
          const poly = L.polygon(latlngs, {
            color: '#ffffff',
            weight: 3.5,
            opacity: 1,
            fillColor: 'url(#bidangHatchPattern)',
            fillOpacity: 1,
            className: 'active-cadastre-polygon',
            zIndexOffset: 500
          }).addTo(printMapInstance);

          if (!bounds) bounds = poly.getBounds();
          else bounds.extend(poly.getBounds());

          pList.forEach((v, vIdx) => {
            const pfx = parts.length > 1 ? String.fromCharCode(65 + pIdx) : 'P';
            const nodeLabel = `${pfx}${vIdx + 1}`;
            L.marker([v.lat, v.lng], {
              icon: L.divIcon({
                className: 'vertex-pin',
                html: `<div class="custom-vertex-node">${nodeLabel}</div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
              }),
              interactive: false
            }).addTo(printMapInstance);

            const nextV = pList[(vIdx + 1) % pList.length];
            const dist = L.latLng(v.lat, v.lng).distanceTo(L.latLng(nextV.lat, nextV.lng));
            const midLat = (v.lat + nextV.lat) / 2;
            const midLng = (v.lng + nextV.lng) / 2;

            L.marker([midLat, midLng], {
              icon: L.divIcon({
                className: 'edge-dist',
                html: `<div class="edge-dist-tag">${dist.toFixed(2)} m</div>`,
                iconSize: [64, 22],
                iconAnchor: [32, 11]
              }),
              interactive: false
            }).addTo(printMapInstance);
          });
        });
      }

      if (customPois && customPois.length > 0) {
        customPois.forEach(poi => {
          const details = getPoiTypeDetails(poi.type);
          const divIcon = L.divIcon({
            className: 'print-poi-pin',
            html: `
              <div class="custom-poi-marker-wrap">
                <div class="custom-poi-label">${escapeHtml(poi.name)}</div>
                <div class="custom-poi-pin" style="background-color: ${details.color}; border-color: ${details.border};">
                  <div class="custom-poi-pin-icon">${details.svg}</div>
                </div>
              </div>
            `,
            iconSize: [24, 38],
            iconAnchor: [12, 38]
          });
          L.marker([poi.lat, poi.lng], { icon: divIcon, interactive: false }).addTo(printMapInstance);
          if (!bounds) bounds = L.latLngBounds([[poi.lat, poi.lng], [poi.lat, poi.lng]]);
          else bounds.extend([poi.lat, poi.lng]);
        });
      }

      const chkDim = document.getElementById('chkPrintToggleDimensi');
      const showDim = chkDim ? chkDim.checked : true;
      togglePrintDimensions(showDim);

      printMapInstance.invalidateSize();

      if (bounds && bounds.isValid()) {
        printMapInstance.fitBounds(bounds, { padding: [45, 45], animate: false });
        setTimeout(() => {
          const centerLat = bounds.getCenter().lat;
          const curZoom = printMapInstance.getZoom();
          const currentMetersPerPx = 156543.03392 * Math.cos(centerLat * Math.PI / 180) / Math.pow(2, curZoom);
          const rawRatio = currentMetersPerPx / 0.0002645833333333333;
          const stdScale = (typeof getStandardScale === 'function') ? getStandardScale(rawRatio) : Math.round(rawRatio / 50) * 50;
          const exactZoom = getExactZoomForScale(stdScale, centerLat);
          printMapInstance.setView(bounds.getCenter(), exactZoom, { animate: false });
          const metersPerPx = stdScale * 0.0002645833333333333;

          updatePrintScaleBar(metersPerPx, stdScale);
          updatePrintMapGraticule();
          updatePrintLegend();

          const pb = printMapInstance.getBounds();
          initOrUpdatePrintInset(bounds || pb);
        }, 200);
      } else {
        printMapInstance.setView(map.getCenter(), map.getZoom(), { animate: false });
        syncPrintMapScale();
        updatePrintLegend();
      }
    }

    function initOrUpdatePrintInset(mainBounds) {
      if (!printInsetInstance) {
        printInsetInstance = L.map('printInsetContainer', {
          zoomControl: false,
          attributionControl: false,
          interactive: false
        });
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 18,
          crossOrigin: 'anonymous'
        }).addTo(printInsetInstance);
      }

      printInsetInstance.eachLayer(l => {
        if (l instanceof L.Rectangle || l instanceof L.Polygon) printInsetInstance.removeLayer(l);
      });

      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      const hasPolygon = parts[0] && parts[0].length >= 3;

      if (hasPolygon) {
        parts.forEach(pList => {
          const latlngs = pList.map(v => [v.lat, v.lng]);
          L.polygon(latlngs, {
            color: '#e11d48',
            weight: 2,
            fillColor: '#e11d48',
            fillOpacity: 0.4
          }).addTo(printInsetInstance);
        });
        const allPts = parts.flat().map(v => [v.lat, v.lng]);
        const polyBounds = L.latLngBounds(allPts);
        const center = polyBounds.getCenter();
        const mainZoom = printMapInstance ? printMapInstance.getZoom() : 17;
        const insetZoom = Math.max(1, mainZoom - 4);
        printInsetInstance.setView(center, insetZoom);
      } else if (mainBounds && mainBounds.isValid()) {
        L.rectangle(mainBounds, {
          color: '#e11d48',
          weight: 2,
          fillColor: '#e11d48',
          fillOpacity: 0.35
        }).addTo(printInsetInstance);

        const center = mainBounds.getCenter();
        const mainZoom = printMapInstance ? printMapInstance.getZoom() : 17;
        const insetZoom = Math.max(1, mainZoom - 4);
        printInsetInstance.setView(center, insetZoom);
      }
      printInsetInstance.invalidateSize();
    }

    function adjustMobilePrintScale() {
      const scroll = document.getElementById('printPreviewScroll');
      const sheet = document.getElementById('printMapSheet');
      const wrapper = document.getElementById('printSheetScaleWrapper');
      if (!scroll || !sheet) return;
      const isA3 = sheet.classList.contains('a3');
      const sheetW = isA3 ? 1587 : 1123;
      const sheetH = isA3 ? 1123 : 794;

      const padX = window.innerWidth <= 768 ? 16 : 40;
      const padY = window.innerWidth <= 768 ? 16 : 40;
      const availW = Math.max(200, (scroll.clientWidth || window.innerWidth) - padX);
      const availH = Math.max(200, (scroll.clientHeight || window.innerHeight) - padY);

      const scaleW = availW / sheetW;
      const scaleH = availH / sheetH;
      let scale = Math.min(scaleW, scaleH);
      if (scale > 1.0) scale = 1.0;
      scale = Math.max(0.18, scale);

      sheet.style.transform = `scale(${scale})`;
      sheet.style.transformOrigin = 'top center';
      if (wrapper) {
        wrapper.style.width = `${Math.ceil(sheetW * scale)}px`;
        wrapper.style.height = `${Math.ceil(sheetH * scale)}px`;
        wrapper.style.overflow = 'hidden';
        wrapper.style.display = 'flex';
        wrapper.style.justifyContent = 'center';
        wrapper.style.margin = 'auto';
      }
    }

    window.addEventListener('resize', function() {
      const modal = document.getElementById('modalPrintMap');
      if (modal && modal.style.display !== 'none') {
        adjustMobilePrintScale();
        if (printMapInstance) {
          printMapInstance.invalidateSize();
        }
      }
    });

    async function generateExportPdfDirect() {
      const sheet = document.getElementById('printMapSheet');
      if (!sheet) return;
      showToast('Menyiapkan dokumen PDF peta...', 'info');

      const magEl = document.getElementById('printMobileMagnifier');
      const prevMagDisplay = magEl ? magEl.style.display : '';
      if (magEl) magEl.style.display = 'none';

      const mapTools = sheet.querySelector('.print-map-tools');
      const prevToolsDisplay = mapTools ? mapTools.style.display : '';
      if (mapTools) mapTools.style.display = 'none';

      const wrapper = document.getElementById('printSheetScaleWrapper');
      const prevWrapH = wrapper ? wrapper.style.height : '';
      const prevWrapOverflow = wrapper ? wrapper.style.overflow : '';
      if (wrapper) {
        wrapper.style.height = 'auto';
        wrapper.style.overflow = 'visible';
      }

      if (typeof html2pdf === 'undefined') {
        window.print();
        if (magEl) magEl.style.display = prevMagDisplay;
        if (mapTools) mapTools.style.display = prevToolsDisplay;
        if (wrapper) {
          wrapper.style.height = prevWrapH;
          wrapper.style.overflow = prevWrapOverflow;
        }
        return;
      }

      const isA3 = sheet.classList.contains('a3');
      const docTitle = (document.getElementById('kopMapTitleInput')?.value || 'PETA_KADASTRAL').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${docTitle}_${Date.now()}.pdf`;

      const prevTransform = sheet.style.transform;
      const prevOrigin = sheet.style.transformOrigin;
      sheet.style.transform = 'none';
      sheet.style.transformOrigin = 'unset';

      const opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          width: isA3 ? 1587.4 : 1122.52,
          height: isA3 ? 1122.52 : 793.7,
          windowWidth: isA3 ? 1587.4 : 1122.52,
          windowHeight: isA3 ? 1122.52 : 793.7
        },
        jsPDF: {
          unit: 'mm',
          format: isA3 ? 'a3' : 'a4',
          orientation: 'landscape'
        }
      };

      try {
        await html2pdf().set(opt).from(sheet).save();
        showToast('PDF peta berhasil diunduh.', 'success');
      } catch (err) {
        window.print();
      } finally {
        if (magEl) magEl.style.display = prevMagDisplay;
        if (mapTools) mapTools.style.display = prevToolsDisplay;
        if (wrapper) {
          wrapper.style.height = prevWrapH;
          wrapper.style.overflow = prevWrapOverflow;
        }
        sheet.style.transform = prevTransform;
        sheet.style.transformOrigin = prevOrigin;
        adjustMobilePrintScale();
      }
    }

    async function processDirectMobilePdfPrint() {
      ensureActiveVerticesFromDraw();
      if (!activeVertices || activeVertices.length < 3) {
        showToast('Pilih atau buat bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }
      const modal = document.getElementById('modalPrintMap');
      const sheet = document.getElementById('printMapSheet');
      if (!modal || !sheet) return;

      showToast('Menyiapkan dan memproses dokumen PDF peta...', 'info');

      const prevDisplay = modal.style.display;
      modal.classList.add('mobile-direct-print-mode');
      modal.style.display = 'block';

      updatePrintKopContent();
      initPublisherKop();
      initOrUpdatePrintMaps();

      await new Promise(r => setTimeout(r, 650));

      try {
        await generateExportPdfDirect();
      } catch (err) {
        showToast('Gagal memproses PDF otomatis.', 'error');
      } finally {
        modal.classList.remove('mobile-direct-print-mode');
        modal.style.display = prevDisplay || 'none';
      }
    }

    function handlePrintMapTrigger() {
      ensureActiveVerticesFromDraw();
      if (!activeVertices || activeVertices.length < 3) {
        if (typeof map !== 'undefined' && map) {
          const center = map.getCenter();
          showToast('Menyiapkan bidang pada posisi peta untuk dicetak...', 'info');
          if (typeof handleMapClick === 'function') {
            handleMapClick(center.lat, center.lng, false).then(() => {
              if (isMobileDevice()) {
                processDirectMobilePdfPrint();
              } else {
                openMapPrintModal();
              }
            }).catch(() => {
              if (isMobileDevice()) {
                processDirectMobilePdfPrint();
              } else {
                openMapPrintModal();
              }
            });
            return;
          }
        }
      }
      if (isMobileDevice()) {
        processDirectMobilePdfPrint();
      } else {
        openMapPrintModal();
      }
    }

    function executeMapPrint() {
      if (isMobileDevice()) {
        generateExportPdfDirect();
      } else {
        window.print();
      }
    }

    window.handlePrintMapTrigger = handlePrintMapTrigger;
    window.processDirectMobilePdfPrint = processDirectMobilePdfPrint;

  
    function switchMagnifierTab(tabKey, btnEl) {
      document.querySelectorAll('.mag-tab-btn').forEach(b => b.classList.remove('active'));
      if (btnEl) btnEl.classList.add('active');
      document.querySelectorAll('.mag-section-pane').forEach(p => p.classList.remove('active'));
      const targetId = 'magSection' + tabKey.charAt(0).toUpperCase() + tabKey.slice(1);
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');
    }

    function syncMagnifierFromKop() {
      const elTitle = document.getElementById('kopMapTitleInput');
      const elSub = document.getElementById('kopMapSubtitleInput');
      const elDesa = document.getElementById('kopDesaInput');
      const elKec = document.getElementById('kopKecamatanInput');
      const elKab = document.getElementById('kopKabkotInput');
      const elProv = document.getElementById('kopProvinsiInput');
      const elPem = document.getElementById('kopPemrakarsa');
      const elKeg = document.getElementById('kopKegiatan');
      const elTahun = document.getElementById('kopTahun');
      const elLuas = document.getElementById('kopLuas');
      const elPubName = document.getElementById('kopPublisherNameInput');
      const elPubInfo = document.getElementById('kopPublisherInfoInput');
      const elScale = document.getElementById('kopScaleNumber');

      const magTitle = document.getElementById('magTitleInput');
      const magSub = document.getElementById('magSubtitleInput');
      const magDesa = document.getElementById('magDesaInput');
      const magKec = document.getElementById('magKecamatanInput');
      const magKab = document.getElementById('magKabkotInput');
      const magProv = document.getElementById('magProvinsiInput');
      const magPem = document.getElementById('magPemrakarsaInput');
      const magKeg = document.getElementById('magKegiatanInput');
      const magTahun = document.getElementById('magTahunInput');
      const magLuas = document.getElementById('magLuasDisplay');
      const magPubName = document.getElementById('magPublisherNameInput');
      const magPubInfo = document.getElementById('magPublisherInfoInput');
      const magSkala = document.getElementById('magSkalaDisplay');

      if (magTitle && elTitle) magTitle.value = elTitle.value;
      if (magSub && elSub) magSub.value = elSub.value;
      if (magDesa && elDesa) magDesa.value = elDesa.value;
      if (magKec && elKec) magKec.value = elKec.value;
      if (magKab && elKab) magKab.value = elKab.value;
      if (magProv && elProv) magProv.value = elProv.value;
      if (magPem && elPem) magPem.value = elPem.innerText;
      if (magKeg && elKeg) magKeg.value = elKeg.innerText;
      if (magTahun && elTahun) magTahun.value = elTahun.innerText;
      if (magLuas && elLuas) magLuas.innerText = elLuas.innerText;
      if (magPubName && elPubName) magPubName.value = elPubName.value;
      if (magPubInfo && elPubInfo) magPubInfo.value = elPubInfo.value;
      if (magSkala && elScale) magSkala.innerText = elScale.innerText;

      const gNw = document.getElementById('gratNw')?.innerText || '-';
      const gNe = document.getElementById('gratNe')?.innerText || '-';
      const gSw = document.getElementById('gratSw')?.innerText || '-';
      const gSe = document.getElementById('gratSe')?.innerText || '-';
      const mNw = document.getElementById('magGratNw'); if (mNw) mNw.innerText = 'NW: ' + gNw;
      const mNe = document.getElementById('magGratNe'); if (mNe) mNe.innerText = 'NE: ' + gNe;
      const mSw = document.getElementById('magGratSw'); if (mSw) mSw.innerText = 'SW: ' + gSw;
      const mSe = document.getElementById('magGratSe'); if (mSe) mSe.innerText = 'SE: ' + gSe;
    }

    function syncFromMagnifier(field, val) {
      if (field === 'title') {
        const kop = document.getElementById('kopMapTitleInput');
        if (kop) kop.value = val.toUpperCase();
      } else if (field === 'subtitle') {
        const kop = document.getElementById('kopMapSubtitleInput');
        if (kop) kop.value = val;
      } else if (field === 'desa') {
        const kop = document.getElementById('kopDesaInput');
        if (kop) kop.value = val;
      } else if (field === 'kecamatan') {
        const kop = document.getElementById('kopKecamatanInput');
        if (kop) kop.value = val;
      } else if (field === 'kabkot') {
        const kop = document.getElementById('kopKabkotInput');
        if (kop) kop.value = val;
      } else if (field === 'provinsi') {
        const kop = document.getElementById('kopProvinsiInput');
        if (kop) kop.value = val;
      } else if (field === 'pemrakarsa') {
        const kop = document.getElementById('kopPemrakarsa');
        if (kop) kop.innerText = val.toUpperCase();
        const shp = document.getElementById('shpPemrakarsa');
        if (shp) shp.value = val.toUpperCase();
      } else if (field === 'kegiatan') {
        const kop = document.getElementById('kopKegiatan');
        if (kop) kop.innerText = val.toUpperCase();
        const shp = document.getElementById('shpKegiatan');
        if (shp) shp.value = val.toUpperCase();
      } else if (field === 'tahun') {
        const kop = document.getElementById('kopTahun');
        if (kop) kop.innerText = val;
        const shp = document.getElementById('shpTahun');
        if (shp) shp.value = val;
      } else if (field === 'pubName') {
        const kop = document.getElementById('kopPublisherNameInput');
        if (kop) { kop.value = val; handlePublisherChange(); }
      } else if (field === 'pubInfo') {
        const kop = document.getElementById('kopPublisherInfoInput');
        if (kop) { kop.value = val; handlePublisherChange(); }
      }
    }

    function setupKopMagnifierClickListeners() {
      const kopTitleBox = document.querySelector('.print-kop-box:nth-child(1)');
      const kopWilayahBox = document.querySelector('.print-kop-box:nth-child(2)');
      const kopSkalaBox = document.querySelector('.print-kop-box:nth-child(3)');
      const kopKegiatanBox = document.querySelector('.print-kop-box:nth-child(5)');
      const kopPubBox = document.getElementById('kopPublisherBox');

      const scrollToMag = () => {
        const mag = document.getElementById('printMobileMagnifier');
        if (mag && isMobileDevice()) {
          mag.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };

      if (kopTitleBox && !kopTitleBox._magBound) {
        kopTitleBox._magBound = true;
        kopTitleBox.addEventListener('click', () => {
          const btn = document.querySelectorAll('.mag-tab-btn')[1];
          switchMagnifierTab('judul', btn);
          scrollToMag();
        });
      }
      if (kopWilayahBox && !kopWilayahBox._magBound) {
        kopWilayahBox._magBound = true;
        kopWilayahBox.addEventListener('click', () => {
          const btn = document.querySelectorAll('.mag-tab-btn')[0];
          switchMagnifierTab('wilayah', btn);
          scrollToMag();
        });
      }
      if (kopSkalaBox && !kopSkalaBox._magBound) {
        kopSkalaBox._magBound = true;
        kopSkalaBox.addEventListener('click', () => {
          const btn = document.querySelectorAll('.mag-tab-btn')[3];
          switchMagnifierTab('skala', btn);
          scrollToMag();
        });
      }
      if (kopKegiatanBox && !kopKegiatanBox._magBound) {
        kopKegiatanBox._magBound = true;
        kopKegiatanBox.addEventListener('click', () => {
          const btn = document.querySelectorAll('.mag-tab-btn')[2];
          switchMagnifierTab('kegiatan', btn);
          scrollToMag();
        });
      }
      if (kopPubBox && !kopPubBox._magBound) {
        kopPubBox._magBound = true;
        kopPubBox.addEventListener('click', () => {
          const btn = document.querySelectorAll('.mag-tab-btn')[4];
          switchMagnifierTab('penerbit', btn);
          scrollToMag();
        });
      }
    }

    function changePrintTitleFontSize(size) {
      const el = document.getElementById('kopTitleText');
      if (el) el.style.fontSize = size + 'pt';
    }
    window.changePrintTitleFontSize = changePrintTitleFontSize;

