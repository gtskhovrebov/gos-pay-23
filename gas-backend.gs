const SPREADSHEET_ID = '1LSlUC-t6_7x8vfg5mQebIwRHfDH8h0bB1Xzxq7wpv_U';
const CURATORS_SHEET_NAME = 'Кураторы ГОС';
const STATE_SHEET_NAME = '_GOS_PAY_STATE';

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || 'get');
  const sheetId = String((e && e.parameter && e.parameter.sheetId) || SPREADSHEET_ID);
  const access = checkEditorAccess_(sheetId);
  if (!access.allowed) return json_({ allowed: false, email: access.email || '', reason: access.reason });
  const factions = readCurators_(sheetId);
  if (action === 'access') return json_({ allowed: true, email: access.email });
  if (action === 'curators') return json_({ allowed: true, email: access.email, factions });
  const state = readState_(sheetId);
  state.factions = factions;
  return json_({ allowed: true, email: access.email, state, factions });
}

function doPost(e) {
  const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  const sheetId = String(payload.sheetId || SPREADSHEET_ID);
  const access = checkEditorAccess_(sheetId);
  if (!access.allowed) return json_({ allowed: false, reason: access.reason });
  if (payload.action === 'reset') {
    const state = readState_(sheetId);
    state.donations = {};
    state.updatedAt = new Date().toISOString();
    writeState_(sheetId, state);
    return json_({ ok: true, updatedAt: state.updatedAt });
  }
  if (payload.state) {
    const state = payload.state;
    state.factions = readCurators_(sheetId);
    state.updatedAt = new Date().toISOString();
    writeState_(sheetId, state);
    return json_({ ok: true, updatedAt: state.updatedAt });
  }
  return json_({ ok: false });
}

function checkEditorAccess_(sheetId) {
  const email = Session.getActiveUser().getEmail();
  if (!email) return { allowed: false, email: '', reason: 'NO_GOOGLE_EMAIL' };
  const file = DriveApp.getFileById(sheetId);
  const owner = file.getOwner().getEmail();
  const editors = file.getEditors().map(u => u.getEmail());
  return { allowed: email === owner || editors.includes(email), email };
}

function readCurators_(sheetId) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(CURATORS_SHEET_NAME);
  if (!sheet) throw new Error('Лист "' + CURATORS_SHEET_NAME + '" не найден');
  const range = sheet.getDataRange();
  return parseCurators_(range.getDisplayValues(), range.getFontColors());
}

function parseCurators_(values, fontColors) {
  const headers = [];
  const aliases = [
    { title: 'Правительство', key: 'pra', aliases: ['пра-во', 'правительство'] },
    { title: 'УФСБ', key: 'ufsb', aliases: ['уфсб', 'фсб'] },
    { title: 'МВД', key: 'mvd', aliases: ['мвд'] },
    { title: 'ВЧ', key: 'vch', aliases: ['вч'] },
    { title: 'МЗ', key: 'mz', aliases: ['мз'] },
    { title: 'СМИ', key: 'smi', aliases: ['сми'] }
  ];
  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      const cell = clean_(values[r][c]).toLowerCase();
      if (!cell) continue;
      const found = aliases.find(f => f.aliases.some(a => cell === a || cell.includes(a)));
      if (found) headers.push({ row: r, col: c, title: found.title, key: found.key });
    }
  }
  headers.sort((a, b) => a.row - b.row || a.col - b.col);
  const factions = [];
  headers.forEach(header => {
    const sameRowNext = headers.filter(h => h.row === header.row && h.col > header.col).sort((a,b)=>a.col-b.col)[0];
    const belowNext = headers.filter(h => h.row > header.row).sort((a,b)=>a.row-b.row)[0];
    const endCol = sameRowNext ? sameRowNext.col - 1 : header.col + 2;
    const endRow = belowNext ? belowNext.row - 1 : values.length - 1;
    const faction = { key: header.key, title: header.title, leader: '', names: [] };
    for (let r = header.row + 1; r <= endRow; r++) {
      for (let c = header.col; c <= Math.min(endCol, values[r].length - 1); c++) {
        const nick = clean_(values[r][c]);
        if (!isNickname_(nick)) continue;
        const color = String(fontColors[r][c] || '').toLowerCase();
        if (isSeniorFontColor_(color)) faction.leader = nick;
        else if (!faction.names.includes(nick)) faction.names.push(nick);
      }
    }
    if (faction.leader || faction.names.length) factions.push(faction);
  });
  return factions;
}

function isSeniorFontColor_(color) {
  return ['#ff0000','#cc0000','#c00000','#990000','#a61c00','#e06666'].includes(String(color || '').toLowerCase());
}
function isNickname_(text) { return /^[A-Za-zА-Яа-яЁё0-9]+_[A-Za-zА-Яа-яЁё0-9]+$/.test(clean_(text)); }
function readState_(sheetId) {
  const ss = SpreadsheetApp.openById(sheetId);
  let sheet = ss.getSheetByName(STATE_SHEET_NAME);
  if (!sheet) { sheet = ss.insertSheet(STATE_SHEET_NAME); sheet.hideSheet(); const initialState = { factions: [], donations: {}, updatedAt: new Date().toISOString() }; sheet.getRange(1,1).setValue(JSON.stringify(initialState)); return initialState; }
  const raw = String(sheet.getRange(1,1).getValue() || '').trim();
  if (!raw) return { factions: [], donations: {}, updatedAt: new Date().toISOString() };
  try { return JSON.parse(raw); } catch { return { factions: [], donations: {}, updatedAt: new Date().toISOString() }; }
}
function writeState_(sheetId, state) {
  const ss = SpreadsheetApp.openById(sheetId);
  let sheet = ss.getSheetByName(STATE_SHEET_NAME);
  if (!sheet) { sheet = ss.insertSheet(STATE_SHEET_NAME); sheet.hideSheet(); }
  sheet.getRange(1,1).setValue(JSON.stringify(state));
}
function clean_(value) { return String(value || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(); }
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
