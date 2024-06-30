const _ = require('lodash');
const fs = require('fs');
const request = require('request-promise');
const Promise = require('bluebird');

// Minimum amounts are not queryable, get them here 
// https://support.kraken.com/hc/en-us/articles/205893708-What-is-the-minimum-order-size-

let getMinTradeSize = asset => {
  let minTradeSize = 0.01;
  switch (asset) {
  case 'XREP':
    minTradeSize = '0.3'
    break;
  case 'XXBT':
    minTradeSize = '0.002'
    break;
  case 'BCH':
    minTradeSize = '0.002'
    break;
  case 'ADA':
    minTradeSize = '1'
    break;
  case 'DASH':
    minTradeSize = '0.03'
    break;
  case 'XXDG':
    minTradeSize = '3000'
    break;
  case 'EOS':
    minTradeSize = '3.0'
    break;
  case 'XETH':
    minTradeSize = '0.02'
    break;
  case 'XETC':
    minTradeSize = '0.3'
    break;
  case 'GNO':
    minTradeSize = '0.03'
    break;
  case 'XICN':
    minTradeSize = '2'
    break;
  case 'XLTC':
    minTradeSize = '0.1'
    break;
  case 'XMLN':
    minTradeSize = '0.1'
    break;
  case 'XXMR':
    minTradeSize = '0.1'
    break;
  case 'QTUM':
    minTradeSize = '0.1'
    break;
  case 'XXRP':
    minTradeSize = '30'
    break;
  case 'XXLM':
    minTradeSize = '30'
    break;
  case 'USDT':
    minTradeSize = '5'
    break;
  case 'XTZ':
    minTradeSize = '1'
    break;
  case 'XZEC':
    minTradeSize = '0.03'
    break;
  default:
    break;
  }

  return minTradeSize;
}

let assetPromise = request({
  url: 'https://api.kraken.com/0/public/Assets',
  headers: {
    Connection: 'keep-alive',
    'User-Agent': 'Request-Promise',
  },
  json: true,
}).then(body => {
  if (!body || !body.result) {
    throw new Error('Unable to fetch list of assets, response was empty')
  } else if (!_.isEmpty(body.error)) {
    throw new Error(`Unable to fetch list of assets: ${body.error}`);
  }

  return body.result;
});

let assetPairsPromise = request({
  url: 'https://api.kraken.com/0/public/AssetPairs',
  headers: {
    Connection: 'keep-alive',
    'User-Agent': 'Request-Promise',
  },
  json: true,
}).then(body => {
  if (!body || !body.result) {
    throw new Error('Unable to fetch list of assets, response was empty')
  } else if (!_.isEmpty(body.error)) {
    throw new Error(`Unable to fetch list of assets: ${body.error}`);
  }

  return body.result;
});

Promise.all([assetPromise, assetPairsPromise])
  .then(results => {
    let assets = _.uniq(_.map(results[1], market => {
      return results[0][market.base].altname;
    }));

    let currencies = _.uniq(_.map(results[1], market => {
      return results[0][market.quote].altname;
    }));

    let marketKeys = _.filter(_.keys(results[1]), k => { return !k.endsWith('.d'); });
    let markets = _.map(marketKeys, k => {
      let market = results[1][k];
      let asset = results[0][market.base];
      let currency = results[0][market.quote];
      return {
        pair: [currency.altname, asset.altname],
        prefixed: [market.quote, market.base],
        book: k,
        minimalOrder: {
          amount: getMinTradeSize(market.base),
          unit: 'asset',
        },
        pricePrecision: market.pair_decimals,
        amountPrecision: market.lot_decimals
      };
    });

    return { assets: assets, currencies: currencies, markets: markets };
  })
  .then(markets => {
    fs.writeFileSync('../../wrappers/kraken-markets.json', JSON.stringify(markets, null, 2));
    console.log(`Done writing Kraken market data`);
  })
  .catch(err => {
    console.log(`Couldn't import products from Kraken`);
    console.log(err);
  });

  
