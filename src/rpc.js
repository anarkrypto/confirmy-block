const axios = require("axios")

const { node, worker } = require("../config.json")

const fs = require("fs")
const path = require('path')
const nodesPath = path.join(__dirname, '..', 'nodes.txt')
let nodes = fs.readFileSync(nodesPath).toString().replace(/\r\n/g, '\n').split('\n')
if (!nodes.includes(node)) nodes.push(node)

const postRPC = function (data, nodeAddress = node) {
    let options = {}
    if (nodeAddress != worker) options.timeout = 1000 * 30 // Wait for 30 seconds, except on the worker
    return new Promise(async function (resolve, reject) {
        axios.post(nodeAddress, data, options)
            .then((res) => {
                if (typeof (res.data) === 'object') {
                    if ("error" in res.data) {
                        reject(res.data.error)
                    } else {
                        resolve(res.data)
                    }
                } else {
                    reject("invalid node response")
                }
            }).catch((err) => {
                if (err.response) {
                    reject(err.response.data);
                } else if (err.request) {
                    reject("no response from node");
                } else {
                    reject('Error', err.message);
                }
            })
    })
}

async function lowest_frontier(account) {
    process.stdout.write("Getting lowest frontier from public nodes...")
    return new Promise(async function (resolve, reject) {
        let lowest_nodes = [];
        let lowest_height = Number.POSITIVE_INFINITY;
        let lowest_block = undefined;
        let heights = []
        let errors = []
        let promises = []
        for (var i = 0; i < nodes.length; i++) {
            let promise = account_info(account, nodes[i])
            promises.push(promise)
            promise.then(() => {
                process.stdout.write(".")
            }).catch((err) => {
                process.stdout.write("*")
                errors.push(nodes[i] + " error: " + err)
            })
        }

        await Promise.allSettled(promises)
            .then((results) => {
                console.log("")
                if (nodes.length == errors.lenght) {
                    console.error(errors.join("\n"))
                    return reject("All nodes have failed")
                }
                results.forEach((result) => {

                    if (result.status == "fulfilled") {
                        let accinfo = result.value
                        if (accinfo["confirmation_height"] <= lowest_height) {
                            if (accinfo["confirmation_height"] < lowest_height) lowest_nodes = [];
                            lowest_nodes.push(accinfo.node);
                            lowest_height = accinfo["confirmation_height"];
                            lowest_block = accinfo["confirmation_height_frontier"];
                        }
                        heights.push(accinfo["confirmation_height"]);
                    }
                })

                console.info("Lowest nodes " + lowest_nodes.join(" and "));
                console.info("Last confirmed block: " + lowest_block + "\n")

                resolve({hash: lowest_block, height: lowest_height})
            })
            .catch((err) => {
                console.log("")
                reject(err)
            })

    })
}

function account_info(account, nodeAddress = node) {
    return new Promise((resolve, reject) => {
        const data = {
            action: "account_info",
            account: account
        }
        postRPC(data, nodeAddress)
            .then((res) => {
                res.node = nodeAddress
                resolve(res)
            }).catch((err) => {
                reject(err)
            })
    })
}

function account_history(account, count = -1, reverse = false, head = false) {
    return new Promise((resolve, reject) => {
        let data = {
            "action": "account_history",
            "account": account,
            "raw": "true",
            "count": count,
            "reverse": reverse
        }
        if (head) data.head = head
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
            "action": "blocks_info",
            "json_block": "true",
            "hashes": [hash]
        }
        postRPC(data, node)
            .then((res) => {
                if ("blocks" in res) {
                    try {
                        let resInner = res["blocks"][Object.keys(res["blocks"])[0]]
                        let block = resInner.contents
                        block.amount = resInner.amount
                        block.hash = hash
                        block.local_timestamp = resInner.local_timestamp
                        block.confirmed = resInner.confirmed
                        block.subtype = resInner.subtype
                        block.height = resInner.height
                        resolve(block)
                    } catch (err) {
                        reject(err)
                    }
                } else {
                    reject("block not found")
                }
            }).catch((err) => {
                if (err.includes("not allowed") || "err" == "Unknown command") {
                    data = {
                        "action": "block_info",
                        "json_block": "true",
                        "hash": hash
                    }
                    postRPC(data, node)
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
                } else {
                    reject(err)
                }
            })
    })
}

function pending_blocks(account, threshold = 0) {
    return new Promise((resolve, reject) => {
        const data = {
            "action": "pending",
            "account": account,
            "count": -1,
            "include_active": true,
            "sorting": true,
            "threshold": threshold
        }

        postRPC(data)
            .then((res) => {
                if (!("blocks" in res)) return reject("invalid node response")
                try {
                    resolve(res.blocks)
                } catch (err) {
                    reject(err)
                }
            }).catch((err) => {
                reject(err)
            })
    })
}

function broadcast(block_json) {
    return new Promise(async function (resolve, reject) {
        let promises = []
        const data = {
            "action": "process",
            "json_block": "true",
            "block": block_json
        }
        let errors = []
        for (let i in nodes) {
            let node = nodes[i]
            promises.push(postRPC(data, nodes[i])
                .then((res) => {
                    if ("hash" in res) {
                        console.info(node + ": broadcasted")
                        //resolve(res)
                    } else {
                        console.error(node + ": " + res)
                        //reject(res)
                    }
                }).catch((err) => {
                    if (err == "Old block") {
                        console.error(node + ": broadcasted")
                    } else {
                        console.error(node + ": " + err)
                        errors.push(node + ": " + err)
                    }
                })
            )
        }
        await Promise.all(promises)
        if (errors.length == nodes.length) {
            console.error(errors.join("\n"))
            reject("All nodes have failed")
        }
        resolve(nodes.length - errors.length)
    })
}

function active_difficulty() {
    return new Promise((resolve, reject) => {
        const data = {
            "action": "active_difficulty"
        }
        postRPC(data)
            .then((res) => {
                resolve(res)
            }).catch((err) => {
                reject(err)
            })
    })
}

// Work-server commands

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
                reject(err.replace("node", "worker"))
            })
    })
}

function work_cancel(hash) {
    return new Promise((resolve, reject) => {
        const data = {
            action: "work_cancel",
            hash: hash
        }
        postRPC(data, worker)
            .then((res) => {
                resolve(res)
            }).catch((err) => {
                reject(err.replace("node", "worker"))
            })
    })
}

module.exports = {
    account_info,
    account_history,
    block_info,
    pending_blocks,
    broadcast,
    active_difficulty,
    lowest_frontier,
    work_generate,
    work_cancel
}