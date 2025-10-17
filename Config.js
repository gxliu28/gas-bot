/**
 * Config.gs
 * - 設定ファイル(config.json)のロードを担当
 */
var Config = (function () {
	const CONFIG_FILE_ID = '1goWDWtwWIdZ0DJLJ6SvksitcCzYGcKHI'; // Drive上のconfig.json ID

	function load() {
		try {
			const file = DriveApp.getFileById(CONFIG_FILE_ID);
			const json = file.getBlob().getDataAsString();
			return JSON.parse(json);
		} catch (e) {
			Logger.log(`❌ config.json 読み込みエラー: ${e.message}`);
			throw e;
		}
	}

	return { load };
})();

