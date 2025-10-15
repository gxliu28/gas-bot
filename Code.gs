/**
 * Bot Token 版 SlackリマインドGAS（改良版）
 * - メールアドレス→Slack ID 変換可能
 * - 複数target設定対応
 * - commentに$name / $taskを差し込み可能
 * - daysFromNow に応じて comment_xx を自動選択
 * - メンション書式改善
 */

function runSlackReminder_BotToken() {
	const CONFIG_FILE_ID = '1goWDWtwWIdZ0DJLJ6SvksitcCzYGcKHI';
	const token = PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN');
	if (!token) throw new Error('SLACK_BOT_TOKEN が Script Properties に登録されていません。');

	const file = DriveApp.getFileById(CONFIG_FILE_ID);
	const config = JSON.parse(file.getBlob().getDataAsString());
	const tz = config.timezone || 'Asia/Tokyo';
	const now = new Date(new Date().toLocaleString('ja-JP', { timeZone: tz }));

	const logLines = [];

	config.targets.forEach(target => {
		if (!target.enable) return;

		const sheet = SpreadsheetApp.openById(target.sheet_id).getSheetByName(target.sheet_name);
		const data = sheet.getDataRange().getValues();
		const headers = data[0];
		const rows = data.slice(1);

		const idx = {};
		Object.keys(target.columns).forEach(k => {
				idx[k] = headers.indexOf(target.columns[k]);
				});

		const hitRows = rows
			.map(row => {
				const progress = row[idx.progress];
				const dueDate = new Date(row[idx.due]);
				const diffDays = Math.ceil((dueDate - now) / (1000 * 3600 * 24));
				return { row, progress, diffDays };
				})
			.filter(r => r.progress === '対応中' && target.daysFromNow.includes(r.diffDays));

		hitRows.forEach(r => {
			const { row, diffDays } = r;
			const name = row[idx.assignee_name];
			const task = row[idx.task];
			const assigneeEmail = row[idx.assignee_email];
			const bossEmail = row[idx.boss_email];

			// diffDays に対応するコメントテンプレートを config.json から取得
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

			// メンションの整形
			const mentionText = bossId
				? `<@${assigneeId}> cc: <@${bossId}>\n${comment}`
				: `<@${assigneeId}>\n${comment}`;

			sendSlackMessage(token, target.channel, mentionText);

			const ccText = bossId ? ` (cc: ${row[idx.boss_name]})` : '';
			const logEntry = `[${Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss')}] `
				+ `| ${target.sheet_name} | ${name}${ccText} | ${task} | sent`;
			logLines.push(logEntry);
		});
	});

	// ログを追記保存（既存 log.txt があれば追加、なければ新規作成）
	const folder = DriveApp.getFolderById(config.log_folder_id);
	const files = folder.getFilesByName('log.txt');
	let logFile;
	if (files.hasNext()) {
		logFile = files.next();
		const existing = logFile.getBlob().getDataAsString();
		logFile.setContent(existing + '\n' + logLines.join('\n'));
	} else {
		logFile = folder.createFile('log.txt', logLines.join('\n'));
	}

	Logger.log(`✅ Slack reminders sent. ${logLines.length} entries.`);
}

/**
 * Slack API経由でメッセージ送信
 */
function sendSlackMessage(token, channel, text) {
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
}

/**
 * メールアドレスからSlackユーザーIDを取得
 */
function getSlackIdByEmail(token, email) {
	const url = `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`;
	const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token } });
	const json = JSON.parse(res.getContentText());
	if (!json.ok) {
		Logger.log(`❌ ユーザー検索失敗: ${email} (${json.error})`);
		return null;
	}
	return json.user.id;
}

