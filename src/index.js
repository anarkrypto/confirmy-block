const { work_validate } = require("./work")
const { account_history, work_generate, block_info, broadcast } = require("./rpc")
const { BASE_DIFFICULTY, BASE_DIFFICULTY_RECEIVE, max_difficulty_send, max_difficulty_receive } = require("./work")
const { checkNanoAddress, checkIndex, checkHash } = require("./check")

function updateBlock(block, target_block) {
    return new Promise(async function (resolve, reject) {

        console.log("Subtype: " + block.subtype)

        let base = BASE_DIFFICULTY, max_difficulty = max_difficulty_send
        if (block.subtype == "receive") {
            base = BASE_DIFFICULTY_RECEIVE
            max_difficulty = max_difficulty_receive

            //if the receiving link unit is also not confirmed, the receiving unit cannot be confirmed either
            //In the future we can try to confirm it before
            let link_block = await block_info(block.link)
                .catch((err) => {
                    return reject(err)
                })
            if (link_block.confirmed === false || block.confirmed == "false") return reject("Linked Block is unconfirmed")
        }
        const workDiff = work_validate(block.previous, block.work, base)
        console.log("Old multiplier: " + parseFloat(workDiff.multiplier).toFixed(2).toString(10))

        if (parseFloat(workDiff.multiplier) > max_difficulty) return reject("Maximum difficulty exceeded")

        work_generate(block.previous, workDiff.difficulty)
            .then(async function (res) {
                const workDiff = work_validate(block.previous, res.work, base)
                console.log("New multiplier: " + workDiff.multiplier)
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
                broadcast(block_json)
                    .then((res) => {
                        console.log(res)
                        resolve()
                    }).catch((err) => {
                        reject(err)
                    })
            }).catch((err) => {
                reject(err)
            })
    })
}

function findUnconfirmed(target_account, target_count, target_block) {
    account_history(target_account, target_count, false)
        .then(async function (history) {
            console.log("Reading the " + history.length + " recent blocks")
            let index = 0
            for (let n in history) {
                index = (history.length - 1) - n
                let block_hash = history[index].hash
                console.log("Index: " + index)
                await block_info(block_hash)
                    .then(async function (block) {
                        if (block.confirmed === false || block.confirmed == "false" || block.hash == target_block) {
                            console.log("Found: " + block.hash)
                            await updateBlock(block, target_block)
                                .catch((err) => {
                                    if (err == "Old block") {
                                        console.info("Broadcasted: " + block.hash)
                                    } else {
                                        console.error(err)
                                    }
                                })
                        }
                    }).catch((err) => {
                        console.error(err)
                    })
                console.log("")
            }
            console.log("Finished")
        }).catch((err) => {
            console.error("Error:")
            console.error(err)
        })

}

const myArgs = process.argv.slice(2)
let target_account = ""
let target_count = "1000"
let target_block = ""

if (myArgs[0] == undefined || myArgs[0] == ""){
    console.error("Nano Account Missing!")
    return
} else if (checkNanoAddress(myArgs[0])){
    target_account = myArgs[0]
} else {
    console.error("Invalid Nano Account!")
    return
}

if (myArgs[1] != undefined || myArgs[1] == ""){
    target_count = parseInt(myArgs[1])
    if (!checkIndex(target_count)){
        console.error("Invalid Count Index!")
        return
    }
}

if (myArgs[2] != undefined || myArgs[2] == ""){
    if (checkHash(myArgs[2])){
        target_block = myArgs[2]
    } else {
        console.error("Invalid Block!")
        return
    }
}

findUnconfirmed(target_account, target_count, target_block)