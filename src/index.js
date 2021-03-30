const readlineSync = require('readline-sync');
const { account_info, account_history, block_info, work_generate, work_cancel, broadcast, active_difficulty, lowest_frontier } = require("./rpc")
const { BASE_DIFFICULTY, BASE_DIFFICULTY_RECEIVE, work_validate, threshold_to_multiplier } = require("./work")
const { checkNanoAddress, checkHash } = require("./check")
const { enable_active_difficulty, enable_max_difficulty, max_difficulty_send, max_difficulty_receive } = require("../config.json")
const { parseNanoAddress } = require("./keys")

//Wait up to 24 hours
const CHECK_CONFIRMATION_TRIES = 17280
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

function updateBlock(block, follow = FOLLOW, force = false, sync = false) {
    return new Promise(async function (resolve, reject) {

        let base = BASE_DIFFICULTY, max_difficulty = max_difficulty_send
        if (block.subtype == "receive") {
            base = BASE_DIFFICULTY_RECEIVE
            max_difficulty = max_difficulty_receive

            // If the receiving link block is also not confirmed, the receiving block cannot be confirmed either
            let linked_block = await block_info(block.link)
                .catch((err) => {
                    reject(err)
                })

            if (linked_block.account != block.account && (force !== false || linked_block.confirmed === false || linked_block.confirmed == "false")) {
                console.info("Linked Block " + linked_block.hash + " is unconfirmed from account " + linked_block.account)
                if (follow) {
                    console.info("Following...")
                    await findUnconfirmed({ account: linked_block.account, target_block: linked_block.hash, follow: follow, sync: sync, force: force })
                        .then((res) => {
                            console.info("\nReturning to parent chain: " + block.account + "\nBlock: " + block.hash)

                        })
                        .catch((err) => {
                            reject(err)
                        })
                } else {
                    console.info("Do you want to follow this previous chain ?")
                    let answer = readlineSync.question('Y to yes, N to no, A to all: ');
                    while (answer.toUpperCase() != "Y" && answer.toUpperCase() != "N" && answer.toUpperCase() != "A") {
                        console.info("Invalid answer!")
                        answer = readlineSync.question('Enter Y to yes or N to no, A to all');
                    }
                    if (answer.toUpperCase() == "Y") {
                        console.info("Okay, following.")
                        await findUnconfirmed({ account: linked_block.account, target_block: linked_block.hash, follow: follow, sync: sync, force: force })
                            .then((res) => {
                                console.info("\nReturning to parent chain: " + block.account + "\nBlock: " + block.hash)

                            })
                            .catch((err) => {
                                reject(err)
                            })
                    } else if (answer.toUpperCase() == "A") {
                        console.info("Okay, following all.")
                        FOLLOW = true
                        await findUnconfirmed({ account: linked_block.account, target_block: linked_block.hash, follow: follow, sync: sync, force: force })
                            .then((res) => {
                                console.info("\nReturning to parent chain: " + block.account + "\nBlock: " + block.hash)

                            })
                            .catch((err) => {
                                reject(err)
                            })
                    } else if (answer.toUpperCase() == "N") {
                        return reject("Okay. Exiting now")
                    }
                }
            }
        }

        await sleep(100)

        console.info("Subtype: " + block.subtype)

        let target_block_pow = block.previous
        if (block.previous == "0000000000000000000000000000000000000000000000000000000000000000") target_block_pow = parseNanoAddress(block.account).publicKey

        const old_workDiff = work_validate(target_block_pow, block.work, base)
        console.info("Old multiplier: " + parseFloat(old_workDiff.multiplier).toFixed(2).toString(10) + "x")

        if (enable_max_difficulty && parseFloat(old_workDiff.multiplier) > parseFloat(max_difficulty)) return reject("Maximum difficulty exceeded")

        let target_workDiff = old_workDiff.difficulty

        //network difficulty
        if (enable_active_difficulty) {
            const activeDiff = await active_difficulty()
                .catch((err) => {
                    return reject(err)
                })

            let network_multiplier = "1.0"

            if (block.subtype == "receive") {
                network_multiplier = threshold_to_multiplier(BigInt('0x' + activeDiff.network_receive_current), BigInt('0x' + base))
                if (network_multiplier > target_workDiff) {
                    target_workDiff = activeDiff.network_receive_minimum
                    console.info("Using current Network multiplier: " + network_multiplier.toFixed(2))
                }
            } else {
                network_multiplier = threshold_to_multiplier(BigInt('0x' + activeDiff.network_current), BigInt('0x' + base))
                if (network_multiplier > target_workDiff) {
                    target_workDiff = activeDiff.network_receive_minimum
                    console.info("Using current Network multiplier: " + network_multiplier.toFixed(2))
                }
            }
        }

        console.info("Generating Work...")
        let work_done = false
        work_generate(target_block_pow, target_workDiff)
            .then(async function (res) {
                work_done = true
                const new_workDiff = work_validate(target_block_pow, res.work, base)
                console.info("Work done! New multiplier: " + parseFloat(new_workDiff.multiplier).toFixed(2).toString(10) + "x")
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

                console.info("Broadcasting...")
                let republish = await broadcast(block_json)
                    .then((res) => {
                        console.info("Broadcasted: " + block.hash)
                    })
                    .catch((err) => {
                        if (err == "Old block") {
                            console.info("Broadcasted: " + block.hash)
                        } else {
                            return reject(err)
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
                return reject("Time out without confirmation")
            }).catch((err) => {
                if (err == "Cancelled") {
                    return resolve(block.hash)
                } else {
                    return reject(err)
                }
            })

        if (!force) {
            //if the confirmation is confirmed by the network, we cancel our PoW
            while (!work_done) {
                let confirmed = await isConfirmed(block.hash)
                    .catch((err) => {
                        console.error(err)
                        rreject(err)
                    })
                if (confirmed == true) {
                    work_cancel(block.previous)
                    console.info("Block is confirmed!")
                    return resolve(block.hash)
                }
                await sleep(CHECK_CONFIRMATION_SLEEP)
            }
        }
    })
}

function findUnconfirmed(rec_options) {
    return new Promise(async function (resolve, reject) {
        let options = {
            account: rec_options.account,
            head_block: false,
            follow: false,
            sync: false,
            force: false,
            target_block: false,
            sync_default_node: false
        }

        if ("head_block" in rec_options) options.head_block = rec_options.head_block
        if ("follow" in rec_options) options.follow = rec_options.follow
        if ("sync" in rec_options) options.sync = rec_options.sync
        if ("force" in rec_options) options.force = rec_options.force
        if ("target_block" in rec_options) options.target_block = rec_options.target_block
        if ("sync_default_node" in rec_options) options.sync_default_node = rec_options.sync_default_node

        let count = "50" //reads blocks every 50

        if (options.sync) {
            options.head_block = await lowest_frontier(options.account)
                .catch((err) => {
                    reject(err)
                })
        }

        const infoAccount = await account_info(options.account)
            .catch((err) => {
                return reject(err)
            })
        let last_confirmed = infoAccount.confirmation_height_frontier
        if (options.head_block !== false) last_confirmed = options.head_block

        console.info("Reading recent blocks...")
        let first = true
        let break_loop = false
        while (infoAccount.frontier != last_confirmed && break_loop === false) {

            if (last_confirmed == "0000000000000000000000000000000000000000000000000000000000000000") last_confirmed = false
            
            await account_history(options.account, count, true, last_confirmed)
                .then(async function (history) {

                    for (let index in history) {
                        let block_hash = history[index].hash
                        console.info("Checking Block: " + block_hash)

                        let block = await block_info(block_hash)
                            .catch((err) => {
                                return reject("Error checking block: " + err)
                            })

                        let confirmed = true
                        if(block.confirmed === false || block.confirmed == "false") confirmed = false

                        if (options.force !== false || !confirmed) {

                            if (!options.head_block || !confirmed) console.info("Block unconfirmed!")

                            // The first block is the last confirmed according to public nodes
                            // If it is not confirmed in the default node (config.json), we must reconfirm it
                            // And also reconfirm all previous blocks if necessary
                            if (first === true && options.sync_default_node === false && block.previous != "0000000000000000000000000000000000000000000000000000000000000000") {
                                if (block.confirmed === false || block.confirmed == "false") {
                                    console.info("Synchronizing Node....")
                                    first = block.hash
                                    while ((block.confirmed === false || block.confirmed == "false") && block.previous != "0000000000000000000000000000000000000000000000000000000000000000") {
                                        console.info("Rewinding 1 block...")

                                        block = await block_info(block.previous)
                                            .catch((err) => {
                                                return reject("Error checking block: " + err)
                                            })

                                    }
                                    await findUnconfirmed({ account: block.account, head_block: block.hash, target_block: first, follow: options.follow, sync_default_node: true })
                                        .catch((err) => {
                                            return reject(err)
                                        })

                                } else {
                                    console.info("Already confirmed")
                                }
                            } else {
                                
                                last_confirmed = await updateBlock(block, options.follow, options.force, options.sync)
                                    .catch((err) => {
                                        reject(err)
                                    })

                            }

                            first = false

                            if (options.target_block == last_confirmed) {
                                console.info("Sub chain is confirmed")
                                break_loop = true
                                return resolve()
                            }

                        } else {
                            console.info("Block already confirmed")
                        }

                        console.log("")
                        await sleep(100)
                    }
                }).catch((err) => {
                    if (err.toLowerCase().includes("block not found")) {
                        reject("Block error: " + last_confirmed + " This node may not have its block yet or or there is a fork in your account. You can change the node in config.json")
                    } else {
                        reject(err)
                    }
                })
        }
        console.info("Finished! This account is up to date.")
        return resolve()
    })
}

let FOLLOW = false

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
                process.exit()
            }
        }

        await findUnconfirmed(options)
            .catch((err) => {
                console.error(err)
                process.exit()
            })

    } else if (checkHash(myArgs[0])) {
        let force = false
        let sync = false

        let seconds_args = myArgs.slice(1)

        for (let i in seconds_args) {
            if (seconds_args[i] == "--force") {
                force = true
            } else if (seconds_args[i] == "--follow") {
                FOLLOW = true
            } else if (seconds_args[i] == "--sync") {
                sync = true
            } else {
                console.error("Invalid arg: " + seconds_args[i])
                process.exit()
            }
        }

        await block_info(myArgs[0])
            .then(async function (block) {
                if (force === true || block.confirmed === false || block.confirmed == "false") {
                    console.info("Found: " + block.hash)
                    await updateBlock(block, follow, force, sync)
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