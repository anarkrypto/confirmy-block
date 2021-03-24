const axios = require("axios")
const { node, worker } = require("../config.json")

const postRPC = function (data, nodeAddress = node) {
    return new Promise(async function (resolve, reject) {
        await axios.post(nodeAddress, data)
            .then((res) => {
                if (typeof res.data === 'object') {
                    if ("error" in res.data) {
                        reject(res.data.error)
                    } else {
                        resolve(res.data)
                    }
                } else {
                    reject("Invalid node response")
                }
            }).catch((err) => {
                if (err.response) {
                    reject(err.response.data);
                } else if (err.request) {
                    reject("No response from node");
                } else {
                    reject('Error', err.message);
                }
            })
    })
}


function account_history(account, count = -1, reverse = false) {
    return new Promise((resolve, reject) => {
        let data = {
            "action": "account_history",
            "account": account,
            "count": count,
            "reverse": reverse
        }
        postRPC(data)
            .then((res) => {
                try {
                    resolve(res.history)
                } catch (err) {
                    reject(err)
                }
            }).catch((err) => {
                reject(err)
            })
    })
}

function block_info(hash) {
    return new Promise((resolve, reject) => {
        let data = {
            "action": "block_info",
            "json_block": "true",
            "hash": hash
        }
        postRPC(data)
            .then((res) => {
                if ("contents" in res) {
                    try {
                        let block = res.contents
                        block.amount = res.amount
                        block.hash = hash
                        block.local_timestamp = res.local_timestamp
                        block.confirmed = res.confirmed
                        block.subtype = res.subtype
                        resolve(block)
                    } catch (err) {
                        reject(err)
                    }
                } else {
                    reject("block not found")
                }
            }).catch((err) => {
                reject(err)
            })
    })
}

function work_generate(hash, difficulty) {
    return new Promise((resolve, reject) => {
        const data = {
            action: "work_generate",
            hash: hash,
            difficulty: difficulty
        }
        postRPC(data, worker)
            .then((res) => {
                resolve(res)
            }).catch((err) => {
                reject(err)
            })
    })
}


function broadcast(block_json) {
    return new Promise((resolve, reject) => {
        const data = {
            "action": "process",
            "json_block": "true",
            "force": true,
            "block": block_json
        }
        postRPC(data)
            .then((res) => {
                if ("hash" in res) {
                    resolve(res)
                } else {
                    reject(res)
                }
            }).catch((err) => {
                reject(err)
            })
    })
}


module.exports = {
    account_history,
    work_generate,
    block_info,
    broadcast
}