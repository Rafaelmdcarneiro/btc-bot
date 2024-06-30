# About Gekko

Gekko is a **free and open source** Bitcoin TA trading and backtesting platform that connects to popular Bitcoin exchanges. It is written in javascript and runs on [nodejs](http://nodejs.org).

*Use Gekko at your own risk.*

![screen shot of gekko backtesting](https://user-images.githubusercontent.com/969743/35054500-fc705b46-fbac-11e7-9652-306c468505a3.png)

## The gist

Gekko is a tool that makes it very easy to automate your own trading strategies.

![gist of gekko](https://gekko.wizb.it/_static/gekko-gist.png)

You can either create your own trading strategy or start with the built-in example strategies. Once you have a strategy you can use Gekko to automatically run it in a few different ways:

- **Backtest**: You can start a simulation of the strategy over a historical data period and Gekko will tell you what would have happened (which trades would have been performed as well as overall performance and risk metrics).
- **Paper trader**: You can run the strategy in realtime simulate trading (trade with fake money) to see in realtime how profitable your strategy would have been.
- **Tradebot**: You can run the strategy in realtime and automatically execute orders based on the signals.

All the above modes can be run from the user interface, this interface will show charts and performance/risk statistics.

Here is a video that explains Gekko's core concepts:

[![youtube video explaining gekko](https://gekko.wizb.it/_static/yt-gist.jpg)](https://www.youtube.com/watch?v=PKIxZ-Qaphk)

## Strategies

Gekko comes with some [example strategies](../strategies/introduction.md) (which implement a single indicator). But with some basic javascript you can [create your own strategies](../strategies/creating_a_strategy.md). You can use over 130 indicators to create your perfect prediction model (using [Talib's indicators](../strategies/talib_indicators.md) or [Tulip's indicators](../strategies/tulip_indicators.md)). *Why don't you combine Bollinger Bands, CCI and MACD with a STOCHRSI indicator?*

## Automated Trading platform

Gekko can watch the realtime markets, automatically executing and evaluating your strategies in the process. Whilst doing this Gekko will store all market data it sees, this makes it possible to later simulate trading strategies against historical data to see whether they would have been profitable (backtesting).

## Limitations

Gekko is not built for HFT or anything related to being the fastest (like arbitrage) as well as some other things. Please see the [scope page](./scope.md) to read more about what you can and cannot do with Gekko.

## How does Gekko work?

![Gekko architecture](https://wizb.it/gekko/static/architecture.jpg)

Read more in the [architecture documentation](../internals/architecture.md).

## Credits

* The title is inspired by [Bateman](https://github.com/fearofcode/bateman).
* This project is inspired by the [GoxTradingBot](https://github.com/virtimus/GoxTradingBot/) Chrome plugin (which in turn is inspired by [Goomboo's journal](https://bitcointalk.org/index.php?topic=60501.0)).

## Final

If Gekko helped you in any way, you can always leave me a tip at (BTC) 13r1jyivitShUiv9FJvjLH7Nh1ZZptumwW

## Disclaimer

Gekko (nor anyone behind this project) DOES NOT give investment advice. All advice seen within Gekko is the result of running YOUR OWN strategies against the market. On top of that there might be bugs in the code - Gekko DOES NOT come with ANY warranty.

## License

The MIT License (MIT)

Copyright (c) 2014 Mike van Rossum <mike@mvr.me>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
