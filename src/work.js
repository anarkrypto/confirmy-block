const blake2b = require('blakejs').blake2b;
                         
const BASE_DIFFICULTY = "fffffff800000000"
const BASE_DIFFICULTY_RECEIVE = "fffffe0000000000"

function get_work_threshold(hash, nonce) {
    const input = new ArrayBuffer(8 + 32)
    const input8 = new Uint8Array(input)
    input8.set(hash, 8)
    const bytes64 = new BigUint64Array(input)
    bytes64[0] = BigInt(nonce)
    const out8 = blake2b(input8, null, 8)
    const out64 = new BigUint64Array(out8.buffer)
    return out64[0]
}

const DIFFICULTY_LIMIT = BigInt(1) << BigInt(64)

function invert(difficulty) {
    if (difficulty === BigInt(0)) {
        return difficulty;
    }
    return DIFFICULTY_LIMIT - difficulty;
}

function threshold_to_multiplier(threshold, base_difficulty) {
    return Number(invert(base_difficulty)) / Number(invert(threshold))
}

function from_hex(s) {
    return new Uint8Array(s.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
}

function work_validate(hash, work, difficulty) {
    let base_difficulty = BigInt('0x' + difficulty)
    const threshold = get_work_threshold(from_hex(hash), '0x' + work, base_difficulty)
    const multiplier = threshold_to_multiplier(threshold, base_difficulty)
    return { difficulty: threshold.toString(16), multiplier: multiplier }
}

module.exports = { 
    BASE_DIFFICULTY,
    BASE_DIFFICULTY_RECEIVE,
    work_validate,
    threshold_to_multiplier
}