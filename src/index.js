const { work_validate } = require("./work")
const { account_info, account_history, work_generate, block_info, broadcast } = require("./rpc")
const { BASE_DIFFICULTY, BASE_DIFFICULTY_RECEIVE } = require("./work")
const { checkNanoAddress, checkHash } = require("./check")
const { enable_max_difficulty, max_difficulty_send, max_difficulty_receive } = require("../config.json")

const CHECK_CONFIRMATION_TRIES = 100
const CHECK_CONFIRMATION_SLEEP = 3000 // ms

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function updateBlock(block) {
    return new Promise(async function (resolve, reject) {

        console.info("Subtype: " + block.subtype)

        let base = BASE_DIFFICULTY, max_difficulty = max_difficulty_send
        if (block.subtype == "receive") {
            base = BASE_DIFFICULTY_RECEIVE
            max_difficulty = max_difficulty_receive

            // If the receiving link block is also not confirmed, the receiving block cannot be confirmed either
            // In the future we can try to confirm both, but for that we will also need to confirm the entire previous chain
            let linked_block = await block_info(block.link)
                .catch((err) => {
                    return reject(err)
                })
            if (linked_block.confirmed === false || linked_block.confirmed == "false") return reject("Linked Block is unconfirmed from account " + linked_block.account)
        }
        const workDiff = work_validate(block.previous, block.work, base)
        console.info("Old multiplier: " + parseFloat(workDiff.multiplier).toFixed(2).toString(10))

        if (enable_max_difficulty && parseFloat(workDiff.multiplier) > parseFloat(max_difficulty)) return reject("Maximum difficulty exceeded")

        console.info("Generating Work...")
        await work_generate(block.previous, workDiff.difficulty)
            .then(async function (res) {
                const workDiff = work_validate(block.previous, res.work, base)
                console.info("New multiplier: " + workDiff.multiplier)
                let block_json = {
                    "type": "state",
                    "account": block.account,
                    "previous": block.previous,
                    "representative": block.representative,
                    "balance": block.balance,
                    "link": block.link,
                    "link_as_account": block.link_as_account,
                    "signature": block.signature,
                    "work": res.work
                }
                let republish = await broadcast(block_json)
                    .then((res) => {
                        console.info("Broadcasted: " + republish.hash)
                    })
                    .catch((err) => {
                        if (err == "Old block") {
                            console.info("Broadcasted: " + block.hash)
                        } else {
                            reject(err)
                        }
                    })

                // Await confirmation or reject with error
                process.stdout.write("Waiting for confirmation...")
                for (let i = 0; i < CHECK_CONFIRMATION_TRIES; i++) {
                    let blockStatus = await block_info(block.hash)
                        .catch((err) => {
                            console.log("")
                            reject(err)
                        })
                    if (blockStatus.confirmed === true || blockStatus.confirmed == "true") {
                        console.info("\nBlock confirmed!")
                        return resolve(block.hash)
                    }
                    process.stdout.write(".")
                    await sleep(CHECK_CONFIRMATION_SLEEP)
                }
                console.log("")
                reject()
            }).catch((err) => {
                reject(err)
            })
    })
}

async function findUnconfirmed(target_account) {
    console.info("Reading recent blocks...")
    const infoAccount = await account_info(target_account)
        .catch((err) => {
            console.error(err)
            process.exit()
        })
    let count = "5" //reads blocks every 50
    let last_confirmed = infoAccount.confirmation_height_frontier
    while (infoAccount.frontier != last_confirmed) {
        await account_history(target_account, count, true, last_confirmed)
            .then(async function (history) {
                delete history[0] // the first index is the last confirmed, we can delete it
                for (let index in history) {
                    let block_hash = history[index].hash
                    console.info("Checking Block: " + block_hash)
                    await block_info(block_hash)
                        .then(async function (block) {
                            if (block.confirmed === false || block.confirmed == "false") {
                                console.info("Block unconfirmed!")
                                await updateBlock(block)
                                    .then((hash) => {
                                        last_confirmed = hash
                                    })
                                    .catch((err) => {
                                        console.error(err)
                                        process.exit()
                                    })
                            } else {
                                console.info("Block already confirmed")
                            }
                        }).catch((err) => {
                            console.error(err)
                            process.exit()
                        })

                    console.log("")
                }
            }).catch((err) => {
                console.error("Error:")
                console.error(err)
            })
    }
    console.info("Finished")
}

//get user args input
const myArgs = process.argv.slice(2)
if (myArgs[0] == undefined || myArgs[0] == "") {
    console.error("Nano Account or Block Missing!")
    return
} else if (checkNanoAddress(myArgs[0])) {
    findUnconfirmed(myArgs[0])
} else if (checkHash(myArgs[0])) {
    block_info(myArgs[0])
        .then(async function (block) {
            if (block.confirmed === false || block.confirmed == "false") {
                console.info("Found: " + block.hash)
                await updateBlock(block)
                    .catch((err) => {
                        console.error(err)
                        process.exit()
                    })
            } else {
                console.info("Block already confirmed")
            }
        }).catch((err) => {
            console.error(err)
            process.exit()
        })
} else {
    console.error("Invalid Block or Nano Account!")
    return
}