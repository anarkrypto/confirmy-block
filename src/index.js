const readlineSync = require('readline-sync');
const { work_validate } = require("./work")
const { account_info, account_history, block_info, work_generate, work_cancel, broadcast, lowest_frontier } = require("./rpc")
const { BASE_DIFFICULTY, BASE_DIFFICULTY_RECEIVE } = require("./work")
const { checkNanoAddress, checkHash } = require("./check")
const { enable_max_difficulty, max_difficulty_send, max_difficulty_receive } = require("../config.json")
const { parseNanoAddress } = require("./keys")

const CHECK_CONFIRMATION_TRIES = 720
const CHECK_CONFIRMATION_SLEEP = 5000 // ms

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isConfirmed(blockHash) {
    return new Promise((resolve, reject) => {
        block_info(blockHash)
            .then((res) => {
                if (res.confirmed === true || res.confirmed == "true") {
                    resolve(true)
                } else {
                    resolve(false)
                }
            })
            .catch((err) => {
                reject(err)
            })
    })
}

function updateBlock(block, follow = false, force = false) {
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
            if (linked_block.account != block.account && linked_block.confirmed === false || linked_block.confirmed == "false") {
                console.info("Linked Block is unconfirmed from account " + linked_block.account)
                if (follow) {
                    console.info("Following...")
                    await findUnconfirmed({ account: linked_block.account, follow: follow, sync: true, force: true})
                } else {
                    console.info("Do you want to follow this previous chain ?")
                    let answer = readlineSync.question('Y to yes, N to no, A to all: ');
                    while (answer.toUpperCase() != "Y" && answer.toUpperCase() != "N" && answer.toUpperCase() != "A") {
                        console.info("Invalid answer!")
                        answer = readlineSync.question('Enter Y to yes or N to no, A to all');
                    }
                    if (answer.toUpperCase() == "Y") {
                        console.log("Okay, following.")
                        await findUnconfirmed({ account: linked_block.account, follow: follow, sync: true, force: true})
                            .catch((err) => {
                                return reject(err)
                            })
                    } else if (answer.toUpperCase() == "A") {
                        console.log("Okay, following all.")
                        follow = true
                        await findUnconfirmed({ account: linked_block.account, follow: follow, sync: true, force: true })
                            .catch((err) => {
                                return reject(err)
                            })
                    } else if (answer.toUpperCase() == "N") {
                        return reject("Okay. Exiting now")
                    }
                }
            }
        }

        let target_block_pow = block.previous
        if (block.previous == "0000000000000000000000000000000000000000000000000000000000000000") target_block_pow = parseNanoAddress(block.account).publicKey

        const workDiff = work_validate(target_block_pow, block.work, base)
        console.info("Old multiplier: " + parseFloat(workDiff.multiplier).toFixed(2).toString(10) + "x")

        if (enable_max_difficulty && parseFloat(workDiff.multiplier) > parseFloat(max_difficulty)) return reject("Maximum difficulty exceeded")

        console.info("Generating Work...")
        let work_done = false
        work_generate(target_block_pow, workDiff.difficulty)
            .then(async function (res) {
                work_done = true
                const workDiff = work_validate(target_block_pow, res.work, base)
                console.info("New multiplier: " + parseFloat(workDiff.multiplier).toFixed(2).toString(10) + "x")
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
                        console.info("Broadcasted: " + block.hash)
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
                    let confirm = await isConfirmed(block.hash)
                        .catch((err) => {
                            console.error(err)
                        })
                    if (confirm == true) {
                        console.info("\nBlock confirmed!")
                        return resolve(block.hash)
                    }
                    process.stdout.write(".")
                    await sleep(CHECK_CONFIRMATION_SLEEP)
                }
                console.log("")
                reject("Time out without confirmation")
            }).catch((err) => {
                if (err == "Cancelled") {
                    resolve(block.hash)
                } else {
                    reject(err)
                }
            })

        if (!force) {
            //if the confirmation is confirmed by the network, we cancel our PoW
            while (!work_done) {
                let confirmed = await isConfirmed(block.hash)
                    .catch((err) => {
                        console.error(err)
                    })
                if (confirmed == true) {
                    work_cancel(block.previous)
                    console.info("\nBlock is confirmed!")
                    return resolve(block.hash)
                }
                await sleep(CHECK_CONFIRMATION_SLEEP)
            }
        }
    })
}

async function findUnconfirmed(rec_options) {

    let options = {
        account: rec_options.account,
        head_block: false,
        follow: false,
        sync: false,
        force: false
    }

    if ("head_block" in rec_options) options.head_block = rec_options.head_block
    if ("follow" in rec_options) options.follow = rec_options.follow
    if ("sync" in rec_options) options.sync = rec_options.sync
    if ("force" in rec_options) options.force = rec_options.force

    let count = "50" //reads blocks every 50

    if (options.sync) {
        options.head_block = await lowest_frontier(options.account)
            .catch((err) => {
                console.error(err)
                process.exit()
            })
    }

    const infoAccount = await account_info(options.account)
        .catch((err) => {
            console.error(err)
            process.exit()
        })
    let last_confirmed = infoAccount.confirmation_height_frontier
    if (options.head_block !== false) last_confirmed = options.head_block

    console.info("Reading recent blocks...")
    while (infoAccount.frontier != last_confirmed) {
        await account_history(options.account, count, true, last_confirmed)
            .then(async function (history) {
                if (options.head_block === false || options.sync) delete history[0] // the first index is the last confirmed, we can delete it
                for (let index in history) {
                    let block_hash = history[index].hash
                    console.info("Checking Block: " + block_hash)

                    await block_info(block_hash)
                        .then(async function (block) {
                            if (options.force !== false || (block.confirmed === false || block.confirmed == "false")) {
                                if (!options.head_block) console.info("Block unconfirmed!")

                                last_confirmed = await updateBlock(block, options.follow, options.sync)
                                    .catch((err) => {
                                        console.error(err)
                                        process.exit()
                                    })

                            } else {
                                console.info("Block already confirmed")
                            }
                        }).catch((err) => {
                            console.error("Error checking block: " + err)
                            process.exit()
                        })

                    console.log("")
                }
            }).catch((err) => {
                console.error(err)
                if (err == "Block not found") {
                    console.info("This node may not have its block yet or or there is a fork in your account. You can change the node in config.json")
                }
                process.exit()
            })
    }
    console.info("Finished! This account is up to date.")
}

async function main() {
    //get user args input
    const myArgs = process.argv.slice(2)
    let options = {}

    if (myArgs[0] == undefined && myArgs[0] == "") {
        console.error("Nano Account or Block Missing!")
        return
    } else if (checkNanoAddress(myArgs[0])) {

        options.account = myArgs[0]

        let seconds_args = myArgs.slice(1)

        for (let i in seconds_args) {
            if (checkHash(seconds_args[i])) {
                options.head_block = seconds_args[i]
            } else if (seconds_args[i] == "--sync") {
                options.sync = true
            } else if (seconds_args[i] == "--follow") {
                options.follow = true
            } else if (seconds_args[i] == "--force") {
                options.force = true
            } else {
                console.error("Invalid arg: " + seconds_args[i])
            }
        }

        findUnconfirmed(options)

    } else if (checkHash(myArgs[0])) {
        let force = false
        let follow = false

        let seconds_args = myArgs.slice(1)

        for (let i in seconds_args) {
            if (seconds_args[i] == "--force") {
                force = true
            } else if (seconds_args[i] == "--follow") {
                follow = true
            } else {
                console.error("Invalid arg: " + seconds_args[i])
            }
        }

        block_info(myArgs[0])
            .then(async function (block) {
                if (force === true || block.confirmed === false || block.confirmed == "false") {
                    console.info("Found: " + block.hash)
                    await updateBlock(block, follow, force)
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
}

main()