(function() {
  'use strict';

  const FALLBACK_SCRIPTS = [
    'assets/js/config.js',
    'assets/js/auth.js',
    'assets/js/map.js',
    'assets/js/cadastre.js',
    'assets/js/drawing.js',
    'assets/js/poi.js',
    'assets/js/canvas.js',
    'assets/js/wilayah.js',
    'assets/js/export.js',
    'assets/js/print.js',
    'assets/js/app.js'
  ];

  document.addEventListener('contextmenu', function(e) {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
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
      return false;
    }

    if (ctrl && shift && (key === 'I' || key === 'i' || key === 'J' || key === 'j' || key === 'C' || key === 'c' || key === 'K' || key === 'k')) {
      e.preventDefault();
      return false;
    }

    if (ctrl && (key === 'u' || key === 'U' || keyCode === 85)) {
      e.preventDefault();
      return false;
    }

    if (ctrl && (key === 's' || key === 'S' || keyCode === 83)) {
      e.preventDefault();
      return false;
    }

    if (ctrl && (key === 'p' || key === 'P' || keyCode === 80)) {
      e.preventDefault();
      if (typeof cetakPetaA3A4 === 'function') {
        cetakPetaA3A4();
      }
      return false;
    }
  }, true);

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
        resolve();
      };
      script.onerror = function() {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('Eksekusi modul gagal.'));
      };
      document.head.appendChild(script);
    });
  }

  async function loadPayload(url) {
    const cacheBust = '?v=0.99_' + Date.now();
    const resp = await fetch(url + cacheBust);
    if (!resp.ok) {
      throw new Error('Arsip data tidak dapat diakses.');
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

  function loadScriptDirect(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function bootFallback() {
    for (let i = 0; i < FALLBACK_SCRIPTS.length; i++) {
      try {
        await loadScriptDirect(FALLBACK_SCRIPTS[i]);
      } catch (e) {}
    }
    if (nativeDomFired || document.readyState === 'interactive' || document.readyState === 'complete') {
      window.dispatchEvent(new Event('DOMContentLoaded'));
    }
  }

  async function bootKernel() {
    if (window.location.protocol === 'file:') {
      await bootFallback();
      return;
    }
    let waitAttempts = 0;
    while (typeof window.L === 'undefined' && waitAttempts < 100) {
      await new Promise(r => setTimeout(r, 50));
      waitAttempts++;
    }
    try {
      for (let i = 0; i < DATA_PAYLOADS.length; i++) {
        await loadPayload(DATA_PAYLOADS[i]);
      }
      if (nativeDomFired || document.readyState === 'interactive' || document.readyState === 'complete') {
        window.dispatchEvent(new Event('DOMContentLoaded'));
      }
    } catch (err) {
      await bootFallback();
    }
  }

  bootKernel();
})();
