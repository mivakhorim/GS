function closeServerModal() {
      const modal = document.getElementById('serverModal');
      if (modal) modal.style.display = 'none';
    }



    var SUPABASE_PROJECT_URL = (function() {
      try { return atob('aHR0cHM6Ly92ZXpydXlmZnptYWJodHlseGlnYy5zdXBhYmFzZS5jbw=='); } catch(e) { return ''; }
    })();
    var SUPABASE_ANON_KEY = localStorage.getItem('supabase_anon_key') || (function() {
      try { return atob('c2JfcHVibGlzaGFibGVfTkJSZVZ2YWM2X0ZVQmU5NjlmTGJPd19aR1pqY3dLTQ=='); } catch(e) { return ''; }
    })();
    var GOOGLE_CLIENT_ID = localStorage.getItem('google_client_id') || '194944801134-etvtpajb04e1jdkrmiv07sjupsqul29p.apps.googleusercontent.com';
    var GOOGLE_SCRIPT_URL = localStorage.getItem('google_script_url') || 'https://script.google.com/macros/s/AKfycbyPbz-E47qirIW73hJAgRKZUgcVpIv4Csk_duLZY3GTiV2w6E0H2Khoq0NwufyfU42R6Q/exec';
    var supabaseClient = null;
    var currentMemberSession = null;
    var _memberSecureState = { role: 'free', status: 'none', email: '', name: '', expires_at: null };

    async function sendGoogleScriptWebhook(action, payload) {
      const url = localStorage.getItem('google_script_url') || GOOGLE_SCRIPT_URL;
      if (!url || !url.startsWith('https://script.google.com/')) return false;
      try {
        await fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: action,
            source: 'duta_geospasi_app',
            timestamp: new Date().toISOString(),
            ...payload
          })
        });
        return true;
      } catch (e) {
        return false;
      }
    }

    function setMemberSecureData(patch) {
      if (patch && typeof patch === 'object') {
        Object.assign(_memberSecureState, patch);
      }
    }

    try {
      Object.defineProperty(window, 'currentMemberProfile', {
        get: function() {
          return Object.freeze({ ..._memberSecureState });
        },
        set: function() {
          return false;
        },
        configurable: false
      });
    } catch (e) {}

    var _cachedRolesList = [
      { role_id: 'free', display_name: 'Member Gratis', max_area_m2: 150, can_export_shp: false, can_use_server2: false, can_manage_roles: false },
      { role_id: 'pro', display_name: 'Member PRO Lifetime', max_area_m2: 0, can_export_shp: true, can_use_server2: false, can_manage_roles: false },
      { role_id: 'admin', display_name: 'Administrator', max_area_m2: 0, can_export_shp: true, can_use_server2: true, can_manage_roles: true }
    ];

    function verifyProLicenseIntegrity() {
      if (!currentMemberSession || !currentMemberSession.user || !currentMemberSession.user.email) return false;
      if (!currentMemberSession.access_token) return false;
      const role = String(_memberSecureState.role || '').toLowerCase();
      const status = String(_memberSecureState.status || '').toLowerCase();
      const rolePerm = _cachedRolesList.find(r => r.role_id === role);
      const isAllowed = (role === 'pro' || role === 'admin') || (rolePerm && rolePerm.can_export_shp === true);
      if (!isAllowed || status !== 'active') return false;
      if (_memberSecureState.email !== currentMemberSession.user.email) return false;
      if (role !== 'admin' && _memberSecureState.expires_at && new Date(_memberSecureState.expires_at) <= new Date()) return false;
      return true;
    }

    function verifyAdminLicenseIntegrity() {
      if (!currentMemberSession || !currentMemberSession.user || !currentMemberSession.user.email) return false;
      if (!currentMemberSession.access_token) return false;
      const role = String(_memberSecureState.role || '').toLowerCase();
      const status = String(_memberSecureState.status || '').toLowerCase();
      const rolePerm = _cachedRolesList.find(r => r.role_id === role);
      const isAllowed = (role === 'admin') || (rolePerm && rolePerm.can_use_server2 === true && rolePerm.can_manage_roles === true);
      if (!isAllowed || status !== 'active') return false;
      if (_memberSecureState.email !== currentMemberSession.user.email) return false;
      return true;
    }

    try {
      Object.defineProperty(window, 'isMemberProActive', {
        value: verifyProLicenseIntegrity,
        writable: false,
        configurable: false
      });
      Object.defineProperty(window, 'isMemberAdminActive', {
        value: verifyAdminLicenseIntegrity,
        writable: false,
        configurable: false
      });
    } catch (e) {
      window.isMemberProActive = verifyProLicenseIntegrity;
      window.isMemberAdminActive = verifyAdminLicenseIntegrity;
    }

    function initSupabase() {
      localStorage.removeItem('duta_pro_token');
      if (typeof window.supabase === 'undefined') return;
      if (!SUPABASE_ANON_KEY) {
        SUPABASE_ANON_KEY = localStorage.getItem('supabase_anon_key') || (function() {
          try { return atob('c2JfcHVibGlzaGFibGVfTkJSZVZ2YWM2X0ZVQmU5NjlmTGJPd19aR1pqY3dLTQ=='); } catch(e) { return ''; }
        })();
      }
      if (SUPABASE_ANON_KEY) {
        try {
          supabaseClient = window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_ANON_KEY, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          });
          supabaseClient.auth.onAuthStateChange(async (event, session) => {
            currentMemberSession = session;
            if (session && session.user) {
              await fetchMemberProfile(session.user);
            } else {
              setMemberSecureData({ role: 'free', status: 'none', email: '', name: '', expires_at: null });
              updateMemberUI();
            }
          });
        } catch (err) {}
      }
      updateMemberUI();
      initGoogleIdentityServices();
    }

    function initGoogleIdentityServices() {
      if (!GOOGLE_CLIENT_ID) {
        GOOGLE_CLIENT_ID = localStorage.getItem('google_client_id') || '194944801134-etvtpajb04e1jdkrmiv07sjupsqul29p.apps.googleusercontent.com';
      }
      const slot = document.getElementById('gisButtonSlot');
      const btn = document.getElementById('btnGoogleAuth');

      if (window.location.protocol === 'file:') {
        if (slot) {
          slot.innerHTML = '<div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius-sm); padding: 0.75rem 1rem; font-size: 0.73rem; color: #92400e; line-height: 1.45; text-align: center; width: 100%; max-width: 360px; margin-bottom: 0.25rem;"><div style="font-weight: 700; margin-bottom: 4px;">Pemberitahuan Protokol Berkas (file://)</div><div>Kebijakan keamanan Google OAuth melarang login dari berkas lokal. Buka aplikasi melalui domain resmi:</div><a href="https://geospasi.dutamik.id" class="btn btn-sm" style="background-color: #0f3b73; color: #ffffff; text-decoration: none; padding: 6px 14px; font-weight: 700; border-radius: 4px; display: inline-block; margin-top: 8px;">Buka geospasi.dutamik.id</a></div>';
        }
        if (btn) btn.style.display = 'none';
        return;
      }

      if (typeof window.google === 'undefined' || !window.google.accounts || !window.google.accounts.id) {
        if (btn) btn.style.display = 'inline-flex';
        setTimeout(() => {
          if (typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.id) {
            initGoogleIdentityServices();
          }
        }, 600);
        return;
      }
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleSignInResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
          context: 'signin'
        });
        if (slot) {
          slot.innerHTML = '';
          window.google.accounts.id.renderButton(slot, {
            theme: 'outline',
            size: 'large',
            type: 'standard',
            shape: 'rectangular',
            text: 'signin_with',
            logo_alignment: 'left',
            width: 320
          });
          if (btn) btn.style.display = 'none';
        }
      } catch (err) {
        if (btn) btn.style.display = 'inline-flex';
      }
    }

    async function handleGoogleSignInResponse(response) {
      if (!response || !response.credential) {
        showToast('Gagal memperoleh otentikasi Google.', 'crimson');
        return;
      }
      if (!ensureSupabaseClient()) return;
      showToast('Memverifikasi identitas akun Google...', 'info');
      try {
        const { data, error } = await supabaseClient.auth.signInWithIdToken({
          provider: 'google',
          token: response.credential
        });
        if (error) {
          showToast('Otentikasi gagal: ' + error.message, 'crimson');
          return;
        }
        showToast('Berhasil masuk dengan Akun Google.', 'success');
        if (data && data.user) {
          await fetchMemberProfile(data.user);
          sendGoogleScriptWebhook('log_member', {
            email: data.user.email,
            name: data.user.user_metadata?.full_name || data.user.email.split('@')[0] || 'Member',
            role: _memberSecureState.role || 'free',
            status: _memberSecureState.status || 'active'
          });
        }
        closeMemberModal();
      } catch (err) {
        showToast('Terjadi kesalahan verifikasi: ' + err.message, 'crimson');
      }
    }

    function configureGoogleClientId() {
      openServerModal();
    }

    async function fetchMemberProfile(user) {
      if (!supabaseClient || !user) return;
      const email = user.email || '';
      const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Member';
      setMemberSecureData({ email, name });
      try {
        const { data, error } = await supabaseClient
          .from('members')
          .select('role, status, expires_at')
          .eq('email', user.email)
          .maybeSingle();

        if (data && !error) {
          setMemberSecureData({
            role: (data.role || 'free').toLowerCase(),
            status: (data.status || 'active').toLowerCase(),
            expires_at: data.expires_at || null
          });
        } else {
          setMemberSecureData({
            role: 'free',
            status: 'active'
          });
        }
      } catch (e) {
        setMemberSecureData({ role: 'free' });
      }
      updateMemberUI();
    }

    async function loginWithGoogle() {
      if (window.location.protocol === 'file:') {
        showToast('Otentikasi Google membutuhkan koneksi online. Silakan buka aplikasi pada domain resmi https://geospasi.dutamik.id', 'warn');
        return;
      }
      if (!ensureSupabaseClient()) {
        showToast('Menghubungkan layanan akun, silakan klik kembali dalam beberapa detik.', 'info');
        return;
      }
      if (!GOOGLE_CLIENT_ID) {
        GOOGLE_CLIENT_ID = localStorage.getItem('google_client_id') || '194944801134-etvtpajb04e1jdkrmiv07sjupsqul29p.apps.googleusercontent.com';
      }
      if (GOOGLE_CLIENT_ID && typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.id) {
        initGoogleIdentityServices();
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            const hasGisButton = document.querySelector('#gisButtonSlot iframe') || document.querySelector('#gisButtonSlot div[role="button"]');
            if (hasGisButton) {
              showToast('Silakan klik tombol Google Sign In di dalam modal akun.', 'info');
            } else {
              fallbackGoogleOAuthRedirect();
            }
          }
        });
        return;
      }
      fallbackGoogleOAuthRedirect();
    }

    async function fallbackGoogleOAuthRedirect() {
      if (window.location.protocol === 'file:') {
        showToast('Otentikasi Google membutuhkan koneksi online. Silakan buka aplikasi pada domain resmi https://geospasi.dutamik.id', 'warn');
        return;
      }
      try {
        const redirectUrl = window.location.origin + window.location.pathname;
        const { error } = await supabaseClient.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl
          }
        });
        if (error) {
          if (error.message && error.message.includes('redirect_uri')) {
            showToast('Konfigurasi Google OAuth: Tambahkan ' + SUPABASE_PROJECT_URL + '/auth/v1/callback ke Authorized redirect URIs Google Cloud.', 'crimson');
          } else {
            showToast('Gagal memproses login Google: ' + error.message, 'crimson');
          }
        }
      } catch (err) {
        showToast('Terjadi kesalahan otentikasi Google: ' + err.message, 'crimson');
      }
    }

    async function logoutMember() {
      if (supabaseClient) {
        try {
          await supabaseClient.auth.signOut();
        } catch (e) {}
      }
      currentMemberSession = null;
      setMemberSecureData({ role: 'free', status: 'none', email: '', name: '', expires_at: null });
      localStorage.removeItem('duta_pro_token');
      updateMemberUI();
      showToast('Anda telah keluar dari akun.', 'info');
    }

    function ensureSupabaseClient() {
      if (!supabaseClient) {
        initSupabase();
      }
      return !!supabaseClient;
    }

    

    function updateMemberUI() {
      const headerBtn = document.getElementById('btnHeaderMember');
      const headerText = document.getElementById('headerMemberText');
      const headerBadge = document.getElementById('headerMemberBadge');
      const guestBody = document.getElementById('memberModalBodyGuest');
      const userBody = document.getElementById('memberModalBodyUser');

      const isPro = isMemberProActive();
      const isAdmin = (typeof isMemberAdminActive === 'function') ? isMemberAdminActive() : (_memberSecureState.role === 'admin');
      const isLoggedIn = !!currentMemberSession?.user;

      if (headerBadge) {
        if (isAdmin) {
          headerBadge.textContent = 'ADMIN';
          headerBadge.className = 'tier-tag pro';
        } else if (isPro) {
          headerBadge.textContent = 'PRO';
          headerBadge.className = 'tier-tag pro';
        } else {
          headerBadge.textContent = 'FREE';
          headerBadge.className = 'tier-tag free';
        }
      }

      if (headerText) {
        if (isLoggedIn) {
          headerText.textContent = (currentMemberProfile.name || 'Member').substring(0, 10);
        } else {
          headerText.textContent = 'Member';
        }
      }

      const attrInputIds = ['shpPemrakarsa', 'shpKegiatan', 'shpTahun', 'shpProvinsi', 'shpKeterangan', 'shpLayer'];
      const tabBtnOss = document.getElementById('tabBtnOss');
      const tabBtnCustom = document.getElementById('tabBtnCustom');
      const attrModeBadge = document.getElementById('attrModeBadge');
      const boxEkspor = document.getElementById('boxEkspor');

      if (!isPro) {
        attrInputIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.disabled = false;
            el.style.backgroundColor = '';
            el.style.cursor = '';
          }
        });

        if (tabBtnCustom) {
          tabBtnCustom.disabled = true;
          tabBtnCustom.style.opacity = '0.7';
          tabBtnCustom.style.cursor = 'pointer';
        }
        if (tabBtnOss) {
          tabBtnOss.disabled = false;
          tabBtnOss.style.cursor = 'pointer';
        }
        if (attrModeBadge) {
          attrModeBadge.className = '';
          attrModeBadge.style.cssText = 'font-size: 0.72rem; font-weight: 600; color: var(--text-sub);';
          attrModeBadge.innerText = 'Free User Max 150 M2';
        }
        let freeNotice = document.getElementById('shpFreeAttrNotice');
        if (!freeNotice && boxEkspor) {
          freeNotice = document.createElement('div');
          freeNotice.id = 'shpFreeAttrNotice';
          freeNotice.style.cssText = 'font-size: 0.71rem; color: var(--text-sub); margin: 4px 0 6px 0; line-height: 1.45;';
          freeNotice.innerHTML = 'Untuk mengedit atribut peta memerlukan akses PRO (Maks luas 150 m²). Berkas: <code>geospasi.zip</code>. <a href="javascript:void(0)" onclick="openMemberModal()" style="color: var(--accent); font-weight: 600; text-decoration: none;">Upgrade ke PRO</a> untuk akses kustom &amp; luas tanpa batas.';
          const tabNav = boxEkspor.querySelector('div[style*="border-bottom"]');
          if (tabNav) {
            boxEkspor.insertBefore(freeNotice, tabNav);
          }
        } else if (freeNotice) {
          freeNotice.style.display = 'block';
        }
      } else {
        attrInputIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.disabled = false;
            el.style.backgroundColor = '';
            el.style.cursor = '';
          }
        });
        if (tabBtnCustom) {
          tabBtnCustom.disabled = false;
          tabBtnCustom.style.opacity = '1';
          tabBtnCustom.style.cursor = 'pointer';
        }
        if (tabBtnOss) {
          tabBtnOss.disabled = false;
          tabBtnOss.style.cursor = 'pointer';
        }
        if (attrModeBadge) {
          attrModeBadge.className = '';
          attrModeBadge.style.cssText = 'font-size: 0.72rem; font-weight: 600; color: var(--emerald);';
          attrModeBadge.innerText = 'Ekspor PRO: Akses Kustom & Luas Tanpa Batas';
        }
        const freeNotice = document.getElementById('shpFreeAttrNotice');
        if (freeNotice) {
          freeNotice.style.display = 'none';
        }
      }

      if (typeof renderCadastralProFields === 'function') {
        renderCadastralProFields();
      }

      if (isLoggedIn) {
        if (guestBody) guestBody.style.display = 'none';
        if (userBody) userBody.style.display = 'flex';

        const nameEl = document.getElementById('memberProfileName');
        const emailEl = document.getElementById('memberProfileEmail');
        const avatarEl = document.getElementById('memberAvatarInitials');
        const badgeEl = document.getElementById('memberProfileBadge');
        const alertEl = document.getElementById('memberStatusAlert');
        const upgradeBtn = document.getElementById('btnUpgradeWa');
        const qrisBtn = document.getElementById('btnUpgradeQris');
        const thankYouCard = document.getElementById('proMemberThankYouCard');

        if (nameEl) nameEl.textContent = currentMemberProfile.name || 'Member Duta GeoSpasi';
        if (emailEl) emailEl.textContent = currentMemberProfile.email || '-';
        if (avatarEl) avatarEl.textContent = (currentMemberProfile.name || currentMemberProfile.email || 'M').charAt(0).toUpperCase();

        if (isAdmin) {
          if (badgeEl) {
            badgeEl.className = 'member-plan-badge pro';
            badgeEl.textContent = 'ADMINISTRATOR';
          }
          if (alertEl) alertEl.style.display = 'none';
          if (thankYouCard) thankYouCard.style.display = 'block';
          if (qrisBtn) qrisBtn.style.display = 'none';
          if (upgradeBtn) upgradeBtn.style.display = 'none';
        } else if (isPro) {
          if (badgeEl) {
            badgeEl.className = 'member-plan-badge pro';
            badgeEl.textContent = 'PRO MEMBER RESMI';
          }
          if (alertEl) {
            alertEl.style.display = 'none';
          }
          if (thankYouCard) thankYouCard.style.display = 'block';
          if (qrisBtn) qrisBtn.style.display = 'none';
          if (upgradeBtn) upgradeBtn.style.display = 'none';
        } else {
          if (badgeEl) {
            badgeEl.className = 'member-plan-badge free';
            badgeEl.textContent = 'FREE TIER';
          }
          if (alertEl) {
            alertEl.style.display = 'block';
            alertEl.innerHTML = 'Untuk mengedit atribut peta memerlukan akses PRO. Mode Akun Gratis dibatasi maksimal luas 150 m² (berkas: geospasi.zip). Upgrade ke PRO untuk akses kustom & luas tanpa batas.';
          }
          if (thankYouCard) thankYouCard.style.display = 'none';
          if (qrisBtn) qrisBtn.style.display = 'flex';
          if (upgradeBtn) upgradeBtn.style.display = 'flex';
        }
      } else {
        if (guestBody) guestBody.style.display = 'flex';
        if (userBody) userBody.style.display = 'none';
      }
      if (typeof updateCadastreServerUI === 'function') {
        updateCadastreServerUI();
      }
      renderAdminRoleManagementUI(isAdmin);
    }

    function openMemberModal() {
      updateMemberUI();
      const modal = document.getElementById('memberModal');
      if (modal) modal.style.display = 'flex';
      initGoogleIdentityServices();
    }

    function closeMemberModal() {
      const modal = document.getElementById('memberModal');
      if (modal) modal.style.display = 'none';
    }

    var currentPaymentDetails = {
      baseAmount: 75000,
      uniqueCode: 100,
      totalAmount: 75100
    };

    function applyPaymentDetailsToUI(email, details) {
      const emailInput = document.getElementById('qrisBuyerEmail');
      if (emailInput) {
        emailInput.value = email;
        emailInput.readOnly = true;
      }
      const totalDisplay = document.getElementById('qrisTotalDisplay');
      if (totalDisplay) {
        totalDisplay.textContent = 'Rp ' + Number(details.totalAmount).toLocaleString('id-ID');
      }
      const codeDisplay = document.getElementById('qrisUniqueCodeDisplay');
      if (codeDisplay) {
        codeDisplay.textContent = String(details.uniqueCode);
      }
    }

    async function generateQrisPayment(targetEmail) {
      const email = (currentMemberSession?.user?.email || targetEmail || '').trim();
      const base = 75000;

      if (supabaseClient && currentMemberSession && currentMemberSession.user) {
        try {
          const { data, error } = await supabaseClient.rpc('create_pending_payment', {
            p_plan: 'pro_annual',
            p_base_amount: base
          });
          if (data && !error) {
            currentPaymentDetails = {
              baseAmount: Number(data.base_amount || base),
              uniqueCode: Number(data.unique_code),
              totalAmount: Number(data.total_amount),
              id: data.id
            };
            applyPaymentDetailsToUI(email, currentPaymentDetails);
            return;
          }
        } catch (rpcErr) {}
      }

      const code = 100 + ((Date.now() + Math.floor(Math.random() * 899)) % 899);
      const total = base + code;
      currentPaymentDetails = {
        baseAmount: base,
        uniqueCode: code,
        totalAmount: total,
        id: null
      };
      applyPaymentDetailsToUI(email, currentPaymentDetails);
      await savePendingPaymentRecord(email, base, code, total);
    }

    async function savePendingPaymentRecord(email, base, code, total) {
      if (!supabaseClient || !email) return;
      try {
        const { data } = await supabaseClient.from('payments').insert([
          {
            email: email,
            base_amount: base,
            unique_code: code,
            total_amount: total,
            status: 'pending'
          }
        ]).select('id');
        if (data && data[0] && data[0].id) {
          currentPaymentDetails.id = data[0].id;
        }
      } catch (e) {}
      sendGoogleScriptWebhook('log_payment', {
        id: currentPaymentDetails.id || ('PAY-' + Date.now()),
        email: email,
        base_amount: base,
        unique_code: code,
        total_amount: total,
        status: 'pending'
      });
    }

    var _qrisPollTimer = null;

    async function pollPaymentStatusSilently() {
      const email = currentMemberSession?.user?.email;
      if (!email || !supabaseClient) return;
      try {
        const { data } = await supabaseClient
          .from('members')
          .select('role, status')
          .eq('email', email)
          .maybeSingle();

        if (data && data.role === 'pro' && data.status === 'active') {
          if (_qrisPollTimer) {
            clearInterval(_qrisPollTimer);
            _qrisPollTimer = null;
          }
          setMemberSecureData({ role: 'pro', status: 'active' });
          updateMemberUI();
          showToast('Selamat! Pembayaran terverifikasi otomatis, Akun Anda telah menjadi PRO MEMBER!', 'success');
          closeQrisPaymentModal();
          closeMemberModal();
        }
      } catch (e) {}
    }

    function openQrisPaymentModal() {
      if (!currentMemberSession || !currentMemberSession.user || !currentMemberSession.user.email) {
        showToast('Wajib login dengan Akun Google terlebih dahulu sebelum aktivasi status PRO.', 'warn');
        openMemberModal();
        return;
      }
      const userEmail = currentMemberSession.user.email;
      generateQrisPayment(userEmail);
      const modal = document.getElementById('qrisPaymentModal');
      if (modal) modal.style.display = 'flex';
      if (_qrisPollTimer) {
        clearInterval(_qrisPollTimer);
        _qrisPollTimer = null;
      }
      _qrisPollTimer = setInterval(pollPaymentStatusSilently, 5000);
    }

    function closeQrisPaymentModal() {
      if (_qrisPollTimer) {
        clearInterval(_qrisPollTimer);
        _qrisPollTimer = null;
      }
      const modal = document.getElementById('qrisPaymentModal');
      if (modal) modal.style.display = 'none';
    }

    function copyQrisAmount() {
      const num = currentPaymentDetails.totalAmount || 75000;
      navigator.clipboard.writeText(String(num)).then(() => {
        showToast('Nominal transfer Rp ' + num.toLocaleString('id-ID') + ' disalin.', 'success');
      }).catch(() => {
        showToast('Nominal: ' + num, 'info');
      });
    }

    function confirmPaymentWhatsApp() {
      const email = document.getElementById('qrisBuyerEmail')?.value.trim() || currentMemberProfile?.email || '-';
      if (!email || !email.includes('@')) {
        showToast('Masukkan alamat email Anda terlebih dahulu.', 'warn');
        return;
      }
      const total = currentPaymentDetails.totalAmount;
      const code = currentPaymentDetails.uniqueCode;
      const text = encodeURIComponent(
        'Halo Admin Duta Digital Agensi, saya telah melakukan transfer pembayaran QRIS untuk aktivasi Member PRO Duta GeoSpasi:\n\n' +
        '• Email Akun: ' + email + '\n' +
        '• Total Transfer: Rp ' + total.toLocaleString('id-ID') + '\n' +
        '• Kode Unik 3 Digit: ' + code + '\n' +
        '• Tanggal: ' + new Date().toLocaleDateString('id-ID') + '\n\n' +
        'Mohon diverifikasi agar status PRO segera aktif. Bukti transfer terlampir. Terima kasih!'
      );
      window.open('https://wa.me/6283130300094?text=' + text, '_blank');
    }

    async function checkPaymentStatusLive() {
      if (!currentMemberSession || !currentMemberSession.user || !currentMemberSession.user.email) {
        showToast('Silakan login dengan Akun Google terlebih dahulu untuk memeriksa status verifikasi akun.', 'warn');
        openMemberModal();
        return;
      }
      const email = currentMemberSession.user.email;
      showToast('Memeriksa status verifikasi pembayaran di database...', 'info');
      if (supabaseClient) {
        try {
          const { data } = await supabaseClient
            .from('members')
            .select('role, status')
            .eq('email', email)
            .maybeSingle();

          if (data && data.role === 'pro' && data.status === 'active') {
            setMemberSecureData({ role: 'pro', status: 'active' });
            updateMemberUI();
            showToast('Selamat! Pembayaran terverifikasi, Akun Anda telah menjadi PRO MEMBER!', 'success');
            closeQrisPaymentModal();
            closeMemberModal();
            return;
          }
        } catch (e) {}
      }
      showToast('Pembayaran belum diverifikasi. Jika sudah transfer, silakan konfirmasi via WhatsApp agar admin segera mengaktifkan akun Anda.', 'warn');
    }

    async function cancelAndClearCurrentPendingPayment() {
      if (!currentMemberSession || !currentMemberSession.user || !currentMemberSession.user.email) {
        closeQrisPaymentModal();
        return;
      }
      const authEmail = currentMemberSession.user.email;
      if (!confirm('Konfirmasi: Batalkan transaksi dan hapus data tagihan QRIS yang belum dibayar ini?')) return;
      if (supabaseClient) {
        try {
          let query = supabaseClient.from('payments').delete().eq('email', authEmail).eq('status', 'pending');
          if (currentPaymentDetails && currentPaymentDetails.id) {
            query = query.eq('id', currentPaymentDetails.id);
          }
          const { error } = await query;
          if (error) {
            showToast('Gagal membatalkan tagihan: ' + error.message, 'warn');
            return;
          }
          currentPaymentDetails = {};
          showToast('Data tagihan berhasil dibatalkan dan dihapus.', 'info');
          closeQrisPaymentModal();
        } catch (e) {
          showToast('Gagal membatalkan tagihan.', 'warn');
        }
      } else {
        closeQrisPaymentModal();
      }
    }

    async function fetchRolesList() {
      if (!supabaseClient) return _cachedRolesList;
      try {
        const { data, error } = await supabaseClient.rpc('get_roles_list');
        if (data && !error && Array.isArray(data) && data.length > 0) {
          _cachedRolesList = data;
        }
      } catch (e) {}
      return _cachedRolesList;
    }

    async function fetchMembersAdminList(search, limit, offset) {
      if (!supabaseClient || !isMemberAdminActive()) return [];
      try {
        const { data, error } = await supabaseClient.rpc('get_members_list_admin', {
          p_search: search || '',
          p_limit: limit || 50,
          p_offset: offset || 0
        });
        if (error) {
          showToast('Gagal memuat data member: ' + error.message, 'crimson');
          return [];
        }
        return data || [];
      } catch (e) {
        showToast('Terjadi kesalahan saat memuat data member.', 'crimson');
        return [];
      }
    }

    async function assignMemberRole(targetEmail, newRole, durationDays) {
      if (!supabaseClient || !isMemberAdminActive()) {
        showToast('Akses ditolak: Hanya administrator yang berhak mengubah role member.', 'crimson');
        return false;
      }
      const email = (targetEmail || '').trim().toLowerCase();
      const role = (newRole || '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        showToast('Masukkan alamat email member yang valid.', 'warn');
        return false;
      }
      showToast('Menyimpan perubahan role member...', 'info');
      try {
        const { data, error } = await supabaseClient.rpc('set_member_role', {
          p_email: email,
          p_role: role,
          p_duration_days: durationDays ? parseInt(durationDays, 10) : null
        });
        if (error) {
          showToast('Gagal mengubah role: ' + error.message, 'crimson');
          return false;
        }
        showToast('Role untuk ' + email + ' berhasil diperbarui menjadi ' + role.toUpperCase() + '.', 'success');
        await refreshAdminRoleUI();
        return true;
      } catch (e) {
        showToast('Terjadi kesalahan: ' + e.message, 'crimson');
        return false;
      }
    }

    async function saveCustomRole(roleObj) {
      if (!supabaseClient || !isMemberAdminActive()) {
        showToast('Akses ditolak: Hanya administrator yang dapat mengelola role.', 'crimson');
        return false;
      }
      try {
        const { data, error } = await supabaseClient.rpc('add_or_update_role', {
          p_role_id: roleObj.role_id,
          p_display_name: roleObj.display_name,
          p_description: roleObj.description || '',
          p_max_area_m2: Number(roleObj.max_area_m2) || 0,
          p_can_export_shp: !!roleObj.can_export_shp,
          p_can_use_server2: !!roleObj.can_use_server2,
          p_can_manage_roles: !!roleObj.can_manage_roles
        });
        if (error) {
          showToast('Gagal menyimpan role: ' + error.message, 'crimson');
          return false;
        }
        showToast('Role ' + roleObj.display_name + ' berhasil disimpan.', 'success');
        await fetchRolesList();
        await refreshAdminRoleUI();
        return true;
      } catch (e) {
        showToast('Gagal menyimpan role: ' + e.message, 'crimson');
        return false;
      }
    }

    async function removeCustomRole(roleId) {
      if (!supabaseClient || !isMemberAdminActive()) {
        showToast('Akses ditolak: Hanya administrator yang dapat menghapus role.', 'crimson');
        return false;
      }
      if (!confirm('Konfirmasi: Hapus role custom "' + roleId + '" dari sistem?')) return false;
      try {
        const { data, error } = await supabaseClient.rpc('delete_custom_role', {
          p_role_id: roleId
        });
        if (error) {
          showToast('Gagal menghapus role: ' + error.message, 'crimson');
          return false;
        }
        showToast('Role ' + roleId + ' berhasil dihapus.', 'info');
        await fetchRolesList();
        await refreshAdminRoleUI();
        return true;
      } catch (e) {
        showToast('Gagal menghapus role: ' + e.message, 'crimson');
        return false;
      }
    }

    function toggleAdminNewRoleForm() {
      const el = document.getElementById('adminNewRoleFormBody');
      const btn = document.getElementById('btnToggleNewRoleText');
      if (!el) return;
      if (el.style.display === 'none' || !el.style.display) {
        el.style.display = 'flex';
        if (btn) btn.textContent = 'Tutup Form';
      } else {
        el.style.display = 'none';
        if (btn) btn.textContent = 'Buka Form';
      }
    }

    async function handleAdminAssignRoleSubmit() {
      const emailInput = document.getElementById('adminTargetMemberEmail');
      const roleSelect = document.getElementById('adminSelectMemberRole');
      const durSelect = document.getElementById('adminSelectMemberDuration');
      if (!emailInput || !roleSelect) return;
      const email = emailInput.value.trim();
      const role = roleSelect.value;
      const dur = durSelect ? durSelect.value : 0;
      const ok = await assignMemberRole(email, role, dur);
      if (ok) {
        emailInput.value = '';
      }
    }

    async function handleAdminSaveRoleSubmit() {
      const idInput = document.getElementById('newRoleIdInput');
      const nameInput = document.getElementById('newRoleNameInput');
      const maxAreaInput = document.getElementById('newRoleMaxAreaInput');
      const shpCb = document.getElementById('newRoleExportShp');
      const srv2Cb = document.getElementById('newRoleServer2');
      if (!idInput || !nameInput) return;
      const roleId = idInput.value.trim().toLowerCase();
      const roleName = nameInput.value.trim();
      if (!roleId || !roleName) {
        showToast('ID Role dan Nama Tampilan wajib diisi.', 'warn');
        return;
      }
      const ok = await saveCustomRole({
        role_id: roleId,
        display_name: roleName,
        max_area_m2: Number(maxAreaInput ? maxAreaInput.value : 0),
        can_export_shp: shpCb ? shpCb.checked : false,
        can_use_server2: srv2Cb ? srv2Cb.checked : false,
        can_manage_roles: false
      });
      if (ok) {
        idInput.value = '';
        nameInput.value = '';
        toggleAdminNewRoleForm();
      }
    }

    var _adminSearchDebounceTimer = null;
    function debounceAdminMemberSearch() {
      if (_adminSearchDebounceTimer) clearTimeout(_adminSearchDebounceTimer);
      _adminSearchDebounceTimer = setTimeout(() => {
        renderAdminMemberListItems();
      }, 350);
    }

    async function renderAdminMemberListItems() {
      const listEl = document.getElementById('adminMemberListContainer');
      const searchEl = document.getElementById('adminSearchMemberInput');
      if (!listEl) return;
      const term = (searchEl ? searchEl.value : '').trim();
      const members = await fetchMembersAdminList(term, 40, 0);
      if (!members || members.length === 0) {
        listEl.innerHTML = '<div style="font-size: 0.7rem; color: var(--text-muted); text-align: center; padding: 6px;">Tidak ada member ditemukan.</div>';
        return;
      }
      let html = '';
      members.forEach(m => {
        const email = m.email || '-';
        const role = (m.role || 'free').toUpperCase();
        const roleBadgeClass = (m.role === 'admin' || m.role === 'pro') ? 'tier-tag pro' : 'tier-tag free';
        const isTargetPro = (m.role === 'pro');
        const quickActionText = isTargetPro ? 'Ke Free' : 'Jadikan PRO';
        const targetNextRole = isTargetPro ? 'free' : 'pro';
        html += '<div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; background-color: var(--bg-subtle); border-radius: var(--radius-sm); font-size: 0.7rem; gap: 4px;">';
        html += '<div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">';
        html += '<span style="font-weight: 600; color: var(--text-main);">' + email + '</span>';
        html += '</div>';
        html += '<div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">';
        html += '<span class="' + roleBadgeClass + '" style="font-size: 0.62rem; padding: 1px 5px;">' + role + '</span>';
        if (m.role !== 'admin') {
          html += '<button type="button" class="btn btn-sm btn-outline" onclick="assignMemberRole(\'' + email + '\', \'' + targetNextRole + '\', 0)" style="padding: 1px 5px; font-size: 0.62rem; height: 20px;">' + quickActionText + '</button>';
        }
        html += '</div>';
        html += '</div>';
      });
      listEl.innerHTML = html;
    }

    async function populateAdminRoleDropdown() {
      const select = document.getElementById('adminSelectMemberRole');
      if (!select) return;
      const roles = await fetchRolesList();
      let html = '';
      roles.forEach(r => {
        const isSel = (r.role_id === 'pro') ? 'selected' : '';
        html += '<option value="' + r.role_id + '" ' + isSel + '>' + r.display_name + '</option>';
      });
      select.innerHTML = html;
    }

    async function refreshAdminRoleUI() {
      await populateAdminRoleDropdown();
      await renderAdminMemberListItems();
    }

    function renderAdminRoleManagementUI(isAdmin) {
      const userBody = document.getElementById('memberModalBodyUser');
      if (!userBody) return;
      let panel = document.getElementById('adminRolePanel');
      if (!isAdmin) {
        if (panel) panel.style.display = 'none';
        return;
      }
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'adminRolePanel';
        panel.style.cssText = 'display: flex; flex-direction: column; gap: 0.55rem; margin-top: 0.4rem; padding-top: 0.65rem; border-top: 1px solid var(--border-light); width: 100%;';
        panel.innerHTML = '<div style="display: flex; align-items: center; justify-content: space-between;">' +
          '<div style="font-size: 0.76rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 6px;">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent);"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9z"/></svg>' +
            '<span>Manajemen Role Supabase</span>' +
          '</div>' +
          '<button type="button" class="btn btn-sm btn-outline" id="btnRefreshAdminPanel" onclick="refreshAdminRoleUI()" title="Muat Ulang Data Member" aria-label="Muat Ulang Data Member" style="padding: 2px 6px; height: 24px;">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
          '</button>' +
        '</div>' +
        '<div style="background-color: var(--bg-surface); border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 0.6rem; display: flex; flex-direction: column; gap: 0.4rem;">' +
          '<div style="font-size: 0.7rem; font-weight: 700; color: var(--text-sub);">Tetapkan Role Pengguna</div>' +
          '<div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">' +
            '<input type="email" id="adminTargetMemberEmail" placeholder="Email member..." class="form-control" style="flex: 1 1 140px; font-size: 0.72rem; padding: 3px 6px; height: 28px;">' +
            '<select id="adminSelectMemberRole" class="form-control" style="flex: 1 1 90px; font-size: 0.72rem; padding: 3px 6px; height: 28px;">' +
              '<option value="free">Free</option>' +
              '<option value="pro" selected>PRO</option>' +
              '<option value="admin">Admin</option>' +
            '</select>' +
            '<select id="adminSelectMemberDuration" class="form-control" style="flex: 1 1 80px; font-size: 0.72rem; padding: 3px 6px; height: 28px;">' +
              '<option value="0">Lifetime</option>' +
              '<option value="30">30 Hari</option>' +
              '<option value="90">90 Hari</option>' +
              '<option value="365">1 Tahun</option>' +
            '</select>' +
            '<button type="button" class="btn btn-primary btn-sm" onclick="handleAdminAssignRoleSubmit()" title="Simpan Role Member" aria-label="Simpan Role Member" style="height: 28px; padding: 0 9px;">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div style="background-color: var(--bg-surface); border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 0.6rem; display: flex; flex-direction: column; gap: 0.4rem;">' +
          '<div style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="toggleAdminNewRoleForm()">' +
            '<div style="font-size: 0.7rem; font-weight: 700; color: var(--text-sub);">Tambah Role Kustom</div>' +
            '<button type="button" class="btn btn-sm btn-outline" style="padding: 1px 6px; font-size: 0.68rem; height: 22px;" id="btnToggleNewRoleText">Buka Form</button>' +
          '</div>' +
          '<div id="adminNewRoleFormBody" style="display: none; flex-direction: column; gap: 0.35rem; margin-top: 0.2rem;">' +
            '<div style="display: flex; gap: 0.35rem;">' +
              '<input type="text" id="newRoleIdInput" placeholder="ID (contoh: surveyor)" class="form-control" style="flex: 1; font-size: 0.7rem; padding: 3px 6px; height: 26px;">' +
              '<input type="text" id="newRoleNameInput" placeholder="Nama Tampilan" class="form-control" style="flex: 1; font-size: 0.7rem; padding: 3px 6px; height: 26px;">' +
            '</div>' +
            '<div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">' +
              '<input type="number" id="newRoleMaxAreaInput" placeholder="Maks Luas (0=Bebas)" class="form-control" style="flex: 1 1 110px; font-size: 0.7rem; padding: 3px 6px; height: 26px;" value="0">' +
              '<label style="display: flex; align-items: center; gap: 3px; font-size: 0.68rem; color: var(--text-main); cursor: pointer;">' +
                '<input type="checkbox" id="newRoleExportShp" checked> Ekspor SHP' +
              '</label>' +
              '<label style="display: flex; align-items: center; gap: 3px; font-size: 0.68rem; color: var(--text-main); cursor: pointer;">' +
                '<input type="checkbox" id="newRoleServer2"> Server 2' +
              '</label>' +
            '</div>' +
            '<div style="display: flex; justify-content: flex-end; margin-top: 2px;">' +
              '<button type="button" class="btn btn-sm btn-primary" onclick="handleAdminSaveRoleSubmit()" style="font-size: 0.7rem; padding: 2px 10px; height: 26px;">Simpan Role Baru</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="background-color: var(--bg-surface); border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 0.6rem; display: flex; flex-direction: column; gap: 0.4rem;">' +
          '<div style="display: flex; align-items: center; justify-content: space-between; gap: 0.35rem;">' +
            '<div style="font-size: 0.7rem; font-weight: 700; color: var(--text-sub);">Daftar Member Terdaftar</div>' +
            '<input type="text" id="adminSearchMemberInput" placeholder="Cari email / role..." oninput="debounceAdminMemberSearch()" class="form-control" style="max-width: 140px; font-size: 0.68rem; padding: 2px 5px; height: 22px;">' +
          '</div>' +
          '<div id="adminMemberListContainer" style="max-height: 130px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem;">' +
            '<div style="font-size: 0.68rem; color: var(--text-muted); text-align: center; padding: 4px;">Memuat data...</div>' +
          '</div>' +
        '</div>';
        const logoutBtn = userBody.querySelector('button[onclick*="logoutMember"]');
        if (logoutBtn && logoutBtn.parentElement) {
          logoutBtn.parentElement.insertBefore(panel, logoutBtn);
        } else {
          userBody.appendChild(panel);
        }
      }
      panel.style.display = 'flex';
      refreshAdminRoleUI();
    }


    function initSecurityShield() {
      document.addEventListener('contextmenu', function(e) {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          return false;
        }
      }, true);

      document.addEventListener('keydown', function(e) {
        if (
          e.key === 'F12' ||
          e.keyCode === 123 ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c' || e.keyCode === 67)) ||
          ((e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) ||
          ((e.ctrlKey || e.metaKey) && (e.key === 'S' || e.key === 's' || e.keyCode === 83))
        ) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }, true);

      const criticalGlobals = [
        'isMemberProActive',
        'verifyProLicenseIntegrity',
        'exportCurrentPersilToShp',
        'exportCurrentPersilToCad',
        'exportCurrentPersilToGeoJson',
        'exportCurrentPersilToExcel',
        'switchCadastreServer',
        'getCadastreServerMode',
        'updateCadastreServerUI',
        'autoScaleToBpnArea',
        'autoScaleToOssArea'
      ];

      function lockGlobals() {
        criticalGlobals.forEach(name => {
          if (typeof window[name] === 'function') {
            try {
              const fn = window[name];
              Object.defineProperty(window, name, {
                value: fn,
                writable: false,
                configurable: false
              });
            } catch (e) {}
          }
        });
      }

      setTimeout(lockGlobals, 1200);
      setTimeout(lockGlobals, 3500);
    }

    initSecurityShield();

    window.initSupabase = initSupabase;
    window.ensureSupabaseClient = ensureSupabaseClient;
    window.initGoogleIdentityServices = initGoogleIdentityServices;
    window.handleGoogleSignInResponse = handleGoogleSignInResponse;
    window.configureGoogleClientId = configureGoogleClientId;
    window.fetchMemberProfile = fetchMemberProfile;
    window.loginWithGoogle = loginWithGoogle;
    window.fallbackGoogleOAuthRedirect = fallbackGoogleOAuthRedirect;
    window.logoutMember = logoutMember;
    window.verifyProLicenseIntegrity = verifyProLicenseIntegrity;
    window.updateMemberUI = updateMemberUI;
    window.openMemberModal = openMemberModal;
    window.closeMemberModal = closeMemberModal;
    window.generateQrisPayment = generateQrisPayment;
    window.savePendingPaymentRecord = savePendingPaymentRecord;
    window.openQrisPaymentModal = openQrisPaymentModal;
    window.closeQrisPaymentModal = closeQrisPaymentModal;
    window.copyQrisAmount = copyQrisAmount;
    window.confirmPaymentWhatsApp = confirmPaymentWhatsApp;
    window.checkPaymentStatusLive = checkPaymentStatusLive;
    window.cancelAndClearCurrentPendingPayment = cancelAndClearCurrentPendingPayment;
    window.fetchRolesList = fetchRolesList;
    window.fetchMembersAdminList = fetchMembersAdminList;
    window.assignMemberRole = assignMemberRole;
    window.saveCustomRole = saveCustomRole;
    window.removeCustomRole = removeCustomRole;
    window.refreshAdminRoleUI = refreshAdminRoleUI;
    window.toggleAdminNewRoleForm = toggleAdminNewRoleForm;
    window.handleAdminAssignRoleSubmit = handleAdminAssignRoleSubmit;
    window.handleAdminSaveRoleSubmit = handleAdminSaveRoleSubmit;
    window.debounceAdminMemberSearch = debounceAdminMemberSearch;
    window.renderAdminRoleManagementUI = renderAdminRoleManagementUI;
    window.sendGoogleScriptWebhook = sendGoogleScriptWebhook;
    if (typeof window.supabase !== 'undefined') {
      initSupabase();
    }
