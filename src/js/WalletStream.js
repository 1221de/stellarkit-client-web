import Helper from './helper.js'
import StellarUtils from './StellarUtils.js'
const EventEmitter = require('events')
const debounce = require('debounce')

export default class WalletStream extends EventEmitter {
  // typs is 'payments' 'transactions' 'operations' 'trades'
  constructor(publicKey, type = 'payments', limit = 200) {
    super()

    this.limit = limit
    this.type = type
    this.publicKey = publicKey

    this.paymentStopper = null
    this.operationStopper = null
    this.tradeStopper = null
    this.transactionStopper = null
    this.itemsMap = {}
    this.startFromNow = false

    this.notifyUpdated = debounce(() => {
      this.emit('updated')
    }, 200)

    this.start()
  }

  stop() {
    if (this.paymentStopper !== null) {
      this.paymentStopper()
      this.paymentStopper = null
    }

    if (this.tradeStopper !== null) {
      this.tradeStopper()
      this.tradeStopper = null
    }

    if (this.operationStopper !== null) {
      this.operationStopper()
      this.operationStopper = null
    }

    if (this.transactionStopper !== null) {
      this.transactionStopper()
      this.transactionStopper = null
    }
  }

  getItems() {
    return Object.values(this.itemsMap)
  }

  addItem(item, tx) {
    item.link = tx._links.self.href
    item.date = tx.created_at
    item.id = tx.id

    this.itemsMap[item.id] = item

    this.notifyUpdated()
  }

  displayTransaction(txResponse) {
    if (txResponse.type === 'payment') {
      let asset = 'XLM'

      if (txResponse.asset_type !== 'native') {
        asset = txResponse.asset_code
      }
      this.addItem({
        id: txResponse.id,
        name: 'Payment ' + asset,
        from: txResponse.from,
        assetCode: txResponse.asset_code,
        value: Helper.stripZeros(txResponse.amount)
      }, txResponse)
    } else if (txResponse.type === 'payment_path') {
      let asset = 'XLM'

      if (txResponse.asset_type !== 'native') {
        asset = txResponse.asset_code
      }

      this.addItem({
        id: txResponse.id,
        name: 'Payment path' + asset + '/' + txResponse.source_asset_code,
        value: Helper.stripZeros(txResponse.amount)
      }, txResponse)
    } else if (txResponse.type === 'create_account') {
      this.addItem({
        id: txResponse.id,
        name: 'Create Account',
        value: Helper.stripZeros(txResponse.starting_balance)
      }, txResponse)
    } else if (txResponse.type === 'account_merge') {
      this.addItem({
        id: txResponse.id,
        name: 'Account Merge',
        value: 'merging'
      }, txResponse)
    } else if (txResponse.type === 'manage_offer') {
      let buying = 'XLM'
      let selling = 'XLM'

      if (txResponse.buying_asset_type !== 'native') {
        buying = txResponse.buying_asset_code
      }
      if (txResponse.selling_asset_type !== 'native') {
        selling = txResponse.selling_asset_code
      }
      this.addItem({
        id: txResponse.id,
        name: 'Manage Offer',
        value: 'Selling: ' + selling + ' Buying: ' + buying
      }, txResponse)
    } else if (txResponse.type === 'change_trust') {
      let asset = 'XLM'

      if (txResponse.asset_type !== 'native') {
        asset = txResponse.asset_code
      }

      this.addItem({
        id: txResponse.id,
        name: 'Change Trust',
        value: asset
      }, txResponse)
    } else if (txResponse.type === 'set_options') {
      let value = 'unknown'
      if (txResponse.inflation_dest) {
        value = 'Inflation dest = ' + txResponse.inflation_dest
      }

      this.addItem({
        id: txResponse.id,
        name: 'Set Options',
        value: value
      }, txResponse)
    } else if (txResponse.type === 'allow_trust') {
      let asset = 'XLM'

      if (txResponse.asset_type !== 'native') {
        asset = txResponse.asset_code
      }

      this.addItem({
        id: txResponse.id,
        name: 'Allow Trust',
        value: asset
      }, txResponse)
    } else if (txResponse.type === 'manage_data') {
      this.addItem({
        id: txResponse.id,
        name: 'Manage Data',
        value: 'Name = ' + txResponse.name + ' Value = ' + txResponse.value
      }, txResponse)
    } else {
      Helper.debugLog(txResponse)
    }
  }

  start() {
    let builder
    switch (this.type) {
      case 'payments':
        builder = StellarUtils.server().payments()
        break
      case 'transactions':
        builder = StellarUtils.server().transactions()
        break
      case 'operations':
        builder = StellarUtils.server().operations()
        break
      case 'trades':
        builder = StellarUtils.server().trades()
        break
      default:
        Helper.debugLog('wallet stream, type invalid')
        break
    }

    if (this.limit > 0) {
      builder.limit(this.limit)
    }

    if (this.startFromNow) {
      builder.cursor('now')
    }

    builder.forAccount(this.publicKey)

    const stopper = builder.stream({
      onmessage: txResponse => {
        this.displayTransaction(txResponse)
      },
      onerror: error => {
        if (error['isTrusted'] === true) {
          // not sure what this is, but ignoring it, constantly logs
        } else {
          Helper.debugLog(error, 'onerror')
        }
      }
    })

    switch (this.type) {
      case 'payments':
        this.paymentStopper = stopper
        break
      case 'transactions':
        this.transactionStopper = stopper
        break
      case 'operations':
        this.operationStopper = stopper
        break
      case 'trades':
        this.tradeStopper = stopper
        break
      default:
        Helper.debugLog('wallet stream, type invalid')
        break
    }
  }
}