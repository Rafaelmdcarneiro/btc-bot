## Supported exchanges

Gekko is able to directly communicate with the APIs of a number of exchanges. However communication with some exchanges is somewhat limited. Gekko makes the distinction between the following features:

- Monitoring: Gekko is able to retrieve live market data from the exchange. Gekko can store and run trading simulations over this data.
- Live Trading: Gekko is able to automatically execute orders (based on the signals of your strategy). This turns Gekko into a trading bot.
- Importing: Gekko is able to retrieve historical market data. This way you can easily get a month of market data over which you can [backtest][1] your strategy.

| Exchange              | Monitoring | Live Trading | Importing | Notes                     |
| --------------------- |:----------:|:------------:|:---------:| ------------------------- |
| [Binance][24]         | ✓          | ✓            | ✓         |                           |
| [Poloniex][2]         | ✓          | ✓            | ✓         |                           |
| [GDAX][3]             | ✓          | ✓            | ✓         |                           |
| [BTCC][4]*            | ✓          | ✓            | ✓         | (=BTCChina)               |
| [Bitstamp][5]*        | ✓          | ✓            | ✕         |                           |
| [Kraken][6]           | ✓          | ✓            | ✓         |                           |
| [Bitfinex][7]         | ✓          | ✓            | ✓         |                           |
| [Bittrex][8]          | ✓          | ✕            | ✕         | API problems ([#2310][26])|
| [coinfalcon][25]      | ✓          | ✓            | ✓         |                           |
| [The Rock Trading][28]| ✓          | ✓            | ✓         |                           |
| [EXMO][27]            | ✓          | ✓            | ✕         |                           |
| [wex.nz][9]*          | ✓          | ✓            | ✕         |                           |
| [Gemini][10]*         | ✓          | ✓            | ✕         |                           |
| [Okcoin.cn][11]*      | ✓          | ✓            | ✕         | China, see [#352][20]     |
| [Cex.io][12]*         | ✓          | ✕            | ✕         |                           |
| [BTC Markets][13]*    | ✓          | ✓            | ✕         |                           |
| [Luno][14]            | ✓          | ✓            | ✓         | previously BitX           |
| [lakeBTC][15]*        | ✓          | ✕            | ✕         |                           |
| [meXBT][16]*          | ✓          | ✕            | ✕         | see [here][21]            |
| [zaif][17]*           | ✓          | ✕            | ✕         |                           |
| [lakeBTC][18]*        | ✓          | ✕            | ✕         |                           |
| [bx.in.th][19]*       | ✓          | ✕            | ✕         |                           |
| [bitcoin.co.id][22]*  | ✓          | ✓            | ✕         |                           |
| [Quadriga CX][23]*    | x          | x            | ✕         | Exchange is down.         | |


*Temporary disabled since 0.6! If you were planning on using this exchange please e-mail me (address at the bottom of this page).

[1]: ../features/backtesting.md
[2]: https://poloniex.com
[3]: https://gdax.com
[4]: https://btcc.com
[5]: https://bitstamp.com
[6]: https://kraken.com
[7]: https://bitfinex.com
[8]: https://bittrex.com
[9]: https://wex.nz
[10]: https://gemini.com
[11]: https://www.okcoin.cn
[12]: https://cex.io
[13]: https://btcmarkets.net
[14]: https://www.luno.com
[15]: https://lakebtc.com
[16]: https://mexbt.com
[17]: https://zaif.jp/trade_btc_jpy
[18]: https://lakebtc.com
[19]: https://bx.in.th
[20]: https://github.com/askmike/gekko/pull/352
[21]: https://github.com/askmike/gekko/issues/288#issuecomment-223810974
[22]: https://vip.bitcoin.co.id/
[23]: https://quadrigacx.com/
[24]: https://www.binance.com/?ref=11236330
[25]: https://coinfalcon.com/?ref=CFJSQBMXZZDS
[26]: https://github.com/askmike/gekko/pull/2310
[27]: https://exmo.com
[28]: https://www.therocktrading.com/
