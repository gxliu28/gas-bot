var Config = (function() {

  return {
    loadConfig: function(fileId) {
      const file = DriveApp.getFileById(fileId);
      return JSON.parse(file.getBlob().getDataAsString());
    },

    saveLog: function(folderId, logLines) {
      if (!logLines || logLines.length === 0) return;

      const folder = DriveApp.getFolderById(folderId);
      const files = folder.getFilesByName('log.txt');
      let logFile;
      if (files.hasNext()) {
        logFile = files.next();
        const existing = logFile.getBlob().getDataAsString();
        logFile.setContent(existing + '\n' + logLines.join('\n'));
      } else {
        logFile = folder.createFile('log.txt', logLines.join('\n'));
      }
    }

  };
})();
