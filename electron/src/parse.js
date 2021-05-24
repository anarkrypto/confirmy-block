const { blake2b } = require('blakejs')
const { byteArrayToHex, decodeNanoBase32 } = require('./conversion')


exports.parseNanoAddress = function (address) {
    let prefixLength = address.indexOf('_') + 1
    const publicKeyBytes = decodeNanoBase32(address.substr(prefixLength, 52))
    const publicKey = byteArrayToHex(publicKeyBytes)
    const checksumBytes = decodeNanoBase32(address.substr(-8))
    const computedChecksumBytes = blake2b(publicKeyBytes, null, 5).reverse()
    const checksum = byteArrayToHex(computedChecksumBytes)
    return {
        publicKeyBytes,
        publicKey,
        checksum
    }
}