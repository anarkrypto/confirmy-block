const MIN_INDEX = 0
const MAX_INDEX = Math.pow(2, 32) - 1

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

exports.checkIndex = function(index){
    return Number.isInteger(index) && index >= MIN_INDEX && index <= MAX_INDEX
}