// internally we only use 1m
// candles, this can easily
// convert them to any desired
// size.

// Acts as ~fake~ stream: takes
// 1m candles as input and emits
// bigger candles.
// 
// input are transported candles.

var _ = require('lodash');
var util = require(__dirname + '/util');

var CandleBatcher = function(candleSize) {
  if(!_.isNumber(candleSize))
    throw new Error('candleSize is not a number');

  this.candleSize = candleSize;
  this.smallCandles = [];
  this.calculatedCandles = [];

  _.bindAll(this);
}

util.makeEventEmitter(CandleBatcher);

CandleBatcher.prototype.write = function(candles) {
  if(!_.isArray(candles)) {
    throw new Error('candles is not an array');
  }

  this.emitted = 0;

  _.each(candles, function(candle) {
    this.smallCandles.push(candle);
    this.check();
  }, this);

  return this.emitted;
}

CandleBatcher.prototype.check = function() {
  if(_.size(this.smallCandles) % this.candleSize !== 0)
    return;

  this.emitted++;
  this.calculatedCandles.push(this.calculate());
  this.smallCandles = [];
}

CandleBatcher.prototype.flush = function() {
  _.each(
    this.calculatedCandles,
    candle => this.emit('candle', candle)
  );

  this.calculatedCandles = [];
}

CandleBatcher.prototype.calculate = function() {
  // remove the id property of the small candle
  var { id, ...first } = this.smallCandles.shift();

  first.vwp = first.vwp * first.volume;

  var candle = _.reduce(
    this.smallCandles,
    function(candle, m) {
      candle.high = _.max([candle.high, m.high]);
      candle.low = _.min([candle.low, m.low]);
      candle.close = m.close;
      candle.volume += m.volume;
      candle.vwp += m.vwp * m.volume;
      candle.trades += m.trades;
      return candle;
    },
    first
  );

  if(candle.volume)
    // we have added up all prices (relative to volume)
    // now divide by volume to get the Volume Weighted Price
    candle.vwp /= candle.volume;
  else
    // empty candle
    candle.vwp = candle.open;

  candle.start = first.start;
  return candle;
}

module.exports = CandleBatcher;
