/**
 * Personal OS 私人首頁提醒 → LINE 到期通知
 * 這份程式必須貼到「首頁提醒」Google 試算表的 擴充功能 > Apps Script。
 * 只讀取私人 reminders 分頁，不使用公開 GitHub 存放提醒或 LINE Token。
 *
 * 一次性設定（Apps Script > 專案設定 > 指令碼屬性）：
 *   LINE_CHANNEL_ACCESS_TOKEN = LINE Messaging API access token
 *   LINE_TO_USER_ID           = 以 U 開頭的 Your user ID
 * 接著執行 sendLineReminderTest()、installLineReminderTrigger() 並完成 Google 授權。
 */

const REMINDER_TZ = 'Asia/Taipei';
const REMINDER_HEADERS = [
  'id', 'title', 'date', 'phone', 'done', 'url', 'source', 'order_id',
  'message_id', 'received_at', 'updated_at', 'deleted'
];
const REMINDER_STAGES_DEFAULT = [7, 3, 1, 0];
const REMINDER_STAGES_VEHICLE = [30, 7, 1, 0];
const LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';

function reminderProps_() {
  return PropertiesService.getScriptProperties();
}

function reminderLineCredentials_() {
  const props = reminderProps_();
  const token = String(props.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '').trim();
  const userId = String(props.getProperty('LINE_TO_USER_ID') || '').trim();
  if (!token || !/^U[0-9a-fA-F]{32}$/.test(userId)) {
    throw new Error('請先在 Apps Script「專案設定 → 指令碼屬性」填入 LINE_CHANNEL_ACCESS_TOKEN 及 LINE_TO_USER_ID。');
  }
  return {token: token, userId: userId};
}

function reminderSpreadsheet_() {
  const props = reminderProps_();
  const id = props.getProperty('REMINDERS_SPREADSHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('請從私人「首頁提醒」試算表的「擴充功能 → Apps Script」建立繫結指令碼。');
  const sheet = ss.getSheetByName('reminders');
  if (!sheet) throw new Error('找不到 reminders 工作表；已停止發送。');
  const headers = sheet.getRange(1, 1, 1, 12).getDisplayValues()[0];
  if (REMINDER_HEADERS.some((value, index) => String(headers[index] || '').trim() !== value)) {
    throw new Error('reminders A:L 欄位名稱／順序不符；已停止發送，以免誤發。');
  }
  return {ss: ss, sheet: sheet};
}

function reminderDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, REMINDER_TZ, 'yyyy-MM-dd');
  }
  const raw = String(value == null ? '' : value).trim().replace(/[./]/g, '-');
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (!match) return '';
  const y = +match[1], m = +match[2], d = +match[3];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(date.getTime())) return '';
  const iso = date.toISOString().slice(0, 10);
  return iso === [match[1], String(m).padStart(2, '0'), String(d).padStart(2, '0')].join('-') ? iso : '';
}

function reminderTrue_(value) {
  return value === true || String(value || '').trim().toUpperCase() === 'TRUE';
}

function reminderDaysUntil_(today, due) {
  return Math.round((Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
}

function reminderStageKey_(id, due, days) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    id + '|' + due + '|' + days,
    Utilities.Charset.UTF_8
  );
  return 'LINE_SENT_' + bytes.slice(0, 14).map(function(b) {
    return ('0' + (b & 255).toString(16)).slice(-2);
  }).join('');
}

function reminderCandidates_(rows, today, props) {
  const notices = [];
  rows.forEach(function(cells) {
    const id = String(cells[0] || '').trim();
    const title = String(cells[1] || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const due = reminderDate_(cells[2]);
    if (!id || !title || !due || reminderTrue_(cells[4]) || reminderTrue_(cells[11])) return;

    const days = reminderDaysUntil_(today, due);
    const vehicle = /機車|排氣|定檢|汽車檢驗/.test(title);
    const offsets = vehicle ? REMINDER_STAGES_VEHICLE : REMINDER_STAGES_DEFAULT;
    if (offsets.indexOf(days) === -1) return;

    const key = reminderStageKey_(id, due, days);
    if (props.getProperty(key)) return;
    notices.push({key: key, title: title, due: due, days: days});
  });
  return notices;
}

function sendReminderLine_(message) {
  const credentials = reminderLineCredentials_();
  const payload = JSON.stringify({
    to: credentials.userId,
    messages: [{type: 'text', text: message}]
  });
  const result = UrlFetchApp.fetch(LINE_PUSH_ENDPOINT, {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: {Authorization: 'Bearer ' + credentials.token},
    payload: payload,
    muteHttpExceptions: true
  });
  const status = result.getResponseCode();
  if (status !== 200) {
    // 不印出 token、User ID 或含隱私的 HTTP 回應內容。
    throw new Error('LINE Messaging API 發送失敗（HTTP ' + status + '）；請確認授權、好友狀態及訊息額度。');
  }
  return true;
}

function reminderLineText_(today, entries) {
  const parts = ['🔔 Personal OS｜期限提醒（' + today + '）'];
  entries.forEach(function(item) {
    const suffix = item.days === 0 ? '今天到期' : '還有 ' + item.days + ' 天到期';
    parts.push('• ' + item.title + '\n期限：' + item.due + '\n' + suffix);
  });
  parts.push('完成後請在首頁或私人提醒試算表標記完成。');
  return parts.join('\n\n');
}

/**
 * 每日觸發：只處理私人提醒表 A:L。
 * 每批呼叫 LINE 成功後，才記錄本階段已發送；無到期事項時完全不推播。
 */
function checkLineReminders() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('已有另一個 LINE 提醒檢查正在執行。');
  try {
    const props = reminderProps_();
    const info = reminderSpreadsheet_();
    const last = info.sheet.getLastRow();
    if (last < 2) {
      console.log('提醒表沒有內容，沒有發 LINE。');
      return 0;
    }
    const rows = info.sheet.getRange(2, 1, last - 1, 12).getValues();
    const today = Utilities.formatDate(new Date(), REMINDER_TZ, 'yyyy-MM-dd');
    const pending = reminderCandidates_(rows, today, props);
    if (!pending.length) {
      console.log('今天沒有新的符合條件提醒，沒有發 LINE。');
      return 0;
    }

    // 避免一則訊息太長；同一天多筆提醒先合併，減少 LINE 訊息額度消耗。
    const batches = [];
    let current = [];
    pending.forEach(function(item) {
      const candidate = current.concat([item]);
      if (current.length && reminderLineText_(today, candidate).length > 3800) {
        batches.push(current);
        current = [item];
      } else {
        current = candidate;
      }
    });
    if (current.length) batches.push(current);

    let sent = 0;
    batches.forEach(function(batch) {
      const text = reminderLineText_(today, batch);
      if (text.length > 4500) throw new Error('單則提醒太長；已停止發送，請縮短提醒標題。');
      sendReminderLine_(text);
      const updates = {};
      batch.forEach(function(item) { updates[item.key] = new Date().toISOString(); });
      props.setProperties(updates, false);
      sent += batch.length;
    });
    console.log('LINE 已接受 ' + sent + ' 筆提醒的推播要求。');
    return sent;
  } finally {
    lock.releaseLock();
  }
}

/** 第一次手動執行：驗證 LINE 是否收到測試訊息，不會標記任何正式提醒。 */
function sendLineReminderTest() {
  reminderSpreadsheet_(); // 須在正確的私人提醒表執行
  sendReminderLine_('✅ Personal OS｜私人提醒 LINE 測試成功\n這是一則測試訊息，不會更改正式提醒或已通知紀錄。');
  console.log('LINE 測試 API 已接受推播要求；請查看手機 LINE 是否送達。');
}

/**
 * 第一次手動執行：建立每日台灣時間約 08:30 的定時觸發器。
 * 重複執行會刪除本程式自己原有的同名排程再建立，避免重複。
 */
function installLineReminderTrigger() {
  reminderLineCredentials_();
  const info = reminderSpreadsheet_();
  reminderProps_().setProperty('REMINDERS_SPREADSHEET_ID', info.ss.getId());
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'checkLineReminders') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('checkLineReminders')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .nearMinute(30)
    .inTimezone(REMINDER_TZ)
    .create();
  console.log('LINE 到期提醒排程已建立：每日台灣時間約 08:30（Google 排程可能略有偏差）。');
}

/** 僅停用排程，不會清除私人資料、Token 或已發通知紀錄。 */
function stopLineReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'checkLineReminders') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  console.log('已停止本指令碼的每日 LINE 提醒排程。');
}
