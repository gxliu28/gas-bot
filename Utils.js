/**
 * Utils.gs
 * - Slack Bot Token 版ユーティリティ
 * - メール→Slack ID 変換
 * - Slack送信
 * - 行データを record に変換
 * - 複雑条件（AND/OR/NOT）評価
 */

var Utils = (function () {

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
			if (!json.ok) Logger.log(`❌ Slack送信エラー: ${json.error}`);
		} catch (e) {
			Logger.log(`❌ Slack送信例外: ${e.message}`);
		}
	}

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

	function rowToRecord(headers, row) {
		const record = {};
		headers.forEach((h, i) => record[h] = row[i]);
		return record;
	}

	function evaluateFilter(filter, record) {
		if (!filter) return true;

		if (filter.and) return filter.and.every(f => evaluateFilter(f, record));
		if (filter.or) return filter.or.some(f => evaluateFilter(f, record));
		if (filter.not) return !evaluateFilter(filter.not, record);

		const value = record[filter.column];

		switch (filter.op) {
			case '==': return value == filter.value;
			case '!=': return value != filter.value;
			case '<': return value < filter.value;
			case '<=': return value <= filter.value;
			case '>': return value > filter.value;
			case '>=': return value >= filter.value;
			case 'in':
				// filter.value が配列なら、trimをしてから文字列に変換してから比較
				if (!Array.isArray(filter.value)) return false;
				// デバッグ用ログ
				Logger.log(`列: ${filter.column}, セル値: '${value}', フィルタ配列: [${filter.value.join(", ")}]`);

				return filter.value.some(v => String(v).trim() === String(value).trim());
			case 'includes':
				return String(value).includes(filter.value);
			default: return false;
		}
	}

	return {
		sendSlackMessage,
		getSlackIdByEmail,
		rowToRecord,
		evaluateFilter
	};
})();

