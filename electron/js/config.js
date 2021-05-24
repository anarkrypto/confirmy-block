const fs = require('fs');
const path = require('path');

const configFilePath = path.join(__dirname, "../config.json")
let configJson = require(configFilePath)

exports.updateConfig = function (data) {
    console.log(configJson)
    return new Promise((resolve, reject) => {
        try {
            for (let key in data) {
                if (configJson.hasOwnProperty(key)) {
                    configJson[key] = data[key]
                } else {
                    return reject("Invalid key: " + key)
                }
            }
            const write = fs.writeFileSync(configFilePath, JSON.stringify(configJson, null, 2))
            resolve(write)
        } catch (err) {
            reject(err)
        }
    })
}