(function() {
  'use strict';

  if (window.location.protocol === 'file:') {
    document.documentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#f8fafc;font-family:sans-serif;text-align:center;padding:24px;"><div><h2 style="color:#ef4444;margin-bottom:12px;font-size:22px;font-weight:700;">AKSES DITOLAK</h2><p style="font-size:14px;color:#cbd5e1;max-width:480px;line-height:1.6;">Aplikasi resmi dilindungi enkripsi dinamis. Akses berkas lokal atau salinan dokumen dinonaktifkan.</p><p style="margin-top:16px;color:#94a3b8;font-size:12px;">Duta Digital Agensi : dutamik.id : Sukoharjo, Jawa Tengah</p></div></div>';
    throw new Error('Protokol tidak diizinkan.');
  }

  const noop = function() {};
  const consoleMethods = ['log', 'debug', 'info', 'warn', 'error', 'table', 'trace', 'dir', 'dirxml', 'group', 'groupCollapsed', 'groupEnd', 'time', 'timeEnd', 'timeLog', 'profile', 'profileEnd', 'count'];
  for (let i = 0; i < consoleMethods.length; i++) {
    try {
      window.console[consoleMethods[i]] = noop;
    } catch (e) {}
  }

  function showBlockNotification(msg) {
    let box = document.getElementById('dutaSecurityNotice');
    if (!box) {
      box = document.createElement('div');
      box.id = 'dutaSecurityNotice';
      box.style.position = 'fixed';
      box.style.bottom = '20px';
      box.style.right = '20px';
      box.style.zIndex = '999999';
      box.style.background = '#0f172a';
      box.style.color = '#f8fafc';
      box.style.border = '1px solid #ef4444';
      box.style.borderRadius = '8px';
      box.style.padding = '12px 18px';
      box.style.fontSize = '13px';
      box.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
      box.style.display = 'flex';
      box.style.alignItems = 'center';
      box.style.gap = '10px';
      box.style.transition = 'opacity 0.3s ease';
      document.body.appendChild(box);
    }
    box.innerHTML = '<span style="color:#ef4444;font-size:16px;font-weight:bold;">&#9888;</span><span>' + msg + '</span>';
    box.style.opacity = '1';
    clearTimeout(box._timer);
    box._timer = setTimeout(() => {
      box.style.opacity = '0';
    }, 3000);
  }

  document.addEventListener('contextmenu', function(e) {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
      e.stopPropagation();
      showBlockNotification('Menu klik kanan dinonaktifkan.');
      return false;
    }
  }, true);

  document.addEventListener('dragstart', function(e) {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
    }
  }, true);

  window.addEventListener('keydown', function(e) {
    const key = e.key;
    const keyCode = e.keyCode;
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    if (key === 'F12' || keyCode === 123) {
      e.preventDefault();
      e.stopPropagation();
      showBlockNotification('Akses Developer Tools F12 diblokir.');
      return false;
    }

    if (ctrl && shift && (key === 'I' || key === 'i' || key === 'J' || key === 'j' || key === 'C' || key === 'c' || key === 'K' || key === 'k')) {
      e.preventDefault();
      e.stopPropagation();
      showBlockNotification('Akses inspeksi elemen diblokir.');
      return false;
    }

    if (ctrl && (key === 'u' || key === 'U' || keyCode === 85)) {
      e.preventDefault();
      e.stopPropagation();
      showBlockNotification('Tampilan kode sumber diblokir.');
      return false;
    }

    if (ctrl && (key === 's' || key === 'S' || keyCode === 83)) {
      e.preventDefault();
      e.stopPropagation();
      showBlockNotification('Penyimpanan halaman lokal dinonaktifkan.');
      return false;
    }

    if (ctrl && (key === 'p' || key === 'P' || keyCode === 80)) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof cetakPetaA3A4 === 'function') {
        cetakPetaA3A4();
      } else {
        showBlockNotification('Gunakan tombol Cetak Resmi pada panel aplikasi.');
      }
      return false;
    }
  }, true);

  let devtoolsDetected = false;
  function probeInspectionState() {
    const threshold = 180;
    const widthDiff = window.outerWidth - window.innerWidth > threshold;
    const heightDiff = window.outerHeight - window.innerHeight > threshold;
    if (widthDiff || heightDiff) {
      if (!devtoolsDetected) {
        devtoolsDetected = true;
        try { window.console.clear(); } catch (err) {}
      }
    } else {
      devtoolsDetected = false;
    }
  }
  window.addEventListener('resize', probeInspectionState, { passive: true });

  const DATA_PAYLOADS = [
    'assets/data/duta_core_7f9a.bin',
    'assets/data/duta_spatial_3c1e.dat',
    'assets/data/duta_cad_8b04.sys',
    'assets/data/duta_app_2d95.pak'
  ];

  let nativeDomFired = false;
  window.addEventListener('DOMContentLoaded', function() {
    nativeDomFired = true;
  }, { capture: true, once: true });

  function executeScriptBlob(code) {
    return new Promise(function(resolve, reject) {
      const blob = new Blob([code], { type: 'text/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      const script = document.createElement('script');
      script.src = blobUrl;
      script.async = false;
      script.onload = function() {
        URL.revokeObjectURL(blobUrl);
        script.remove();
        resolve();
      };
      script.onerror = function() {
        URL.revokeObjectURL(blobUrl);
        script.remove();
        reject(new Error('Gagal mengeksekusi modul sistem.'));
      };
      document.head.appendChild(script);
    });
  }

  async function loadPayload(url) {
    const cacheBust = '?v=0.85_' + Date.now();
    const resp = await fetch(url + cacheBust);
    if (!resp.ok) {
      throw new Error('Gagal memuat arsip data: ' + resp.status);
    }
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const key = 0x5C;
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] ^= key;
    }
    const code = new TextDecoder('utf-8').decode(bytes);
    await executeScriptBlob(code);
  }

  async function bootKernel() {
    try {
      for (let i = 0; i < DATA_PAYLOADS.length; i++) {
        await loadPayload(DATA_PAYLOADS[i]);
      }
      if (nativeDomFired || document.readyState === 'interactive' || document.readyState === 'complete') {
        window.dispatchEvent(new Event('DOMContentLoaded'));
      }
    } catch (err) {
      showBlockNotification('Peringatan integritas sistem: ' + (err.message || 'Muatan gagal.'));
    }
  }

  bootKernel();
})();
