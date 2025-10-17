/**
 * Config.gs
 * - 設定ファイル(config.json)のロードを担当
 */
const Config = {
	load() {
		const file = DriveApp.getFileById(CONFIG_FILE_ID);
		return JSON.parse(file.getBlob().getDataAsString());
	},
	save(config) {
		const file = DriveApp.getFileById(CONFIG_FILE_ID);
		file.setContent(JSON.stringify(config, null, 2));
	}
};
