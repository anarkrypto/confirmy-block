const semver = require('semver')
const axios = require("axios")

const fs = require('fs');
const path = require('path')

const local_package = require("../package.json")

const check_log_file = path.join(__dirname, "./data/check_update.json")

const check_log = require(check_log_file)

const TIME_DELAY = 60 * 60 //1 hour

function updateFile(file, data){
    try {
        const dataJSON = JSON.stringify(data, null, 2)
        const write = fs.writeFileSync(file, dataJSON)
        return write
    } catch (err) {
        console.error("Failed Upating File " + file)
        throw new Error(err)
    }
}

exports.checkUpdates = function () {
    return new Promise((resolve, reject) => {
        if (check_log.last_check != 0 && parseInt(Date.now() / 1000) < ( check_log.last_check + TIME_DELAY) ) return resolve()
        console.info("Checking confirmy-block updates...")
        axios.get("https://raw.githubusercontent.com/anarkrypto/confirmy-block/main/package.json")
            .then((res) => {

                if (typeof (res.data) !== "object") return reject("Invalid remote package data: Invalid JSON!")

                const remote_package = res.data

                if (!("version" in remote_package)) return reject("Invalid remote package data: Version not found!")

                console.log("Last Check: " + check_log.last_check)

                check_log.last_check = parseInt(Date.now() / 1000)
                updateFile(check_log_file, check_log)

                if (semver.lt(local_package.version, remote_package.version)) {
                    console.info("New version of the Confirmy-Block script available: " + remote_package.version)
                    console.info("See the changes in: https://github.com/anarkrypto/confirmy-block/releases")
                    console.info("You can update with command: git pull --force")
                    process.exit()
                } else {
                    console.info("Already up to date!")
                }

                resolve()

            })
            .catch((err) => {
                if (err.response) {
                    reject(err.response.data);
                } else if (err.request) {
                    reject("no response from github");
                } else {
                    reject('Error', err.message);
                }
            })

    })
}