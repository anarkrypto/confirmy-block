function get(url) {
    return new Promise((resolve, reject) => {
        fetch(url, {
            method: 'GET'
        }).then(function (res) {
            res.text()
                .then((text) => resolve(text))
                .catch((err) => reject(err))
        }).catch(function (err) {
            reject(err)
        })
    })
}

function isJson(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

let nodes, node, worker

function importConfig() {
    return new Promise(async function (resolve, reject) {
        const configContent = await get("./config.json").catch((err) => reject(err))
        if (!isJson(configContent)) return reject("Invalid config.json")
        const config = JSON.parse(configContent)
        node = config.node
        worker = config.worker
        const nodesTXTContent = await get("./nodes.txt").catch((err) => reject(err))
        nodes = nodesTXTContent.toString().replace(/\r\n/g, '\n').split('\n')
        if (!nodes.includes(node)) nodes.push(node)
        resolve()
    })
}

const postRPC = function (data, nodeAddress = node) {
    let options = {}
    if (nodeAddress != worker) options.timeout = 1000 * 30 // Wait for 30 seconds, except on the worker
    return new Promise(async function (resolve, reject) {
        fetch(nodeAddress, {
            method: 'POST',
            body: JSON.stringify(data)
        })
            .then((res) => {
                res.json()
                    .then((res) => {
                        if ("error" in res) return reject(res.error)
                        resolve(res)
                    })
                    .catch((err) => {
                        reject(err)
                    })
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

                resolve({ hash: lowest_block, height: lowest_height })
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

function account_history(account, count = -1, reverse = false, head = false, nodeAddress = node) {
    return new Promise((resolve, reject) => {
        let data = {
            "action": "account_history",
            "account": account,
            "raw": "true",
            "count": count,
            "reverse": reverse
        }
        if (head) data.head = head
        postRPC(data, nodeAddress)
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
                if ((typeof(err) !== "object" && err.includes("not allowed") || err == "Unknown command") || (typeof(err) === "object" && "message" in err && err.message.includes("No action"))) {
                    data = {
                        "action": "block_info",
                        "json_block": "true",
                        "hash": hash
                    }
                    postRPC(data, nodeAddress)
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

function pending_blocks(account, threshold = 0, nodeAddress = node) {
    return new Promise((resolve, reject) => {
        const data = {
            "action": "pending",
            "account": account,
            "count": -1,
            "include_active": true,
            "sorting": true,
            "threshold": threshold
        }

        postRPC(data, nodeAddress)
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

function broadcast(block_json, nodeAddress = node) {
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
                    console.log(nodeAddress)
                    console.log(res)
                    reject(res)
                }
            }).catch((err) => {
                if (err == "Old block") {
                    resolve("done")
                } else {
                    reject(err)
                }
            })
    })
}

function broadcastForAll(block_json) {
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