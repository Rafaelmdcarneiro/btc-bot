var moment = require('moment');
var _ = require('lodash');
var path = require('path');
var fs = require('fs');
var semver = require('semver');
var program = require('commander');

var startTime = moment();

var _config = false;
var _package = false;
var _nodeVersion = false;
var _gekkoMode = false;
var _gekkoEnv = false;

var _args = false;

// helper functions
var util = {
  getConfig: function() {
    // cache
    if(_config)
      return _config;

    if(!program.config)
        util.die('Please specify a config file.', true);

    if(!fs.existsSync(util.dirs().gekko + program.config))
      util.die('Cannot find the specified config file.', true);

    _config = require(util.dirs().gekko + program.config);
    return _config;
  },
  // overwrite the whole config
  setConfig: function(config) {
    _config = config;
  },
  setConfigProperty: function(parent, key, value) {
    if(parent)
      _config[parent][key] = value;
    else
      _config[key] = value;
  },
  getVersion: function() {
    return util.getPackage().version;
  },
  getPackage: function() {
    if(_package)
      return _package;


    _package = JSON.parse( fs.readFileSync(__dirname + '/../package.json', 'utf8') );
    return _package;
  },
  getRequiredNodeVersion: function() {
    return util.getPackage().engines.node;
  },
  recentNode: function() {
    var required = util.getRequiredNodeVersion();
    return semver.satisfies(process.version, required);
  },
  // check if two moments are corresponding
  // to the same time
  equals: function(a, b) {
    return !(a < b || a > b)
  },
  minToMs: function(min) {
    return min * 60 * 1000;
  },
  defer: function(fn) {
    return function(args) {
      var args = _.toArray(arguments);
      return _.defer(function() { fn.apply(this, args) });
    }
  },
  logVersion: function() {
    return  `Gekko version: v${util.getVersion()}`
    + `\nNodejs version: ${process.version}`;
  },
  die: function(m, soft) {

    if(_gekkoEnv === 'child-process') {
      return process.send({type: 'error', error: '\n ERROR: ' + m + '\n'});
    }

    var log = console.log.bind(console);

    if(m) {
      if(soft) {
        log('\n ERROR: ' + m + '\n\n');
      } else {
        log(`\nGekko encountered an error and can\'t continue`);
        log('\nError:\n');
        log(m, '\n\n');
        log('\nMeta debug info:\n');
        log(util.logVersion());
        log('');
      }
    }
    process.exit(1);
  },
  dirs: function() {
    var ROOT = __dirname + '/../';

    return {
      gekko: ROOT,
      core: ROOT + 'core/',
      markets: ROOT + 'core/markets/',
      exchanges: ROOT + 'exchange/wrappers/',
      plugins: ROOT + 'plugins/',
      methods: ROOT + 'strategies/',
      indicators: ROOT + 'strategies/indicators/',
      budfox: ROOT + 'core/budfox/',
      importers: ROOT + 'importers/exchanges/',
      tools: ROOT + 'core/tools/',
      workers: ROOT + 'core/workers/',
      web: ROOT + 'web/',
      config: ROOT + 'config/',
      broker: ROOT + 'exchange/'
    }
  },
  inherit: function(dest, source) {
    require('util').inherits(
      dest,
      source
    );
  },
  makeEventEmitter: function(dest) {
    util.inherit(dest, require('events').EventEmitter);
  },
  setGekkoMode: function(mode) {
    _gekkoMode = mode;
  },
  gekkoMode: function() {
    if(_gekkoMode)
      return _gekkoMode;

    if(program['import'])
      return 'importer';
    else if(program.backtest)
      return 'backtest';
    else
      return 'realtime';
  },
  gekkoModes: function() {
    return [
      'importer',
      'backtest',
      'realtime'
    ]
  },
  setGekkoEnv: function(env) {
    _gekkoEnv = env;
  },
  gekkoEnv: function() {
    return _gekkoEnv || 'standalone';
  },
  launchUI: function() {
    if(program['ui'])
      return true;
    else
      return false;
  },
  getStartTime: function() {
    return startTime;
  },
}

// NOTE: those options are only used
// in stand alone mode
program
  .version(util.logVersion())
  .option('-c, --config <file>', 'Config file')
  .option('-b, --backtest', 'backtesting mode')
  .option('-i, --import', 'importer mode')
  .option('--ui', 'launch a web UI')
  .parse(process.argv);

// make sure the current node version is recent enough
if(!util.recentNode())
  util.die([
    'Your local version of Node.js is too old. ',
    'You have ',
    process.version,
    ' and you need atleast ',
    util.getRequiredNodeVersion()
  ].join(''), true);

module.exports = util;
