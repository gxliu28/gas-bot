/**
 * Utils.gs
 * - Slack Bot Token 版用ユーティリティ
 * - メール→Slack ID 変換
 * - Slack送信
 * - 行データを record に変換
 * - 複雑条件（AND/OR/NOT）評価
 * - processTarget: 1ターゲット分の処理とログ生成
 */

var Utils = (function () {

  /**
   * Slack API経由でメッセージ送信
   * @param {string} token Bot Token
   * @param {string} channel SlackチャンネルIDまたは名前
   * @param {string} text 送信するメッセージ本文
   */
  function sendSlackMessage(token, channel, text) {
    try {
      const url = 'https://slack.com/api/chat.postMessage';
      const payload = { channel, text };
      const res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify(payload)
      });
      const json = JSON.parse(res.getContentText());
      if (!json.ok) {
        Logger.log(`❌ Slack送信エラー: ${json.error}`);
      }
    } catch (e) {
      Logger.log(`❌ Slack送信例外: ${e.message}`);
    }
  }

  /**
   * メールアドレスからSlackユーザーIDを取得
   * @param {string} token Bot Token
   * @param {string} email メールアドレス
   * @returns {string|null} SlackユーザーID
   */
  function getSlackIdByEmail(token, email) {
    try {
      const url = `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`;
      const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      const json = JSON.parse(res.getContentText());
      if (!json.ok) {
        Logger.log(`❌ ユーザー検索失敗: ${email} (${json.error})`);
        return null;
      }
      return json.user.id;
    } catch (e) {
      Logger.log(`❌ Slack ID 取得例外: ${e.message}`);
      return null;
    }
  }

  /**
   * 行データを {列名: 値} 形式の record に変換
   * @param {Array} headers ヘッダー配列
   * @param {Array} row 行データ配列
   * @returns {Object} record
   */
  function rowToRecord(headers, row) {
    const record = {};
    headers.forEach((h, i) => record[h] = row[i]);
    return record;
  }

  /**
   * 複雑条件（AND/OR/NOT）を評価
   * @param {Object} filter JSONで定義された条件
   * @param {Object} record {列名: 値} のレコード
   * @returns {boolean} 条件を満たすか
   */
  function evaluateFilter(filter, record) {
    if (!filter) return true;

    if (filter.and) {
      return filter.and.every(f => evaluateFilter(f, record));
    }

    if (filter.or) {
      return filter.or.some(f => evaluateFilter(f, record));
    }

    if (filter.not) {
      return !evaluateFilter(filter.not, record);
    }

    // 単純条件
    const value = record[filter.column];
    switch (filter.op) {
      case '==': return value == filter.value;
      case '!=': return value != filter.value;
      case '<': return value < filter.value;
      case '<=': return value <= filter.value;
      case '>': return value > filter.value;
      case '>=': return value >= filter.value;
      case 'includes': return Array.isArray(value) ? value.includes(filter.value) : String(value).includes(filter.value);
      default: return false;
    }
  }

  /**
   * 1つの target を処理し、Slack送信とログ生成
   * @param {Object} target config.json の target オブジェクト
   * @param {string} token Slack Bot Token
   * @param {Date} now 実行日時
   * @param {string} tz タイムゾーン
   * @returns {Array} logLines
   */
  function processTarget(target, token, now, tz) {
    const sheet = SpreadsheetApp.openById(target.sheet_id).getSheetByName(target.sheet_name);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);

    const idx = {};
    Object.keys(target.columns).forEach(k => {
      idx[k] = headers.indexOf(target.columns[k]);
    });

    const logLines = [];

    const hitRows = rows
      .map(row => {
        const progress = row[idx.progress];
        const dueDate = new Date(row[idx.due]);
        const diffDays = Math.ceil((dueDate - now) / (1000 * 3600 * 24));
        return { row, progress, diffDays };
      })
      .filter(r =>
        r.progress === '対応中' &&
        target.daysFromNow.includes(r.diffDays) &&
        (!target.filters || evaluateFilter(target.filters, rowToRecord(headers, r.row)))
      );

    hitRows.forEach(r => {
      const { row, diffDays } = r;
      const name = row[idx.assignee_name];
      const task = row[idx.task];
      const assigneeEmail = row[idx.assignee_email];
      const bossEmail = row[idx.boss_email];

      const commentTemplate = target.comments[String(diffDays)];
      if (!commentTemplate) {
        Logger.log(`⚠️ テンプレート ${diffDays} が設定されていません。`);
        return;
      }

      const comment = commentTemplate
        .replace(/\$name/g, name)
        .replace(/\$task/g, task);

      const assigneeId = getSlackIdByEmail(token, assigneeEmail);
      const bossId = target.boss_cc ? getSlackIdByEmail(token, bossEmail) : null;

      if (!assigneeId) {
        Logger.log(`❌ Slack ID が取得できません: ${assigneeEmail}`);
        return;
      }

      const mentionText = bossId
        ? `<@${assigneeId}> cc: <@${bossId}>\n${comment}`
        : `<@${assigneeId}>\n${comment}`;

      sendSlackMessage(token, target.channel, mentionText);

      const ccText = bossId ? ` (cc: ${row[idx.boss_name]})` : '';
      const logEntry =
        `[${Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss')}]\n` +
        `| ${target.sheet_name} | ${name}${ccText} | ${task} | sent`;
      logLines.push(logEntry);
    });

    return logLines;
  }

  // 外部に公開
  return {
    sendSlackMessage,
    getSlackIdByEmail,
    rowToRecord,
    evaluateFilter,
    processTarget
  };
})();
