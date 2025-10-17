/**
 * Code.gs
 * - Slack Bot Token 版 自動リマインダー（複雑フィルタ対応版）
 */
function runSlackReminder_Debug() {
	const config = Config.load();
	const token = PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN');
	if (!token) throw new Error('SLACK_BOT_TOKEN が登録されていません。');

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

			// デバッグ表示
			Logger.log(
				`案件: ${record[headers[idx.task]] || ''}, ` +
				`担当者: ${record[headers[idx.assignee_name]] || ''}, ` +
				`diffDays: ${diffDays}, ` +
				`進捗状況: ${record['進捗状況'] || ''}, ` +
				`情報区分: ${record['情報区分'] || ''}, ` +
				`フィルタヒット: ${hit}`
			);

			if (!hit) continue;

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

