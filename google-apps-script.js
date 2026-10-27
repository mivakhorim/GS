function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    code: 200,
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var raw = e.postData ? e.postData.contents : '';
    var data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (err) {
        data = e.parameter || {};
      }
    } else {
      data = e.parameter || {};
    }

    var action = (data.action || 'ping').toLowerCase();
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'ping') {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        action: 'ping',
        code: 200,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'log_member') {
      var sheetMem = getOrCreateSheet(ss, 'Members', ['Waktu Pendaftaran', 'Email Pengguna', 'Nama Lengkap', 'Role Akun', 'Status Akun', 'Sumber Data']);
      var emailVal = (data.email || '-').toLowerCase().trim();
      var existingVals = sheetMem.getDataRange().getValues();
      var foundRow = -1;
      for (var r = 1; r < existingVals.length; r++) {
        if (String(existingVals[r][1]).toLowerCase().trim() === emailVal) {
          foundRow = r + 1;
          break;
        }
      }
      var rowData = [
        new Date().toISOString(),
        emailVal,
        data.name || data.full_name || 'Member',
        data.role || 'free',
        data.status || 'active',
        data.source || 'auth_gateway'
      ];
      if (foundRow !== -1) {
        sheetMem.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
      } else {
        sheetMem.appendRow(rowData);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        action: 'log_member',
        email: emailVal
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'log_payment') {
      var sheetPay = getOrCreateSheet(ss, 'Payments', ['Waktu Transaksi', 'ID Pembayaran', 'Email Pengguna', 'Nominal Pokok', 'Kode Unik', 'Total Bayar', 'Status']);
      var payId = String(data.id || ('PAY-' + Date.now())).trim();
      var payVals = sheetPay.getDataRange().getValues();
      var foundPayRow = -1;
      for (var p = 1; p < payVals.length; p++) {
        if (String(payVals[p][1]).trim() === payId) {
          foundPayRow = p + 1;
          break;
        }
      }
      var payData = [
        new Date().toISOString(),
        payId,
        (data.email || '-').toLowerCase().trim(),
        Number(data.base_amount || 0),
        String(data.unique_code || ''),
        Number(data.total_amount || 0),
        data.status || 'pending'
      ];
      if (foundPayRow !== -1) {
        sheetPay.getRange(foundPayRow, 1, 1, payData.length).setValues([payData]);
      } else {
        sheetPay.appendRow(payData);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        action: 'log_payment',
        id: payId
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'sync_members') {
      var sMem = getOrCreateSheet(ss, 'Members', ['Waktu Pendaftaran', 'Email Pengguna', 'Nama Lengkap', 'Role Akun', 'Status Akun', 'Sumber Data']);
      var memList = data.members || [];
      if (Array.isArray(memList) && memList.length > 0) {
        var exM = sMem.getDataRange().getValues();
        var mapM = {};
        for (var mi = 1; mi < exM.length; mi++) {
          if (exM[mi][1]) {
            mapM[String(exM[mi][1]).toLowerCase().trim()] = mi + 1;
          }
        }
        for (var k = 0; k < memList.length; k++) {
          var itemM = memList[k];
          var eKey = String(itemM.email || '').toLowerCase().trim();
          var rData = [
            itemM.created_at || new Date().toISOString(),
            eKey,
            itemM.full_name || itemM.name || 'Member',
            itemM.role || 'free',
            itemM.status || 'active',
            'sync_gateway'
          ];
          if (mapM[eKey]) {
            sMem.getRange(mapM[eKey], 1, 1, rData.length).setValues([rData]);
          } else {
            sMem.appendRow(rData);
            mapM[eKey] = sMem.getLastRow();
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        action: 'sync_members',
        count: memList.length
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'sync_payments') {
      var sPay = getOrCreateSheet(ss, 'Payments', ['Waktu Transaksi', 'ID Pembayaran', 'Email Pengguna', 'Nominal Pokok', 'Kode Unik', 'Total Bayar', 'Status']);
      var payList = data.payments || [];
      if (Array.isArray(payList) && payList.length > 0) {
        var exP = sPay.getDataRange().getValues();
        var mapP = {};
        for (var pj = 1; pj < exP.length; pj++) {
          if (exP[pj][1]) {
            mapP[String(exP[pj][1]).trim()] = pj + 1;
          }
        }
        for (var q = 0; q < payList.length; q++) {
          var itemP = payList[q];
          var pKey = String(itemP.id || '').trim();
          var pRow = [
            itemP.created_at || new Date().toISOString(),
            pKey,
            String(itemP.email || '').toLowerCase().trim(),
            Number(itemP.base_amount || 0),
            String(itemP.unique_code || ''),
            Number(itemP.total_amount || 0),
            itemP.status || 'pending'
          ];
          if (mapP[pKey]) {
            sPay.getRange(mapP[pKey], 1, 1, pRow.length).setValues([pRow]);
          } else {
            sPay.appendRow(pRow);
            mapP[pKey] = sPay.getLastRow();
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        action: 'sync_payments',
        count: payList.length
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'anonymous_cadastre_relay') {
      var targetUrl = data.url || 'https://bhumi.atrbpn.go.id/expapi/getPersil';
      var httpMethod = (data.method || 'post').toLowerCase();
      var bpnHeaders = {
        'Origin': 'https://bhumi.atrbpn.go.id',
        'Referer': 'https://bhumi.atrbpn.go.id/peta',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      };
      if (data.token) {
        bpnHeaders['Authorization'] = data.token;
      }
      var fetchOptions = {
        method: httpMethod,
        headers: bpnHeaders,
        muteHttpExceptions: true
      };
      if (httpMethod === 'post' && data.payload) {
        fetchOptions.contentType = 'application/json';
        fetchOptions.payload = typeof data.payload === 'string' ? data.payload : JSON.stringify(data.payload);
      }
      var bpnResp = UrlFetchApp.fetch(targetUrl, fetchOptions);
      var respCode = bpnResp.getResponseCode();
      var respText = bpnResp.getContentText();
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        action: 'anonymous_cadastre_relay',
        response_code: respCode,
        data: respText,
        egress: 'google_llc'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'anonymous_raster_relay') {
      var rasterUrl = data.url;
      if (!rasterUrl) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'URL raster dibutuhkan' })).setMimeType(ContentService.MimeType.JSON);
      }
      var rasterHeaders = {
        'Origin': 'https://bhumi.atrbpn.go.id',
        'Referer': 'https://bhumi.atrbpn.go.id/peta',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };
      var imgResp = UrlFetchApp.fetch(rasterUrl, {
        method: 'get',
        headers: rasterHeaders,
        muteHttpExceptions: true
      });
      var imgBlob = imgResp.getBlob();
      var b64Data = Utilities.base64Encode(imgBlob.getBytes());
      var mimeType = imgBlob.getContentType() || 'image/png';
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        action: 'anonymous_raster_relay',
        mime_type: mimeType,
        base64: b64Data,
        egress: 'google_llc'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'sync_layer_matrix') {
      var sMatrix = getOrCreateSheet(ss, 'LayerMatrix', ['ID Layer', 'Kunci Teknis', 'Nama Fitur Layer', 'Kategori', 'Free', 'Pro', 'Admin', 'URL Endpoint / Server']);
      var matrixItems = data.matrix || [];
      if (Array.isArray(matrixItems) && matrixItems.length > 0) {
        var mRows = matrixItems.map(function(m) {
          return [m.id || '', m.key || '', m.name || '', m.category || '', m.free ? 'YA' : 'TIDAK', m.pro ? 'YA' : 'TIDAK', m.admin ? 'YA' : 'TIDAK', m.server_url || ''];
        });
        sMatrix.getRange(2, 1, mRows.length, 8).setValues(mRows);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        action: 'sync_layer_matrix',
        count: matrixItems.length
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      action: action,
      code: 200
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet(ss, sheetName, headers) {
  var target = ss.getSheetByName(sheetName);
  if (!target) {
    target = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      target.appendRow(headers);
      var range = target.getRange(1, 1, 1, headers.length);
      range.setFontWeight('bold');
      range.setBackground('#0f3b73');
      range.setFontColor('#ffffff');
      target.setFrozenRows(1);
    }
  }
  return target;
}
