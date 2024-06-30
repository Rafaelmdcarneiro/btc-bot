var _ = require('lodash');
var config = require('../../core/util.js').getConfig();

var moment = require('moment');
var util = require('../../core/util.js');
var log = require(`${util.dirs().core}log`)

var handle = require('./handle');
var mongoUtil = require('./util');

var Store = function Store (done) {
  _.bindAll(this);
  this.done = done;
  this.db = handle;
  this.historyCollection = this.db.collection(mongoUtil.settings.historyCollection);
  this.adviceCollection = this.db.collection(mongoUtil.settings.adviceCollection);

  this.candleCache = [];

  this.pair = mongoUtil.settings.pair.join('_');

  this.price = 'N/A';
  this.marketTime = 'N/A';

  done();
}

Store.prototype.writeCandles = function writeCandles () {
  if (_.isEmpty(this.candleCache)) { // nothing to do
    return;
  }

  var candles = [];
  _.each(this.candleCache, candle => {
    var mCandle = {
      time: moment().unix(),
      start: candle.start.unix(),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      vwp: candle.vwp,
      volume: candle.volume,
      trades: candle.trades,
      pair: this.pair
    };
    candles.push(mCandle);
  });

  // Fix error when whole batch would failed to insert if one or more duplicate candle
  this.historyCollection.insert(candles, { ordered: false }, e => {
    if (e) {
      let msg = 'mongojs insert() ' + e.writeErrors.length + ' of ' + candles.length + ' failed.';
      _.forEach(_.countBy(e.writeErrors, 'code'), (c, k) => {
        msg += ' Code: E' + k + ' count: ' + c;
      });
      log.debug(msg);
    }
  });

  this.candleCache = [];
}

var processCandle = function processCandle (candle, done) {
  // because we might get a lot of candles
  // in the same tick, we rather batch them
  // up and insert them at once at next tick.
  this.price = candle.close; // used in adviceWriter
  this.marketTime = candle.start;

  this.candleCache.push(candle);
  if (this.candleCache.length >= 100)
    this.writeCandles();
  done();
}

var finalize = function(done) {
  this.writeCandles();
  // Fix connection closed before all candles was written to db
  setTimeout( () => {
    this.db = null;
    done();
  }, 1000);
}

var processAdvice = function processAdvice (advice) {
  if (config.candleWriter.muteSoft && advice.recommendation === 'soft') {
    return;
  }

  log.debug(`Writing advice '${advice.recommendation}' to database.`);
  var mAdvice = {
    time: moment().unix(),
    marketTime: this.marketTime,
    pair: this.pair,
    recommendation: advice.recommendation,
    price: this.price,
    portfolio: advice.portfolio
  };

  this.adviceCollection.insert(mAdvice);
}

if (config.adviceWriter.enabled) {
  log.debug('Enabling adviceWriter.');
  Store.prototype.processAdvice = processAdvice;
}

if (config.candleWriter.enabled) {
  log.debug('Enabling candleWriter.');
  Store.prototype.processCandle = processCandle;
  Store.prototype.finalize = finalize;
}

module.exports = Store;
