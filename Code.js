/**
 * エントリーポイント
 * Slackリマインドを全targetsに対して実行
 */
function runSlackReminder_BotToken() {
	const CONFIG_FILE_ID = '1goWDWtwWIdZ0DJLJ6SvksitcCzYGcKHI'; // config.jsonのDriveファイルID
	const token = PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN');
	if (!token) throw new Error('SLACK_BOT_TOKEN が Script Properties に登録されていません。');

	const config = Config.loadConfig(CONFIG_FILE_ID);
	const tz = config.timezone || 'Asia/Tokyo';
	const now = new Date(new Date().toLocaleString('ja-JP', { timeZone: tz }));

	const logLines = [];

	config.targets.forEach(target => {
		if (!target.enable) return;

		const targetLogs = Utils.processTarget(target, token, now, tz);
		logLines.push(...targetLogs);
	});

	// ログ保存
	Config.saveLog(config.log_folder_id, logLines);

	Logger.log(`✅ Slack reminders sent. ${logLines.length} entries.`);
}
