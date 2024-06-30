/*
  The sticky order is an advanced order:
    - It is created at a limit price of X
      - if limit is not specified always at bbo.
      - if limit is specified the price is either limit or the bbo (whichever is more favorable)
    - it will readjust the order:
      - if outbid is true it will outbid the current bbo (on supported exchanges)
      - if outbid is false it will stick to current bbo when this moves
    - If the price moves away from the order it will "stick to" the top

  TODO:
    - native move
*/

const _ = require('lodash');
const async = require('async');
const events = require('events');
const moment = require('moment');
const errors = require('../exchangeErrors');
const BaseOrder = require('./order');
const states = require('./states');

class StickyOrder extends BaseOrder {
  constructor({api, marketConfig, capabilities}) {
    super(api);

    this.market = marketConfig;
    this.capabilities = capabilities;

    // global async lock
    this.sticking = false;

    // bound helpers
    this.roundPrice = this.api.roundPrice.bind(this.api);
    this.roundAmount = this.api.roundAmount.bind(this.api);
    if(_.isFunction(this.api.outbidPrice)) {
      this.outbidPrice = this.api.outbidPrice.bind(this.api);
    }

    this.debug = this.api.name === 'Deribit2';
    this.log = m => this.debug && console.log(new Date, m);
  }

  create(side, rawAmount, params = {}) {
    if(this.completed || this.completing) {
      return false;
    }

    console.log(new Date, 'sticky create', side);

    this.side = side;

    this.amount = this.roundAmount(rawAmount);

    this.initialLimit = params.initialLimit;

    if(side === 'buy') {
      if(params.limit) {
        this.limit = this.roundPrice(params.limit);
      } else {
        this.noLimit = true;
        this.limit = Infinity;
      }
    } else {
      if(params.limit) {
        this.limit = this.roundPrice(params.limit);
      } else {
        this.noLimit = true;
        this.limit = -Infinity;
      }
    }

    this.status = states.SUBMITTED;
    this.emitStatus();

    this.orders = {};

    this.outbid = params.outbid && _.isFunction(this.outbidPrice);

    if(this.data && this.data.ticker) {
      this.price = this.calculatePrice(this.data.ticker);
      this.createOrder();
    } else {
      this.api.getTicker((err, ticker) => {
        if(this.handleError(err)) {
          console.log(new Date, 'error get ticker');
          return;
        }

        this.price = this.calculatePrice(ticker);
        this.createOrder();
      });
    }

    return this;
  }

  calculatePrice(ticker) {

    const r = this.roundPrice;

    if(this.initialLimit && !this.id) {
      console.log('passing initial limit of:', this.limit);
      return r(this.limit);
    }

    if(this.side === 'buy') {

      if(!this.noLimit && ticker.bid >= this.limit) {
        return r(this.limit);
      }

      if(!this.outbid) {
        return r(ticker.bid);
      }

      const outbidPrice = this.outbidPrice(ticker.bid, true);

      if(outbidPrice <= this.limit && outbidPrice < ticker.ask) {
        return r(outbidPrice);
      } else {
        return r(this.limit);
      }

    } else if(this.side === 'sell') {

      if(!this.noLimit && ticker.ask <= this.limit) {
        return r(this.limit);
      }

      if(!this.outbid) {
        return r(ticker.ask);
      }

      const outbidPrice = this.outbidPrice(ticker.ask, false);

      if(outbidPrice >= this.limit && outbidPrice > ticker.bid) {
        return r(outbidPrice);
      } else {
        return r(this.limit);
      }
    }
  }

  createOrder() {
    if(this.completed || this.completing) {
      return false;
    }

    const alreadyFilled = this.calculateFilled();

    this.submit({
      side: this.side,
      amount: this.roundAmount(this.amount - alreadyFilled),
      price: this.price,
      alreadyFilled
    });
  }

  // check if the last order was partially filled
  // on an exchange that does not pass fill data on cancel
  // see https://github.com/askmike/gekko/pull/2450
  handleInsufficientFundsError(err) {
    if(
      !err ||
      err.type !== 'insufficientFunds' ||
      !this.capabilities.limitedCancelConfirmation ||
      !this.id
    ) {
      return false;
    }

    const id = this.id;

    setTimeout(
      () => {
        this.api.getOrder(id, (innerError, res) => {
          if(this.handleError(innerError)) {
            return;
          }

          const amount = res.amount;

          if(this.orders[id].filled === amount) {
            // handle original error
            return this.handleError(err);
          }

          this.orders[id].filled = amount;
          this.emit('fill', this.calculateFilled());
          if(this.calculateFilled() >= this.amount) {
            return this.filled(this.price);
          }

          setTimeout(this.createOrder, this.checkInterval);
        });
      },
      this.checkInterval
    );

    return true;
  }

  handleCreate(err, id) {

    if(this.handleInsufficientFundsError(err)) {
      return;
    }

    if(this.handleError(err)) {
      console.log(new Date, 'handleCreate error');
      return;
    }

    if(!id) {
      console.log('BLUP! no id...');
    }

    // potentailly clean up old order
    if(
      this.id &&
      this.orders[this.id] &&
      this.orders[this.id].filled === 0
    )
      delete this.orders[this.id];

    // register new order
    this.log(`${this.side} old id: ${this.id} new id: ${id}`);
    this.id = id;

    this.orders[id] = {
      price: this.price,
      filled: 0
    }

    this.emit('new order', this.id);
    this.emit('movelimit handled', new Date);

    this.status = states.OPEN;
    this.emitStatus();

    this.scheduleNextCheck();
  }

  initiateDefferedAction() {
    // check whether we had an action pending
    if(this.cancelling) {
      this.cancel();
      return true;
    }

    if(this.movingLimit && this.moveLimit()) {
      return true;
    }

    if(this.movingAmount) {
      this.moveAmount();
      return true;
    }

    return false;
  }

  scheduleNextCheck() {

    // remove lock
    this.sticking = false;

    if(this.initiateDefferedAction()) {
      return;
    }

    // register check
    this.timeout = setTimeout(this.checkOrder, this.checkInterval);

  }

  checkOrder() {

    if(this.completed || this.completing) {
      return console.log(new Date, this.side, 'checkOrder called on completed/completing order..', this.completed, this.completing);
    }

    if(this.status === states.MOVING) {
      return console.log(new Date, this.side, 'refusing to check, in the middle of move');
    }

    if(this.initiateDefferedAction()) {
      console.log(new Date, this.side, 'skipping check logic, better things to do - 0');
      return;
    }

    this.sticking = true;
    const checkId = this.id;

    this.api.checkOrder(this.id, (err, result) => {

      if(!this.debug) {
        if(this.ignoreCheckResult) {
          this.log(this.side + ' debug ignoring check result');
          this.ignoreCheckResult = false;
          return;
        }
      }

      if(this.status === states.MOVING) {
        this.log(`${this.side} ${this.id} debug ignoring check result - in the middle of move`);
        this.ignoreCheckResult = false;
        return;
      }

      if(checkId !== this.id) {
        this.log(this.side + ' debug got check on old id ' + checkId + ', ' + this.id);
        this.ignoreCheckResult = false;
        return;
      }

      this.status = states.CHECKED;
      this.emitStatus();

      if(this.handleError(err)) {
        console.log(new Date, 'checkOrder error');
        return;
      }

      if(result.open) {
        if(result.filledAmount !== this.orders[this.id].filled) {
          this.orders[this.id].filled = result.filledAmount;
          this.emit('fill', this.calculateFilled());
        }

        // if we are already at limit we dont care where the top is
        // note: might be string VS float
        if(this.price == this.limit) {
          this.scheduleNextCheck();
          return;
        }

        if(this.initiateDefferedAction()) {
          console.log(new Date, this.side, 'skipping check ticker logic, better things to do 1');
          return;
        }

        this.api.getTicker((err, ticker) => {
          if(this.handleError(err)) {
            console.log(new Date, 'getTicker error');
            return;
          }

          if(this.initiateDefferedAction()) {
            console.log(new Date, this.side, 'skipping check ticker logic, better things to do 2');
            return;
          }

          if(this.status === states.MOVING) {
            this.log(`${this.side} ${this.id} debug ignoring check result - in the middle of move     ---- 2`);
            this.ignoreCheckResult = false;
            return;
          }

          this.ticker = ticker;
          this.emit('ticker', ticker);

          const bookSide = this.side === 'buy' ? 'bid' : 'ask';
          // note: might be string VS float
          if(ticker[bookSide] != this.price) {
            return this.move(this.calculatePrice(ticker));
          } else {
            this.scheduleNextCheck();
          }
        });

        return;
      }

      // it's not open right now
      // meaning we are done
      this.sticking = false;

      if(!result.executed) {
        // not open and not executed means it never hit the book
        console.log(this.side, this.status, this.id, 'not open not executed!', result);
        this.rejected();
        throw 'a';
        return;
      }

      // order got filled!
      this.orders[this.id].filled = this.amount;
      this.emit('fill', this.amount);
      this.filled(this.price);
    });


    this.status = states.CHECKING;
    this.emitStatus();
  }

  // global error handler
  handleError(error) {
    if(!error) {
      return false;
    }

    console.log(new Date, '[sticky order] FATAL ERROR', error.message);
    console.log(new Date, error);
    this.status = states.ERROR;
    this.emitStatus();
    this.error = error;

    this.emit('error', error);
    return true;
  }

  // returns true if the order was fully filled
  // handles partial fills on cancels calls
  // on exchanges that support it.
  handleCancel(filled, data) {
    // it got filled before we could cancel
    if(filled) {
      this.orders[this.id].filled = this.amount;
      this.emit('fill', this.amount);
      this.filled(this.price);
      return;
    }

    // if we have data on partial fills
    // check whether we had a partial fill
    if(_.isObject(data)) {
      let amountFilled = data.filled;

      if(!amountFilled && data.remaining) {
        const alreadyFilled = this.calculateFilled();
        const orderAmount = this.roundAmount(this.amount - alreadyFilled);
        amountFilled = this.roundAmount(orderAmount - data.remaining);
      }

      if(amountFilled > this.orders[this.id].filled) {
        this.orders[this.id].filled = amountFilled;
        this.emit('fill', this.calculateFilled());
      }
    }

    return;
  }

  move(price) {
    if(this.completed || this.completing) {
      return false;
    }

    this.status = states.MOVING;
    this.emitStatus();

    this.log(`${this.side} ${this.id} this.move 1`);

    const cancelId = this.id;

    this.api.cancelOrder(cancelId, (err, filled, data) => {
      this.log(`${this.side} ${this.id} this.move 2`);

      if(this.handleError(err)) {
        console.log(new Date, 'error move');
        return;
      }

      // it got filled before we could cancel
      if(cancelId === this.id && this.handleCancel(filled, data)) {
        return;
      }

      // update to new price
      this.price = this.roundPrice(price);

      this.createOrder();
    });

    return true;
  }

  calculateFilled() {
    let totalFilled = 0;
    _.each(this.orders, (order, id) => totalFilled += order.filled);

    return totalFilled;
  }

  moveLimit(limit) {
    if(this.completed || this.completing) {
      return false;
    }

    if(!limit) {
      limit = this.moveLimitTo;
      // console.log(new Date, this.side, 'debug resuming move!');
    } else {
      this.limitRequested = new Date;
      this.log(this.side + ' received move limit');
    }

    if(this.limit === this.roundPrice(limit)) {
      // effectively nothing changed
      return false;
    }

    if(this.cancelling) {
      return false;
    }

    this.emit('movelimit', new Date);

    if(
      this.status === states.INITIALIZING ||
      this.status === states.SUBMITTED ||
      this.status === states.MOVING ||
      this.status === states.CHECKING ||
      this.sticking
    ) {

      if(
        !this.api.fillDataOnCancel ||
        this.status === states.MOVING ||
        this.status === states.SUBMITTED
      ) {
        // console.log(new Date, '[sticky]', this.side, 'skipping because:', this.status);
        this.moveLimitTo = limit;
        this.movingLimit = true;
        return false;
      }
    }

    this.limit = this.roundPrice(limit);
    this.movingLimit = false;

    const moveBuy = this.side === 'buy' && this.limit < this.price;
    const moveSell = this.side === 'sell' && this.limit > this.price;

    if(moveBuy || moveSell) {
      this.sticking = true;
      clearTimeout(this.timeout);

      if(this.api.fillDataOnCancel && this.status === states.CHECKING) {
        this.log(this.side + 'debug move overwrites running check ' + this.status + ' ' + this.id);
        this.ignoreCheckResult = true;
      }

      this.log(this.side + ' moving ' + this.id);

      const timeToMove = new Date - this.limitRequested;
      if(timeToMove > 300) {
        console.log(new Date, this.side, 'long time to move:', timeToMove);
      }
      this.move(this.limit);

      return true;
    }

    this.emit('movelimit handled', new Date);
    return false;
  }

  moveAmount(amount) {
    if(this.completed || this.completing)
      return false;

    if(!amount)
      amount = this.moveAmountTo;

    if(this.amount === this.roundAmount(amount))
      // effectively nothing changed
      return true;

    if(this.calculateFilled() > this.roundAmount(amount)) {
      // the amount is now below how much we have
      // already filled.
      this.filled();
      return false;
    }

    if(
      this.status === states.INITIALIZING ||
      this.status === states.SUBMITTED ||
      this.status === states.MOVING ||
      this.sticking
    ) {
      this.moveAmountTo = amount;
      this.movingAmount = true;
      return;
    }

    this.amount = this.roundAmount(amount - this.calculateFilled());

    if(this.amount < this.market.minimalOrder.amount) {
      if(this.calculateFilled()) {
        // we already filled enough of the order!
        this.filled();
        return false;
      } else {
        this.handleError(new Error("The amount " + this.amount + " is too small."));
      }
    }

    clearTimeout(this.timeout);

    this.movingAmount = false;
    this.sticking = true;

    this.api.cancelOrder(this.id, (err, filled, data) => {
      if(this.handleError(err)) {
        console.log(new Date, 'error cancel');
        return;
      }

      // it got filled before we could cancel
      if(this.handleCancel(filled, data)) {
        return;
      }

      this.createOrder();
    });

    return true;
  }

  cancel() {
    if(this.completed)
      return;

    if(
      this.status === states.SUBMITTED ||
      this.status === states.MOVING ||
      this.sticking
    ) {
      this.cancelling = true;
      return;
    }

    this.completing = true;
    clearTimeout(this.timeout);

    this.api.cancelOrder(this.id, (err, filled, data) => {
      if(this.handleError(err)) {
        console.log(new Date, 'error cancel');
        return;
      }

      this.cancelling = false;

      // it got filled before we could cancel
      if(this.handleCancel(filled, data)) {
        return;
      }

      this.status = states.CANCELLED;
      this.emitStatus();

      this.finish(false);
    })
  }

  createSummary(next) {
    if(!this.completed)
      console.log(new Date, 'createSummary BUT ORDER NOT COMPLETED!');

    if(!next)
      next = _.noop;

    const checkOrders = _.keys(this.orders)
      .map(id => next => {

        if(!this.orders[id].filled) {
          return next();
        }

        setTimeout(() => this.api.getOrder(id, next), this.checkInterval);
      });

    async.series(checkOrders, (err, trades) => {
      // note this is a standalone function after the order is
      // completed, as such we do not use the handleError flow.
      if(err) {
        console.log(new Date, 'error createSummary (checkOrder)')
        return next(err);
      }

      let price = 0;
      let amount = 0;
      let date = moment(0);

      _.each(trades, trade => {
        if(!trade) {
          return;
        }

        // last fill counts
        date = moment(trade.date);
        price = ((price * amount) + (+trade.price * trade.amount)) / (+trade.amount + amount);
        amount += +trade.amount;
      });

      const summary = {
        price,
        amount,
        date,
        side: this.side,
        orders: trades.length
      }

      const first = _.first(trades);

      if(first && first.fees) {
        summary.fees = {};

        _.each(trades, trade => {
          if(!trade) {
            return;
          }

          _.each(trade.fees, (amount, currency) => {
            if(!_.isNumber(summary.fees[currency])) {
              summary.fees[currency] = amount;
            } else {
              summary.fees[currency] += amount;
            }
          });
        });
      }

      if(first && !_.isUndefined(first.feePercent)) {
        summary.feePercent = 0;
        let amount = 0;

        _.each(trades, trade => {
          if(!trade || _.isUndefined(trade.feePercent)) {
            return;
          }

          if(trade.feePercent === 0) {
            return;
          }

          summary.feePercent = ((summary.feePercent * amount) + (+trade.feePercent * trade.amount)) / (+trade.amount + amount);
          amount += +trade.amount;
        });
      }

      this.emit('summary', summary);
      next(undefined, summary);
    });
  }
 
}

module.exports = StickyOrder;