/**
 * Webアプリ版 Config エディタ
 * - 現在の設定をロードして表示
 * - 編集後に保存
 */

const CONFIG_FILE_ID = '1goWDWtwWIdZ0DJLJ6SvksitcCzYGcKHI';

/**
 * Webアプリを開く
 */
function doGet() {
	return HtmlService.createHtmlOutputFromFile('index.html')
		.setTitle('Slack Reminder 設定エディタ');
}

/**
 * 現在の設定を読み込む（Web UIから呼ばれる）
 */
function loadConfig() {
	const file = DriveApp.getFileById(CONFIG_FILE_ID);
	const config = JSON.parse(file.getBlob().getDataAsString());

	// Webで使いやすい最小データを返す
	const target = config.targets[0];
	const filters = target.filters.and[1].or;
	return {
		timezone: config.timezone,
		sheet_name: target.sheet_name,
		progress: filters[0].value,
		confidential: filters[1].value,
		diffDays: target.filters.and[0].value,
	};
}

/**
 * 設定を保存（Web UIから呼ばれる）
 */
function saveConfig(data) {
	const file = DriveApp.getFileById(CONFIG_FILE_ID);
	const config = JSON.parse(file.getBlob().getDataAsString());

	// 更新
	const target = config.targets[0];
	target.filters.and[0].value = data.diffDays.map(Number); // 数値配列
	target.filters.and[1].or[0].value = data.progress;
	target.filters.and[1].or[1].value = data.confidential;

	file.setContent(JSON.stringify(config, null, 2));

	return '設定を保存しました。';
}

function getConfig() {
	const config = Config.load();
	const target = config.targets[0];
	const sheet = SpreadsheetApp.openById(target.sheet_id).getSheetByName(target.sheet_name);
	const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
	return { config, headers };
}

function saveFullConfig(newConfig) {
	Config.save(newConfig);
}

function saveComments(newComments) {
	const config = Config.load();
	config.targets[0].comments = newComments;
	Config.save(config);
}

function runSlackReminder_BotToken() {
	const config = Config.load();
	const token = PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN');
	if (!token) throw new Error('SLACK_BOT_TOKEN が登録されていません。');

	const debug = PropertiesService.getScriptProperties().getProperty('DEBUG_MODE') === 'true';
	const tz = config.timezone || 'Asia/Tokyo';
	const now = new Date(new Date().toLocaleString('ja-JP', { timeZone: tz }));
	const logLines = [];

	for (const target of config.targets) {
		if (!target.enable) continue;

		const sheet = SpreadsheetApp.openById(target.sheet_id).getSheetByName(target.sheet_name);
		const data = sheet.getDataRange().getValues();
		const headers = data[0];
		const rows = data.slice(1);

		const idx = {};
		Object.keys(target.columns).forEach(k => idx[k] = headers.indexOf(target.columns[k]));

		for (const row of rows) {
			const dueVal = row[idx.due];
			if (!dueVal) continue; // 空行スキップ

			const diffDays = Math.ceil((new Date(dueVal) - now) / (1000*3600*24));

			const record = Utils.rowToRecord(headers, row);
			record.diffDays = diffDays;

			const hit = !target.filters || Utils.evaluateFilter(target.filters, record);
			if (!hit) continue;

			// デバッグ表示
			if (debug) {
				Logger.log(
					`案件: ${record[headers[idx.task]] || ''}, ` +
					`担当者: ${record[headers[idx.assignee_name]] || ''}, ` +
					`diffDays: ${diffDays}, ` +
					`進捗状況: ${record['進捗状況'] || ''}, ` +
					`情報区分: ${record['情報区分'] || ''}, ` +
					`フィルタヒット: ${hit}`
				);
			}

			const name = row[idx.assignee_name];
			const task = row[idx.task];
			const assigneeEmail = row[idx.assignee_email];
			const bossEmail = row[idx.boss_email];

			const commentTemplate = target.comments[String(diffDays)];
			if (!commentTemplate) continue;

			const comment = commentTemplate.replace(/\$name/g, name).replace(/\$task/g, task);
			const assigneeId = Utils.getSlackIdByEmail(token, assigneeEmail);
			const bossId = target.boss_cc ? Utils.getSlackIdByEmail(token, bossEmail) : null;
			if (!assigneeId) continue;

			const mentionText = bossId
				? `<@${assigneeId}> cc: <@${bossId}>\n${comment}`
				: `<@${assigneeId}>\n${comment}`;

			Utils.sendSlackMessage(token, target.channel, mentionText);

			const ccText = bossId ? ` (cc: ${row[idx.boss_name]})` : '';
			logLines.push(
				`[${Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss')}]\n` +
				`| ${target.sheet_name} | ${name}${ccText} | ${task} | sent`
			);
		}
	}

	// ログ出力
	const folder = DriveApp.getFolderById(config.log_folder_id);
	const files = folder.getFilesByName('log.txt');
	let logFile;
	if (files.hasNext()) {
		logFile = files.next();
		logFile.setContent(logFile.getBlob().getDataAsString() + '\n' + logLines.join('\n'));
	} else {
		logFile = folder.createFile('log.txt', logLines.join('\n'));
	}

	Logger.log(`✅ Slack reminders sent. ${logLines.length} entries.`);
}

