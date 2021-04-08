const BigNumber = require("bignumber.js")

const TunedBigNumber = BigNumber.clone({
    EXPONENTIAL_AT: 1e9,
    DECIMAL_PLACES: 36,
})

const megaNano = "1000000000000000000000000000000" //raws

const MIN_AMOUNT = 0
const MAX_AMOUNT = TunedBigNumber(megaNano).multipliedBy(133248297) //supply

exports.checkAmount = function(amount){
  if (isNaN(amount)) return false
  return (amount >= MIN_AMOUNT && amount <= MAX_AMOUNT)
}

exports.checkNanoAddress = function (address) {
    return /^(xrb_|nano_)[13][13-9a-km-uw-z]{59}$/.test(address)
}

exports.checkHash = function(hash){
    if (/^([0-9A-F]){64}$/i.test(hash)) {
        return true
      } else {
        return false
      }
}

exports.checkURL = function (string) {
  let url;
  try {
    url = new URL(string);
  } catch (_) {
    return false;  
  }
  return url.protocol === "http:" || url.protocol === "https:";
}