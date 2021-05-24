const axios = require("axios")
const fs = require("fs")
const path = require('path')

const { node, worker } = require("../config.json")
const { parseNanoAddress } = require("./parse")
const { BASE_DIFFICULTY, BASE_DIFFICULTY_RECEIVE, work_validate } = require("./work")

const nodesPath = path.join(__dirname, '..', 'nodes.txt')
let nodes = fs.readFileSync(nodesPath).toString().replace(/\r\n/g, '\n').split('\n')
if (!nodes.includes(node)) nodes.push(node)
let nodesOffline = {}
let skippingNodeDelay = 60 * 15 // skipping offline nodes for 15 minutes
const max_timeout = 1000 * 10

const postRPC = function (data, nodeAddress = node, timeout = max_timeout) {
    let options = {}
    if (nodeAddress != worker) options.timeout = timeout// Wait for 10 seconds, except on the worker
    return new Promise(async function (resolve, reject) {
        // if the node does not respond consecutively for 2x, it goes to the list of offline nodes and will be ignored for 15 minutes
        if (nodeAddress in nodesOffline && nodesOffline[nodeAddress] > 1) {
            if ((parseInt(Date.now() / 1000) - nodesOffline[nodeAddress]) < skippingNodeDelay) {
                return reject("Offline")
            } else {
                nodesOffline[nodeAddress] = 0
            }
        }

        axios.post(nodeAddress, data, options)
            .then((res) => {

                if (nodeAddress in nodesOffline) nodesOffline[nodeAddress] = 0

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
                    reject(err.response.statusText);
                } else if (err.request) {
                    if (!(nodeAddress in nodesOffline) || nodesOffline[nodeAddress] == 0) {
                        nodesOffline[nodeAddress] = 1
                    } else {
                        nodesOffline[nodeAddress] = parseInt(Date.now() / 1000)
                        console.info("\nNode " + nodeAddress + " is not responding. Skipping it for 15 minutes\n")
                    }
                    reject("no response from node");
                } else {
                    reject('Error', err.message);
                }

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

function block_info(hash, nodeAddress = node) {
    return new Promise((resolve, reject) => {
        let data = {
            "action": "blocks_info",
            "json_block": "true",
            "hashes": [hash]
        }
        postRPC(data, nodeAddress)
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
                if (err.includes("not allowed") || err == "Unknown command") {
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

function process_block(block_json, nodeAddress = node) {
    return new Promise(async function (resolve, reject) {
        const data = {
            "action": "process",
            "json_block": "true",
            "block": block_json
        }
        postRPC(data, nodeAddress)
            .then((res) => {
                if ("hash" in res) {
                    resolve(res)
                } else {
                    reject(res)
                }
            }).catch((err) => {
                if (err == "Old block") {
                    resolve({ process: "Old block" })
                } else {
                    reject(err)
                }
            })

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

function delegators(account, nodeAddress = node) {
    return new Promise((resolve, reject) => {
        const data = {
            "action": "delegators",
            "account": account
        }
        //waits for 3 minutes because this command is slow on Nano nodes
        postRPC(data, nodeAddress, 300000)
            .then((res) => {
                if ("delegators" in res){
                    resolve(res.delegators)
                } else {
                    reject("delegators not found")
                }
            }).catch((err) => {
                reject(err)
            })
    })
}


// Work-server commands

function work_generate(hash, difficulty, workerAddress=  worker) {
    return new Promise((resolve, reject) => {
        const data = {
            action: "work_generate",
            hash: hash,
            difficulty: difficulty
        }
        postRPC(data, workerAddress)
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


// Useful functions 

async function lowest_frontier(account, nodeAddresses = nodes) {
    process.stdout.write("Getting lowest frontier from nodes...")
    return new Promise((resolve, reject) => {
        let lowest = { block: "", nodes: [], height: Number.POSITIVE_INFINITY, heights: [] }
        let errors = {}
        let nodes_promises = []
        nodeAddresses.forEach((nodeAddress) => {
            nodes_promises[nodeAddress] = account_info(account, nodeAddress)
            nodes_promises[nodeAddress]
                .then((accinfo) => {
                    if (parseInt(accinfo["confirmation_height"]) <= lowest.height) {
                        if (parseInt(accinfo["confirmation_height"]) < parseInt(lowest.height)) lowest.nodes = [];
                        lowest.nodes.push(accinfo.node);
                        lowest.height = parseInt(accinfo["confirmation_height"]);
                        lowest.block = accinfo["confirmation_height_frontier"];
                    }
                    lowest.heights.push(accinfo["confirmation_height"]);
                    process.stdout.write(".")
                }).catch((err) => {
                    process.stdout.write("*")
                    errors[nodeAddress] = err
                })
        })

        Promise.allSettled(Object.values(nodes_promises))
            .then((results) => {
                console.log("")
                if (nodeAddresses.length == Object.keys(errors).length) {
                    console.error(errors.join("\n"))
                    return reject("All nodes have failed")
                } else {
                    resolve(lowest)
                }
            })
    })
}

function higher_work(hash, nodeAddresses = nodes) {
    return new Promise((resolve, reject) => {
        process.stdout.write("Getting higher work from nodes...")

        let nodes_promises = {}
        let errors = {}
        let higher = { work: "", difficulty: "", multiplier: 0, target: "", type: "", nodes: [] }

        nodeAddresses.forEach((nodeAddress) => {
            nodes_promises[nodeAddress] = block_info(hash, nodeAddress)
            nodes_promises[nodeAddress]
                .then((block) => {
                    let base = BASE_DIFFICULTY
                    if (block.subtype == "receive") base = BASE_DIFFICULTY_RECEIVE
                    let target_block_pow = block.previous
                    if (block.previous == "0000000000000000000000000000000000000000000000000000000000000000") target_block_pow = parseNanoAddress(block.account).publicKey
                    let work_difficulty = work_validate(target_block_pow, block.work, base)
                    if (parseFloat(work_difficulty.multiplier) >= parseFloat(higher.multiplier)) {
                        if (parseFloat(work_difficulty.multiplier) > parseFloat(higher.multiplier)) {
                            higher.nodes = []
                            higher.work = block.work
                            higher.difficulty = work_difficulty.difficulty
                            higher.multiplier = parseFloat(work_difficulty.multiplier)
                            higher.target = target_block_pow
                            higher.type = block.subtype
                        }
                        higher.nodes.push(nodeAddress)
                    }
                    process.stdout.write(".")
                }).catch((err) => {
                    errors[nodeAddress] = err
                    process.stdout.write("*")
                })
        })

        Promise.allSettled(Object.values(nodes_promises))
            .then((res) => {
                console.info(" " + higher.multiplier.toFixed(2) + "x\n")
                if (Object.keys(errors).length == nodeAddresses.length) {
                    reject("All nodes have failed")
                } else {
                    resolve(higher)
                }
            })
    })
}

function broadcast(block_json, nodeAddresses = nodes) {
    return new Promise((resolve, reject) => {
        let nodes_promises = {}, errors = {}
        nodeAddresses.forEach((nodeAddress) => {
            nodes_promises[nodeAddress] = process_block(block_json, nodeAddress)
            nodes_promises[nodeAddress]
                .then((res) => {
                    console.info(nodeAddress + ": broadcasted")
                }).catch((err) => {
                    console.error(nodeAddress + ": " + err)
                    errors[nodeAddress] = err
                })
        })
        Promise.allSettled(Object.values(nodes_promises))
            .then((res) => {
                if (Object.keys(errors).length == nodeAddresses.length) {
                    reject("All nodes have failed")
                } else {
                    resolve(nodeAddresses.length - Object.keys(errors).length)
                }
            })
    })
}

function whereIsConfirmed(blockHash, callback, nodeAddresses = nodes) {
    return new Promise((resolve, reject) => {
        let nodes_promises = {}, errors = {}, nodes_confirmed = [], nodes_unconfirmed = []
        nodeAddresses.forEach((nodeAddress) => {
            nodes_promises[nodeAddress] = block_info(blockHash, nodeAddress)
            nodes_promises[nodeAddress]
                .then((res) => {
                    if (res.confirmed === true || res.confirmed == "true") {
                        callback(nodeAddress + ": confirmed")
                        nodes_confirmed.push(nodeAddress)
                    } else {
                        nodes_unconfirmed.push(nodeAddress)
                    }
                })
                .catch((err) => {
                    callback(nodeAddress + ": " + err + " - Skipping node")
                    errors[nodeAddress] = err
                })
        })

        Promise.allSettled(Object.values(nodes_promises))
            .then((res) => {
                if (Object.keys(errors).length == nodeAddresses.length) {
                    reject("All nodes have failed")
                } else {
                    resolve({confirmed: nodes_confirmed, unconfirmed: nodes_unconfirmed, errors: errors})
                }
            })
    })
}

module.exports = {
    account_info,
    account_history,
    block_info,
    pending_blocks,
    process_block,
    active_difficulty,
    delegators,
    work_generate,
    work_cancel,
    broadcast,
    lowest_frontier,
    higher_work,
    whereIsConfirmed,
    nodes
}
