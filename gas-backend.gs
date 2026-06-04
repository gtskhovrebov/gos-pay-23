/*
  GOS Pay backend for Google Apps Script
  Deploy: Extensions -> Apps Script -> Deploy -> Web app
  Recommended access: Anyone with Google account. Execute as: User accessing the web app.
*/
const DEFAULT_SHEET_ID = '1LSlUC-t6_7x8vfg5mQebIwRHfDH8h0bB1Xzxq7wpv_U';
const STATE_SHEET_NAME = '_GOS_PAY_STATE';

function doGet(e) {
  const action = String(e.parameter.action || 'get');
  const sheetId = String(e.parameter.sheetId || DEFAULT_SHEET_ID);
  const access = checkEditorAccess_(sheetId);
  if (!access.allowed) return json_({ allowed: false, email: access.email || '', reason: 'NO_EDITOR_ACCESS' });
  if (action === 'access') return json_({ allowed: true, email: access.email, roles: ['Руководство государственных организаций','Старший куратор организации','Куратор'] });
  if (action === 'curators') return json_({ allowed: true, email: access.email, factions: readCurators_(sheetId) });
  const state = readState_(sheetId);
  const factions = readCurators_(sheetId);
  if (factions.length) state.factions = factions;
  return json_({ allowed: true, email: access.email, state: state, factions: factions });
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents || '{}');
  const sheetId = String(payload.sheetId || DEFAULT_SHEET_ID);
  const access = checkEditorAccess_(sheetId);
  if (!access.allowed) return json_({ allowed: false, reason: 'NO_EDITOR_ACCESS' });
  if (payload.action === 'reset') {
    const state = readState_(sheetId);
    state.donations = {};
    writeState_(sheetId, state);
    return json_({ ok: true });
  }
  if (payload.state) {
    const currentFactions = readCurators_(sheetId);
    const state = payload.state;
    if (currentFactions.length) state.factions = currentFactions;
    writeState_(sheetId, state);
    return json_({ ok: true, updatedAt: new Date().toISOString() });
  }
  return json_({ ok: false });
}

function checkEditorAccess_(sheetId) {
  const email = Session.getActiveUser().getEmail();
  try {
    const file = DriveApp.getFileById(sheetId);
    const owner = file.getOwner() && file.getOwner().getEmail();
    if (email && owner && email.toLowerCase() === owner.toLowerCase()) return { allowed: true, email: email };
    const editors = file.getEditors().map(u => String(u.getEmail()).toLowerCase());
    return { allowed: !!email && editors.indexOf(email.toLowerCase()) !== -1, email: email };
  } catch (err) {
    return { allowed: false, email: email, error: String(err) };
  }
}

function readCurators_(sheetId) {
  const ss = SpreadsheetApp.openById(sheetId);
  const names = ['кураторы', 'Кураторы', 'Лист1', 'Sheet1'];
  let sheet = null;
  for (let i = 0; i < names.length; i++) { sheet = ss.getSheetByName(names[i]); if (sheet) break; }
  if (!sheet) sheet = ss.getSheets()[0];
  const values = sheet.getDataRange().getDisplayValues();
  return parseFactions_(values);
}

function parseFactions_(rows) {
  const headers = [];
  rows.forEach((row, r) => row.forEach((cell, c) => {
    const title = normalizeTitle_(cell);
    if (title) headers.push({ title: title, r: r, c: c });
  }));
  const factions = [];
  headers.forEach(h => {
    const same = headers.filter(x => x.r === h.r && x.c > h.c).sort((a,b) => a.c - b.c)[0];
    const endC = same ? same.c - 1 : h.c + 3;
    const vals = [];
    for (let rr = h.r + 1; rr < Math.min(rows.length, h.r + 9); rr++) {
      for (let cc = h.c; cc <= endC; cc++) {
        const v = String((rows[rr] && rows[rr][cc]) || '').trim();
        if (/^[\wА-Яа-яЁё]+_[\wА-Яа-яЁё]+$/.test(v) && vals.indexOf(v) === -1) vals.push(v);
      }
    }
    if (vals.length) factions.push({ key: keyByTitle_(h.title), title: h.title, leader: vals[0] || '', names: vals.slice(1) });
  });
  return factions;
}

function normalizeTitle_(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  if (s.indexOf('прав') !== -1 || s.indexOf('пра-во') !== -1) return 'Правительство';
  if (s.indexOf('уфсб') !== -1) return 'УФСБ';
  if (s.indexOf('мвд') !== -1) return 'МВД';
  if (s === 'вч') return 'ВЧ';
  if (s === 'мз') return 'МЗ';
  if (s.indexOf('сми') !== -1) return 'СМИ';
  return '';
}
function keyByTitle_(t) { return ({'Правительство':'pra','УФСБ':'ufsb','МВД':'mvd','ВЧ':'vch','МЗ':'mz','СМИ':'smi'})[t] || 'pra'; }

function stateSheet_(sheetId) {
  const ss = SpreadsheetApp.openById(sheetId);
  let sh = ss.getSheetByName(STATE_SHEET_NAME);
  if (!sh) { sh = ss.insertSheet(STATE_SHEET_NAME); sh.hideSheet(); sh.getRange(1,1,1,2).setValues([['key','json']]); }
  return sh;
}
function readState_(sheetId) {
  const sh = stateSheet_(sheetId);
  const value = sh.getRange(2,2).getValue();
  if (!value) return { factions: [], donations: {}, updatedAt: Date.now() };
  try { return JSON.parse(value); } catch (err) { return { factions: [], donations: {}, updatedAt: Date.now() }; }
}
function writeState_(sheetId, state) {
  const sh = stateSheet_(sheetId);
  sh.getRange(2,1,1,2).setValues([['state', JSON.stringify(state)]]);
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
