const readlineSync = require('readline-sync');
const readline = require('readline');

const { checkNanoAddress, checkHash, checkAmount, checkPercentage, checkURL } = require("./check")
const { toRaws, toMegaNano } = require("./conversion")
const { parseNanoAddress } = require("./parse")

//import and check config.json
const { node, worker, min_pending_amount, enable_active_difficulty, enable_max_difficulty, max_difficulty_send, max_difficulty_receive } = require("../config.json")
let { min_consensus } = require("../config.json")
let config_errors = []
if (!checkURL(node)) config_errors.push("Invalid node")
if (!checkURL(worker)) config_errors.push("Invalid worker")
if (typeof (min_pending_amount) == "string" || typeof (min_pending_amount) == "number") {
    if (isNaN(min_pending_amount) || !checkAmount(toRaws(min_pending_amount))) config_errors.push("Invalid min_pending_amount")
} else {
    config_errors.push("Invalid enable_active_difficulty")
}
if (!checkPercentage(min_consensus)) config_errors.push("Invalid min_consensus")
if (typeof (enable_active_difficulty) != "boolean") config_errors.push("Invalid enable_active_difficulty")
if (typeof (enable_max_difficulty) != "boolean") config_errors.push("Invalid enable_max_difficulty")
if (isNaN(max_difficulty_send)) config_errors.push("Invalid max_difficulty_send")
if (isNaN(max_difficulty_receive)) config_errors.push("Invalid max_difficulty_receive")
if (config_errors.length) {
    console.error("Invalid config.json! Error: ")
    console.info(config_errors.join('\n'))
    process.exit()
}

const rpc = require("./rpc")
const { BASE_DIFFICULTY, BASE_DIFFICULTY_RECEIVE, work_validate } = require("./work")

const { checkUpdates } = require("./update")

//Wait up to 24 hours
const CHECK_CONFIRMATION_TRIES = 17280
const CHECK_CONFIRMATION_SLEEP = 5000 // ms

let SAFE_MODE = true

let FOLLOW = false //the user can change with --follow or by typing "A" when asked if he wants to follow
let CONFIRM_ALL_PENDING = false //the user can change with --all-pending or by typing "A" when asked 

let CONFIRMED_BLOCKS = []
let CONFIRMED_ACCOUNTS = []
let PARENT_ACCOUNTS = []

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isConfirmed(blockHash) {
    return new Promise((resolve, reject) => {
        rpc.block_info(blockHash)
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

function floatFormat(number) {
    number = parseFloat(number)
    if (Math.round(number) !== number) return number.toFixed(2);
    return number
}

function arrayEquals(a, b) {
    return Array.isArray(a) &&
        Array.isArray(b) &&
        a.length === b.length &&
        a.every((val, index) => b.includes(val));
}

function updateBlock(block, follow = FOLLOW, force = false, sync = false, use_difficulty = false) {
    return new Promise(async function (resolve, reject) {

        let base = BASE_DIFFICULTY, max_difficulty = max_difficulty_send
        if (block.subtype == "receive") {
            base = BASE_DIFFICULTY_RECEIVE
            max_difficulty = max_difficulty_receive

            // If the receiving link block is also not confirmed, the receiving block cannot be confirmed either
            if (!CONFIRMED_BLOCKS.includes(block.link)) {

                let linked_block = await rpc.block_info(block.link)
                    .catch((err) => {
                        reject(err)
                    })

                let confirmed = linked_block.confirmed === true || linked_block.confirmed == "true"

                if (linked_block.account != block.account && !CONFIRMED_ACCOUNTS.includes(linked_block.account) && !PARENT_ACCOUNTS.includes(linked_block.account) && (force !== false || !confirmed)) {
                    console.info("Linked Block " + linked_block.hash + " is unconfirmed from account " + linked_block.account)
                    PARENT_ACCOUNTS.push(block.account)
                    if (follow) {
                        console.info("Following...")
                    } else {
                        console.info("Do you want to follow this previous chain ?")
                        let answer = readlineSync.question('Y to yes, N to no, A to all: ');
                        while (answer.toUpperCase() != "Y" && answer.toUpperCase() != "N" && answer.toUpperCase() != "A") {
                            console.info("Invalid answer!")
                            answer = readlineSync.question('Enter Y to yes or N to no, A to all');
                        }
                        if (answer.toUpperCase() == "Y") {
                            console.info("Okay, following.")
                        } else if (answer.toUpperCase() == "A") {
                            console.info("Okay, following all.")
                            FOLLOW = true
                        } else if (answer.toUpperCase() == "N") {
                            return reject("Okay. Exiting now")
                        }
                    }

                    await findUnconfirmed({ account: linked_block.account, target_block: linked_block.hash, follow: follow, sync: sync, force: force })
                        .then((res) => {
                            console.info("\nReturning to parent chain: " + block.account + "\nBlock: " + block.hash)
                            PARENT_ACCOUNTS.splice(PARENT_ACCOUNTS.indexOf(block.account), 1)
                        }).catch((err) => {
                            reject(err)
                        })
                }
            }

        }

        await sleep(100) //awaits possible rejections

        console.info("Subtype: " + block.subtype)

        if (use_difficulty != false) block.work = use_difficulty.work

        let target_block_pow = block.previous
        if (block.previous == "0000000000000000000000000000000000000000000000000000000000000000") target_block_pow = parseNanoAddress(block.account).publicKey

        let old_workDiff = work_validate(target_block_pow, block.work, base)

        console.info("Old multiplier: " + parseFloat(old_workDiff.multiplier).toFixed(2).toString(10) + "x")

        if (enable_max_difficulty && parseFloat(old_workDiff.multiplier) > parseFloat(max_difficulty)) return reject("Maximum difficulty exceeded")

        let min_threshold = old_workDiff.difficulty

        //network difficulty
        if (enable_active_difficulty) {
            const activeDiff = await rpc.active_difficulty()
                .catch((err) => {
                    return reject(err)
                })

            let network_multiplier = parseFloat(activeDiff.multiplier)
            
            if (network_multiplier > old_workDiff.multiplier) {
                if (block.subtype == "receive") {
                    min_threshold = activeDiff.network_receive_current
                } else {
                    min_threshold = activeDiff.network_current

                }
                console.info("Using current Network multiplier: " + network_multiplier.toFixed(2))
            }
        }

        console.info("Generating Work...")
        let work_done = false
        rpc.work_generate(target_block_pow, min_threshold)
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
                let republish = await rpc.broadcast(block_json)
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

                console.log("")

                // Await confirmation consensus
                process.stdout.write("Waiting for confirmation in " + node)
                if (sync) {
                    process.stdout.write(" + " + floatFormat(min_consensus) + "% of public nodes")
                    console.info("...")
                } else {
                    process.stdout.write("...")
                }


                let total_valid = 0, already_confirmed = [], not_confirmed = rpc.nodes, check = false, default_confirmed = false
                if (not_confirmed.includes(node)) not_confirmed.splice(not_confirmed.indexOf(node), 1)

                for (let i = 0; i < CHECK_CONFIRMATION_TRIES; i++) {
                    if (sync) {

                        // If --sync is enabled, we expect confirmation of a certain percentage of the nodes (editable in config.json).
                        // Separately, we also wait for confirmation on the default node (editable in config.json)

                        if (!default_confirmed) {
                            check = await isConfirmed(block.hash)
                                .catch((err) => {
                                    console.error(err)
                                })
                            if (check == true) {
                                console.info(node + ": confirmed")
                                default_confirmed = true
                            }
                        }

                        check = await rpc.whereIsConfirmed(block.hash, function (msg) { console.info(msg) }, not_confirmed)
                            .catch((err) => {
                                reject(err)
                            })

                        if (check.confirmed.length) already_confirmed.push(...check.confirmed)

                        if (total_valid == 0) total_valid = check.confirmed.length + check.unconfirmed.length

                        let confirmed_percentage = 100 / (total_valid / already_confirmed.length)

                        if (confirmed_percentage >= min_consensus) {
                            process.stdout.write("\nBlock is confirmed in " + floatFormat(confirmed_percentage) + "% of public nodes.")
                            if (default_confirmed) process.stdout.write(" Also confirmed on the main node: " + node)
                            if (check.unconfirmed.length) process.stdout.write("\nUnconfirmed nodes: " + check.unconfirmed.join(" and "))
                            console.log("")
                            if (default_confirmed) {
                                CONFIRMED_BLOCKS.push(block.hash)
                                return resolve(block.hash)
                            } else {
                                process.stdout.write("Waiting for confirmation in default node: " + node + "...")
                                for (i = i + 1; i < CHECK_CONFIRMATION_TRIES; i++) {
                                    let check = await isConfirmed(block.hash)
                                        .catch((err) => {
                                            console.error(err)
                                        })
                                    if (check == true) {
                                        console.info("\n" + node + ": confirmed!")
                                        CONFIRMED_BLOCKS.push(block.hash)
                                        return resolve(block.hash)
                                    } else {
                                        process.stdout.write(".")
                                    }
                                }
                            }
                        } else {
                            if (!arrayEquals(not_confirmed, check.unconfirmed)) {
                                readline.cursorTo(process.stdout, 0);
                                process.stdout.write("Confirmed only in: " + floatFormat(confirmed_percentage) + "% of public nodes! Unconfirmed public nodes: " + check.unconfirmed.join(" and "))
                                if (!default_confirmed) process.stdout.write(". Also not confirmed on the main node: " + node)
                                process.stdout.write("...")
                                not_confirmed = check.unconfirmed
                            } else {
                                process.stdout.write(".")
                            }
                        }
                    } else {
                        let check = await isConfirmed(block.hash)
                            .catch((err) => {
                                console.error(err)
                            })
                        if (check == true) {
                            console.info(" Confirmed!")
                            CONFIRMED_BLOCKS.push(block.hash)
                            return resolve(block.hash)
                        } else {
                            process.stdout.write(".")
                        }
                    }
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
            //if the block is confirmed by the network, we cancel our PoW
            async function cancelWork() {
                let total_valid = 0, already_confirmed = [], not_confirmed = rpc.nodes, check = false, default_confirmed = false
                if (not_confirmed.includes(node)) not_confirmed.splice(not_confirmed.indexOf(node), 1)

                while (!work_done) {

                    if (sync) {

                        if (!default_confirmed) {
                            check = await isConfirmed(block.hash)
                                .catch((err) => {
                                    console.error(err)
                                })
                            if (check == true) default_confirmed = true
                        }

                        check = await rpc.whereIsConfirmed(block.hash, function (msg) { /* do nothing */ }, not_confirmed)
                            .catch((err) => {
                                reject(err)
                            })

                        if (check.confirmed.length) already_confirmed.push(...check.confirmed)
                        if (total_valid == 0) total_valid = check.confirmed.length + check.unconfirmed.length
                        let confirmed_percentage = 100 / (total_valid / already_confirmed.length)

                        if (confirmed_percentage >= min_consensus) {
                            if (default_confirmed) {
                                rpc.work_cancel(block.previous)
                                CONFIRMED_BLOCKS.push(block.hash)
                                console.info("Block is confirmed!")
                                return resolve(block.hash)
                            } else {
                                while (true){
                                    check = await isConfirmed(block.hash)
                                        .catch((err) => {
                                            console.error(err)
                                        })
                                    if (check == true) {
                                        rpc.work_cancel(block.previous)
                                        console.info("Block is confirmed!")
                                        CONFIRMED_BLOCKS.push(block.hash)
                                        return resolve(block.hash)
                                    }
                                    await sleep(CHECK_CONFIRMATION_SLEEP)
                                }
                            }
                        } else {
                            if (!arrayEquals(not_confirmed, check.unconfirmed)) not_confirmed = check.unconfirmed
                        }
                    } else {
                        let confirmed = await isConfirmed(block.hash)
                            .catch((err) => {
                                console.error(err)
                                reject(err)
                            })
                        if (confirmed == true) {
                            rpc.work_cancel(block.previous)
                            CONFIRMED_BLOCKS.push(block.hash)
                            console.info("Block is confirmed!")
                            return resolve(block.hash)
                        }
                        await sleep(CHECK_CONFIRMATION_SLEEP)
                    }
                }
            }
            cancelWork()
        }
    })
}

function findUnconfirmed(rec_options) {
    return new Promise(async function (resolve, reject) {
        let options = {
            account: rec_options.account,
            head_block: false,
            head_block_height: 0,
            head_block_previous: false,
            follow: false,
            sync: false,
            force: false,
            target_block: false,
            original_source: false
        }

        if ("head_block" in rec_options) options.head_block = rec_options.head_block
        if ("head_block_height" in rec_options) options.head_block_height = rec_options.head_block_height
        if ("head_block_previous" in rec_options) options.head_block_previous = rec_options.head_block_previous
        if ("follow" in rec_options) options.follow = rec_options.follow
        if ("sync" in rec_options) options.sync = rec_options.sync
        if ("force" in rec_options) options.force = rec_options.force
        if ("target_block" in rec_options) options.target_block = rec_options.target_block
        if ("original_source" in rec_options) options.original_source = rec_options.original_source

        let count = "50" //reads blocks every 50
        let use_difficulty = false
        let lowest = {}

        //define last confirmed block and height

        const infoAccount = await rpc.account_info(options.account)
            .catch((err) => {
                return reject(err)
            })

        let last_confirmed = infoAccount.confirmation_height_frontier
        let last_confirmed_height = infoAccount.confirmation_height

        if (options.head_block) {
            if (options.head_block_height == 0 || !options.head_block_previous) {
                const head_block_info = await rpc.block_info(options.head_block)
                    .catch((err) => {
                        reject(err)
                    })
                options.head_block_height = head_block_info.height
                options.head_block_previous = head_block_info.previous
            }

            last_confirmed = options.head_block_previous
            last_confirmed_height = options.head_block_height - 1
            if (last_confirmed_height < 0) last_confirmed_height = 0
        } else if (options.sync) {
            lowest = await rpc.lowest_frontier(options.account)
                .catch((err) => {
                    reject(err)
                })

            last_confirmed = lowest.block
            last_confirmed_height = lowest.height

            console.info("Lowest nodes " + lowest.nodes.join(" and "));

            if (lowest.block == "0000000000000000000000000000000000000000000000000000000000000000") {
                last_confirmed = false
                console.info("Last confirmed block: None!\n")
            } else {
                console.info("Last confirmed block: " + lowest.block)
            }
        }

        //if last confirmed block height is more recent than target block height, nothing to do
        if (options.target_block) {
            const target_block_info = await rpc.block_info(options.target_block)
                .catch((err) => {
                    reject(err)
                })
            if (parseInt(last_confirmed_height) >= parseInt(target_block_info.height)) {
                console.info("This sub chain is already confirmed")
                return resolve()
            }

        }

        console.info("Reading recent blocks...")
        let break_loop = false

        if (last_confirmed == "0000000000000000000000000000000000000000000000000000000000000000") last_confirmed = false

        while (infoAccount.frontier != last_confirmed && break_loop === false) {

            await rpc.account_history(options.account, count, true, last_confirmed)
                .then(async function (history) {

                    if (last_confirmed) history.splice(0, 1) //the first block is the last confirmed, we can ignore it

                    for (let index in history) {
                        let block_hash = history[index].hash
                        console.info("Checking Block: " + block_hash)

                        if (options.sync) {
                            use_difficulty = await rpc.higher_work(block_hash)
                                .catch((err) => reject(err))
                        }

                        let block = await rpc.block_info(block_hash)
                            .catch((err) => {
                                return reject("Error checking block: " + err)
                            })

                        let confirmed = block.confirmed === true || block.confirmed == "true"
                        let status = "confirmed"
                        if (!confirmed) status = "unconfirmed"

                        if (!CONFIRMED_BLOCKS.includes(block.hash) && (options.force !== false || !confirmed)) {

                            console.info("Status Local: " + status)

                            last_confirmed = await updateBlock(block, options.follow, options.force, options.sync, use_difficulty)
                                .catch((err) => {
                                    reject(err)
                                })

                            if (options.target_block == last_confirmed) {
                                console.info("Sub chain is confirmed")
                                break_loop = true
                                return resolve()
                            }

                        } else {
                            console.info("Block already confirmed")
                            last_confirmed = block.hash
                        }

                        console.log("")
                        await sleep(100) // awaits possible rejections
                    }
                }).catch((err) => {
                    if (typeof (err) == "string" && err.toLowerCase().includes("block not found")) {
                        reject("Block error: " + last_confirmed + " This node may not have its block yet or or there is a fork in your account. You can change the node in config.json")
                    } else {
                        reject(err)
                    }
                })
        }

        CONFIRMED_ACCOUNTS.push(rec_options.account)

        console.info("This account is up to date!")

        //try to confirm pending blocks only from the user's account
        if (options.original_source !== false) {
            await confirmPendingBlocks(options)
                .catch((err) => {
                    reject(err)
                })
        }

        console.info("Finished!")
        return resolve()
    })
}

async function confirmPendingBlocks(rec_options) {
    return new Promise(async function (resolve, reject) {
        let options = {
            account: rec_options.account,
            follow: false,
            sync: false,
            force: false,
        }

        if ("follow" in rec_options) options.follow = rec_options.follow
        if ("sync" in rec_options) options.sync = rec_options.sync
        if ("force" in rec_options) options.force = rec_options.force

        let pendingConfirmed = 0

        console.info("Searching for pending blocks...")

        const blocks = await rpc.pending_blocks(rec_options.account, toRaws(min_pending_amount))
            .catch((err) => {
                reject(err)
            })

        if (Object.keys(blocks).length > 0) {

            for (let blockHash in blocks) {
                console.info("\nPending Block Found: " + blockHash)
                let block = await rpc.block_info(blockHash)
                    .catch((err) => {
                        reject(err)
                    })
                let confirmed = block.confirmed === true || block.confirmed == "true"
                let status = "confirmed"
                let action = "reconfirm"
                if (!confirmed) {
                    status = "unconfirmed"
                    action = "confirm"
                }

                if (block.account != options.account && !CONFIRMED_ACCOUNTS.includes(block.account) && !CONFIRMED_BLOCKS.includes(blockHash) && (options.force !== false || !confirmed)) {
                    console.info("Status Local: " + status)
                    console.info("Amount: " + toMegaNano(block.amount) + " Nano")
                    if (CONFIRM_ALL_PENDING) {
                        console.info("Trying to " + action + "ing block from " + block.account)
                    } else {
                        console.info("Do you want to " + action + " this block ?")
                        let answer = readlineSync.question('Y to yes, N to no, A to all: ');
                        while (answer.toUpperCase() != "Y" && answer.toUpperCase() != "N" && answer.toUpperCase() != "A") {
                            console.info("Invalid answer!")
                            answer = readlineSync.question('Enter Y to yes or N to no, A to all');
                        }
                        if (answer.toUpperCase() == "Y") {
                            console.info("Okay, trying to " + action + "ing block from " + block.account)
                        } else if (answer.toUpperCase() == "A") {
                            console.info("Okay, trying to " + action + "ing all...")
                            console.info("Trying to " + action + "ing block from " + block.account)
                            CONFIRM_ALL_PENDING = true
                        } else if (answer.toUpperCase() == "N") {
                            console.info("Okay. Skipping")
                            continue
                        }
                    }

                    await findUnconfirmed({ account: block.account, target_block: block.hash, follow: options.follow, sync: options.sync, force: options.force })
                        .then((res) => {
                            pendingConfirmed += 1
                        })
                        .catch((err) => {
                            reject(err)
                        })

                } else {
                    console.info("Block already confirmed!")
                }
            }
            if (pendingConfirmed) {
                console.info(pendingConfirmed + " pending blocks confirmed. Open your wallet to receive them.")
            } else {
                console.info("No pending blocks confirmed.")
            }
        } else {
            console.info("No pending blocks found")
        }
        resolve()
    })
}

function printRecommendation() {
    console.info("Use: node src/index [nano_account] --sync --force --follow")
    console.info("Or use: node src/index --help")
}

function printHelp() {
    console.info('\
        Usage: node src/index [Nano account or block hash] [options...] \n\
            --sync : Gets the lowest frontier from a list of public nodes (nodes.txt) \n\
            --force : Forces reconfirmation of blocks \n\
            --follow : If a receiving block depends on another chain\'s confirmation, don\'t ask the user, automatically follows and confirms blocks from that chain. \n\
            --only-pending : Attempts to confirm only pending blocks (unpocketed) \n\
            --all-pending : When finding pending blocks (unpocketed), do not ask the user, try to confirm all \n\
        \n\ Examples: \n\
        (Recommended) Confirms all blocks in an account, including pendings, synchronizing with other nodes: \n\
            node src/index [nano_account] --sync --force --follow --all-pending \n\
        \n\
        Confirms all blocks in an account, starting from a specific block: \n\
            node src/index [nano_account] [head_block] --force --follow \n\
        \n\
        Confirms a specific block - only use this option if you are sure that all previous blocks are confirmed: \n\
            node src/index 311B4EF6724AE01E0B276A3219943A81C5C76378B581B2C1E6F946712C957699 --force --follow \n\
        \n\
        Attempts to confirm only pending blocks (unpocketed blocks), synchronizing with other nodes: \n\
            node src/index [nano_account] --only-pending  --all-pending --sync --force --follow \n\
    ')
}

async function main() {

    //check script updates
    if (SAFE_MODE) {
        await checkUpdates()
            .catch((err) => console.error(err))
    }

    //get user args input
    const myArgs = process.argv.slice(2)
    let options = { original_source: true }

    if (myArgs[0] == undefined && myArgs[0] == "") {
        console.error("Nano Account or Block Missing!")
        printRecommendation()
        process.exit()
    } else if (checkNanoAddress(myArgs[0])) {

        options.account = myArgs[0]

        let secondary_args = myArgs.slice(1)

        let only_pending = false

        for (i = 0; i < secondary_args.length; i++) {
            if (checkHash(secondary_args[i])) {
                if (options.sync) {
                    console.info("Note: When you use a block as a parameter and --sync simultaneously, the script will only use the lowest_frontier of other nodes to synchronize other accounts in your receiving blocks")
                }
                options.head_block = secondary_args[i]
                if (SAFE_MODE) {
                    console.info("Checking previous block...")
                    const head_block_info = await rpc.block_info(options.head_block)
                        .catch((err) => {
                            console.error(err)
                            process.exit()
                        })
                    if (head_block_info.account != myArgs[0]) {
                        console.error("The block does not belong to this account!")
                        printRecommendation()
                        process.exit()
                    }
                    if (head_block_info.previous != "0000000000000000000000000000000000000000000000000000000000000000") {
                        options.head_block_height = head_block_info.height
                        options.head_block_previous = head_block_info.previous
                        const previous_block_info = await rpc.block_info(head_block_info.previous)
                            .catch((err) => {
                                console.error(err)
                                process.exit()
                            })
                        if (previous_block_info.confirmed === false || previous_block_info.confirmed == "false") {
                            console.error("The previous block is not confirmed!")
                            console.info("Only use blocks as arguments if you are sure that the previous one is confirmed. If you're not sure, use this command: ")
                            console.info("node src/index " + previous_block_info.account + " --sync --force --follow")
                            console.info("Or use: node src/index --help")
                            process.exit()
                        }
                    } else {
                        console.info("No previous, this block opened the account.")
                    }

                }
            } else if (secondary_args[i] == "--sync") {
                if (options.head_block) {
                    console.info("Note: When you use a block as a parameter and --sync simultaneously, the script will only use the lowest_frontier of other nodes to synchronize other accounts in your receiving blocks")
                }
                options.sync = true
            } else if (secondary_args[i] == "--follow") {
                options.follow = true
            } else if (secondary_args[i] == "--force") {
                options.force = true
            } else if (secondary_args[i] == "--all-pending") {
                CONFIRM_ALL_PENDING = true
            } else if (secondary_args[i] == "--only-pending") {
                only_pending = true
            } else if (secondary_args[i] == "--min-consensus"){
                i++
                let percentage = Number(secondary_args[i].toString().replace(/%/g, ''))
                if (checkPercentage(percentage)){
                    min_consensus = percentage
                } else {
                    console.error("Invalid consensus percentage! Use an integer value from 0 to 100")
                    console.info("Example: --min-consensus 90")
                    process.exit()
                }
            } else {
                console.error("Invalid arg: " + secondary_args[i])
                printRecommendation()
                process.exit()
            }
        }

        if (only_pending) {
            confirmPendingBlocks(options)
                .catch((err) => {
                    console.error(err)
                    process.exit()
                })
        } else {
            findUnconfirmed(options)
                .catch((err) => {
                    console.error(err)
                    process.exit()
                })
        }

    } else if (checkHash(myArgs[0])) {
        let force = false
        let sync = false

        let secondary_args = myArgs.slice(1)

        for (let i in secondary_args) {
            if (secondary_args[i] == "--force") {
                force = true
            } else if (secondary_args[i] == "--follow") {
                FOLLOW = true
            } else if (secondary_args[i] == "--sync") {
                console.info("Note: When you use a block as a parameter and --sync simultaneously, the script will only use the lowest_frontier of other nodes to synchronize other accounts in your receiving blocks")
                sync = true
            } else {
                console.error("Invalid arg: " + secondary_args[i])
                printRecommendation()
                process.exit()
            }
        }

        console.info("Reading block...")
        const block = await rpc.block_info(myArgs[0])
            .catch((err) => {
                console.error(err)
                process.exit()
            })
        if (SAFE_MODE && block.previous != "0000000000000000000000000000000000000000000000000000000000000000") {
            console.info("Checking previous block...")
            const current_block = await rpc.block_info(myArgs[0])
                .catch((err) => {
                    console.error(err)
                    process.exit()
                })

            const previous_block = await rpc.block_info(current_block.previous)
                .catch((err) => {
                    console.error(err)
                    process.exit()
                })

            if (previous_block.confirmed === false || previous_block.confirmed == "false") {
                console.error("The previous block is not confirmed!")
                console.info("Only use blocks as arguments if you are sure that the previous one is confirmed. If you're not sure, use this command: ")
                console.info("node src/index " + previous_block.account + " --sync --force --follow")
                console.info("Or use: node src/index --help")
                process.exit()
            }
        }
        if (!CONFIRMED_BLOCKS.includes(block.hash) && (force === true || block.confirmed === false || block.confirmed == "false")) {
            console.info("Found: " + block.hash)
            await updateBlock(block, FOLLOW, force, sync)
                .catch((err) => {
                    console.error(err)
                    process.exit()
                })
        } else {
            console.info("Block already confirmed")
        }
    } else if (myArgs[0] == "--help") {
        printHelp()
    } else {
        console.error("Missing commands!")
        printRecommendation()
        process.exit()
    }
}

main()
