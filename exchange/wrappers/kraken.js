const Kraken = require('kraken-api');
const moment = require('moment');
const _ = require('lodash');
const exchangeUtils = require('../exchangeUtils');
const retry = exchangeUtils.retry;
const scientificToDecimal = exchangeUtils.scientificToDecimal;

const marketData = require('./kraken-markets.json');

const Trader = function(config) {
  _.bindAll(this);

  if(_.isObject(config)) {
    this.key = config.key;
    this.secret = config.secret;
    this.currency = config.currency.toUpperCase()
    this.asset = config.asset.toUpperCase();
  }

  this.name = 'kraken';
  this.since = null;
  
  this.market = _.find(Trader.getCapabilities().markets, (market) => {
    return market.pair[0] === this.currency && market.pair[1] === this.asset
  });
  this.pair = this.market.book;

  this.interval = 3100;

  this.kraken = new Kraken(
    this.key,
    this.secret,
    {timeout: +moment.duration(60, 'seconds')}
  );
}

const recoverableErrors = [
  'SOCKETTIMEDOUT',
  'TIMEDOUT',
  'CONNRESET',
  'CONNREFUSED',
  'NOTFOUND',
  'Service:Unavailable',
  'Request timed out',
  'Empty response',
  'API:Invalid nonce',
  'General:Temporary lockout',
  'Response code 525',
  'Service:Busy'
];

// errors that might mean
// the API call succeeded.
const unknownResultErrors = [
  'Response code 502',
  'Response code 504',
  'Response code 522',
  'Response code 520',
]

const includes = (str, list) => {
  if(!_.isString(str))
    return false;

  return _.some(list, item => str.includes(item));
}

Trader.prototype.handleResponse = function(funcName, callback, nonMutating, payload) {
  return (error, body) => {

    if(!error && !body) {
      error = new Error('Empty response');
    }

    if(error) {
      if(includes(error.message, recoverableErrors)) {
        error.notFatal = true;
      }

      if(includes(error.message, ['Rate limit exceeded'])) {
        error.notFatal = true;
        error.backoffDelay = 2500;
      }

      if(nonMutating && includes(error.message, unknownResultErrors)) {
        // this call only tried to retrieve data, safe to redo
        error.notFatal = true;
      }

      if(funcName === 'addOrder' && includes(error.message, unknownResultErrors)) {

        const { tradeType, amount, price } = payload;

        return setTimeout(() => {
          this.getRawOpenOrders((err2, orders) => {
            if(err2) {
              console.log('err2', err2);
              return callback(err2);
            }

            _.each(orders, (o, id) => {
              o.id = id;
            });

            const order = _.find(orders, o => {
              if(o.descr.type !== tradeType) {
                return false;
              }

              const ts = moment.unix((o.opentm + '').split('.')[0])
              if(moment().diff(ts, 'm') > 10) {
                return false;
              }

              // string vs float
              if(+o.descr.price != price) {
                return false;
              }

              // string vs float
              if(o.vol != amount) {
                return false;
              }

              return true;
            });

            if(!order) {
              console.log('broken add order, appears not created:', {payload, orders: JSON.stringify(orders)});
              return this.addOrder(tradeType, amount, price, callback);
            }

            return callback(undefined, { catched: true, id: order.id });
          });
        }, 5000);
      }

      if(funcName === 'cancelOrder' && includes(error.message, unknownResultErrors)) {
        console.log('broken cancel');

        return setTimeout(() => {
          const handle = (err2, data) => {
            if(err2) {
              console.log('err2', err2);
              return callback(err2);
            }

            const order = _.get(data, `result["${payload}"]`);

            if(!_.isObject(order)) {
              console.log('refetched broken cancel, cannot find order...', data);
              throw 'a';
            }

            console.log(order);

            if(order.status !== 'canceled') {
              console.log(new Date, 'it still exists, retrying cancel');
              return this.cancelOrder(payload, callback);
            }

            console.log(new Date, 'it was canceled');
            return callback(undefined, true, { catched: true, filled: parseFloat(order.vol_exec) });

          };

          const reqData = {txid: payload};

          const fetch = cb => this.kraken.api('QueryOrders', reqData, this.handleResponse('checkOrder', cb, true));
          retry(null, fetch, handle);
        }, 5000);
      }

      return callback(error);
    }

    return callback(undefined, body);
  }
};

Trader.prototype.getTrades = function(since, callback, descending) {
  const startTs = since ? moment(since).valueOf() : null;

  const handle = (err, trades) => {
    if (err) return callback(err);

    var parsedTrades = [];
    _.each(trades.result[this.pair], function(trade) {
      // Even when you supply 'since' you can still get more trades than you asked for, it needs to be filtered
      if (_.isNull(startTs) || startTs < moment.unix(trade[2]).valueOf()) {
        parsedTrades.push({
          tid: moment.unix(trade[2]).valueOf() * 1000000,
          date: parseInt(Math.round(trade[2]), 10),
          price: parseFloat(trade[0]),
          amount: parseFloat(trade[1])
        });
      }
    }, this);

    if(descending)
      callback(undefined, parsedTrades.reverse());
    else
      callback(undefined, parsedTrades);
  };

  const reqData = {
    pair: this.pair
  };

  if(since) {
    // Kraken wants a tid, which is found to be timestamp_ms * 1000000 in practice. No clear documentation on this though
    reqData.since = startTs * 1000000;
  }

  const fetch = cb => this.kraken.api('Trades', reqData, this.handleResponse('getTrades', cb, true));
  retry(null, fetch, handle);
};

Trader.prototype.getPortfolio = function(callback) {
  const handle = (err, data) => {
    if(err) return callback(err);

    let assetAmount = parseFloat( data.result[this.market.prefixed[1]] );
    let currencyAmount = parseFloat( data.result[this.market.prefixed[0]] );

    if(!_.isNumber(assetAmount) || _.isNaN(assetAmount)) {
      console.log(`Kraken did not return portfolio for ${this.asset}, assuming 0.`);
      assetAmount = 0;
    }

    if(!_.isNumber(currencyAmount) || _.isNaN(currencyAmount)) {
      console.log(`Kraken did not return portfolio for ${this.currency}, assuming 0.`);
      currencyAmount = 0;
    }

    const portfolio = [
      { name: this.asset, amount: assetAmount },
      { name: this.currency, amount: currencyAmount }
    ];

    return callback(undefined, portfolio);
  };

  const fetch = cb => this.kraken.api('Balance', {}, this.handleResponse('getPortfolio', cb, true));
  retry(null, fetch, handle);
};

// This assumes that only limit orders are being placed with standard assets pairs
// It does not take into account volume discounts.
// Base maker fee is 0.16%, taker fee is 0.26%.
Trader.prototype.getFee = function(callback) {
  const makerFee = 0.16;
  callback(undefined, makerFee / 100);
};

Trader.prototype.getTicker = function(callback) {
  const handle = (err, data) => {
    if (err) return callback(err);

    const result = data.result[this.pair];
    const ticker = {
      ask: result.a[0],
      bid: result.b[0]
    };
    callback(undefined, ticker);
  };

  const reqData = {pair: this.pair}
  const fetch = cb => this.kraken.api('Ticker', reqData, this.handleResponse('getTicker', cb, true));
  retry(null, fetch, handle);
};

Trader.prototype.roundAmount = function(amount) {
  return _.floor(amount, this.market.amountPrecision);
};

Trader.prototype.roundPrice = function(amount) {
  return scientificToDecimal(_.round(amount, this.market.pricePrecision));
};

Trader.prototype.addOrder = function(tradeType, amount, price, callback) {
  price = this.roundPrice(price); // only round price, not amount

  const handle = (err, data) => {
    if(err) {
      return callback(err);
    }

    let txid;

    if(data.catched) {
      // handled timeout, but order was created
      txid = data.id;
    } else if(_.isString(data)) {
      // handled timeout, order was NOT created
      txid = data;
    } else {
      // normal flow
      txid = data.result.txid[0];
    }

    callback(undefined, txid);
  };

  const reqData = {
    pair: this.pair,
    type: tradeType.toLowerCase(),
    ordertype: 'limit',
    price: price,
    volume: amount
  };

  const fetch = cb => this.kraken.api('AddOrder', reqData, this.handleResponse('addOrder', cb, false, { tradeType, amount, price }));
  retry(null, fetch, handle);
};

Trader.prototype.buy = function(amount, price, callback) {
  this.addOrder('buy', amount, price, callback);
};

Trader.prototype.sell = function(amount, price, callback) {
  this.addOrder('sell', amount, price, callback);
};


Trader.prototype.getOrder = function(order, callback) {
  const handle = (err, data) => {
    if(err) return callback(err);

    const price = parseFloat( data.result[ order ].price );
    const amount = parseFloat( data.result[ order ].vol_exec );
    const date = moment.unix( data.result[ order ].closetm );

    // TODO: figure out fees, kraken is reporting 0 fees:
    // { 'OF6L2D-6LIKD-4OOHR7':
    //   { refid: null,
    //     userref: 0,
    //     status: 'closed',
    //     reason: null,
    //     opentm: 1530694339.8116,
    //     closetm: 1530694402.9572,
    //     starttm: 0,
    //     expiretm: 0,
    //     descr: [Object],
    //     vol: '0.00500000',
    //     vol_exec: '0.00500000',
    //     cost: '27.9',
    //     fee: '0',
    //     price: '5595.0',
    //     stopprice: '0.00000',
    //     limitprice: '0.00000',
    //     misc: '',
    //     oflags: 'fciq' } } }

    callback(undefined, {
      price,
      amount,
      date,
      feePercent: 0.16 // default for now
    });
  };

  const reqData = {txid: order};

  const fetch = cb => this.kraken.api('QueryOrders', reqData, this.handleResponse('getOrder', cb, true));
  retry(null, fetch, handle);
}

Trader.prototype.checkOrder = function(order, callback) {
  const handle = (err, data) => {
    if(err) return callback(err);

    const result = data.result[order];

    callback(undefined, {
      executed: result.vol === result.vol_exec,
      open: result.status === 'open',
      filledAmount: +result.vol_exec
    });
  };

  const reqData = {txid: order};

  const fetch = cb => this.kraken.api('QueryOrders', reqData, this.handleResponse('checkOrder', cb, true));
  retry(null, fetch, handle);
};

Trader.prototype.cancelOrder = function(order, callback) {
  const reqData = {txid: order};

  const handle = (err, data) => {
    if(err) {
      if(err.message.includes('Unknown order')) {
        return callback(undefined, true);
      }

      // catch race condition:
      // if we cancel, that request times out
      // we recheck: it's live BUT then the
      // timeout request goes through nonetheless
      // (only times out behind cloudflare)
      if(err.message.includes('Invalid order')) {
        return callback(undefined, true);
      }

      return callback(err)
    }

    if(data.filled) {
      callback(undefined, false, data);
    }

    callback(undefined, false);
  }

  const fetch = cb => this.kraken.api('CancelOrder', reqData, this.handleResponse('cancelOrder', cb, false, order));
  retry(null, fetch, handle);
};


Trader.prototype.getRawOpenOrders = function(callback) {
  const handle = (err, data) => {
    if(err) {
      return callback(err)
    }

    callback(undefined, data.result.open);
  }

  const fetch = cb => this.kraken.api('OpenOrders', {}, this.handleResponse('getOpenOrders', cb, true));
  retry(null, fetch, handle);
}

Trader.prototype.getOpenOrders = function(callback) {

  this.getRawOpenOrders((err, allOrders) => {
    if(err) {
      console.log(err);

      return callback(err)
    }

    const orders = [];

    _.each(allOrders, (o, id) => {
      if(o.descr.pair === this.pair) {
        orders.push(id);
      }
    });

    callback(undefined, orders);
  });
}

Trader.getCapabilities = function () {
  return {
    name: 'Kraken',
    slug: 'kraken',
    currencies: marketData.currencies,
    assets: marketData.assets,
    markets: marketData.markets,
    requires: ['key', 'secret'],
    providesHistory: 'date',
    providesFullHistory: true,
    tid: 'date',
    tradable: true,
    gekkoBroker: 0.6
  };
}

module.exports = Trader;
