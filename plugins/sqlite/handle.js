var _ = require('lodash');
var fs = require('fs');

var util = require('../../core/util.js');
var config = util.getConfig();
var dirs = util.dirs();

var adapter = config.sqlite;

// verify the correct dependencies are installed
var pluginHelper = require(dirs.core + 'pluginUtil');
var pluginMock = {
  slug: 'sqlite adapter',
  dependencies: adapter.dependencies,
};

var cannotLoad = pluginHelper.cannotLoad(pluginMock);
if (cannotLoad) util.die(cannotLoad);

// should be good now
if (config.debug) var sqlite3 = require('sqlite3').verbose();
else var sqlite3 = require('sqlite3');

var plugins = require(util.dirs().gekko + 'plugins');

var version = adapter.version;

var dbName = config.watch.exchange.toLowerCase() + '_' + version + '.db';
var dir = dirs.gekko + adapter.dataDirectory;

var fullPath = [dir, dbName].join('/');

var mode = util.gekkoMode();
if (mode === 'realtime' || mode === 'importer') {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
} else if (mode === 'backtest') {
  if (!fs.existsSync(dir)) util.die('History directory does not exist.');

  if (!fs.existsSync(fullPath))
    util.die(
      `History database does not exist for exchange ${
        config.watch.exchange
      } at version ${version}.`
    );
}

module.exports = {
  initDB: () => {
    var journalMode = config.sqlite.journalMode || 'PERSIST';
    var syncMode = journalMode === 'WAL' ? 'NORMAL' : 'FULL';
  
    var db = new sqlite3.Database(fullPath);
    db.run('PRAGMA synchronous = ' + syncMode);
    db.run('PRAGMA journal_mode = ' + journalMode);
    db.configure('busyTimeout', 10000);
    return db;
  }
};
