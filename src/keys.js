const { blake2b } = require('blakejs')

function byteArrayToHex(bytes) {
    let hex = []
    for (let i = 0; i < bytes.length; i++) {
        let current = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
        hex.push((current >>> 4).toString(16));
        hex.push((current & 0xF).toString(16));
    }
    return hex.join("").toUpperCase();
}

function decodeNanoBase32(input) {
    const alphabet = '13456789abcdefghijkmnopqrstuwxyz'

    function readChar(char) {
        const idx = alphabet.indexOf(char)

        if (idx === -1) {
            throw new Error(`Invalid character found: ${char}`)
        }

        return idx
    }

    const length = input.length
    const leftover = (length * 5) % 8
    const offset = leftover === 0 ? 0 : 8 - leftover

    let bits = 0
    let value = 0

    let index = 0
    let output = new Uint8Array(Math.ceil((length * 5) / 8))

    for (let i = 0; i < length; i++) {
        value = (value << 5) | readChar(input[i])
        bits += 5

        if (bits >= 8) {
            output[index++] = (value >>> (bits + offset - 8)) & 255
            bits -= 8
        }
    }
    if (bits > 0) {
        output[index++] = (value << (bits + offset - 8)) & 255
    }

    if (leftover !== 0) {
        output = output.slice(1)
    }
    return output
}

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