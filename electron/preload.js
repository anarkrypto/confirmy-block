// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const { ipcRenderer } = require('electron')
const axios = require("axios")
const { spawn } = require('child_process')
const fs = require("fs")
const path = require('path');
const { exit } = require("process")

let config = require("./config.json")
const rpc = require("./src/rpc")
const { updateConfig } = require("./js/config")
const { toMegaNano } = require('./src/conversion')
const { findUnconfirmed, safeUpdateConsole } = require('./src/index')

const dataTest = {
  difficulty: "fffffff800000000",
  account: "nano_37f4cm1tu94tteodph6xwwnoowhiae3q483kgfwzd75ns7tbp9uknot4qihe",
  blockHash: "E4BC872672228364385DC4CDFA787CD3B662A5C3667FA7A31A3CF6EE4210AEBE",
  blockContent: {
    "type": "state",
    "account": "nano_37f4cm1tu94tteodph6xwwnoowhiae3q483kgfwzd75ns7tbp9uknot4qihe",
    "previous": "0000000000000000000000000000000000000000000000000000000000000000",
    "representative": "nano_1x7biz69cem95oo7gxkrw6kzhfywq4x5dupw4z1bdzkb74dk9kpxwzjbdhhs",
    "balance": "3140000000000000000000000000000",
    "link": "D8E230A48E60F9B7B6F4467291C31EBD7BEC1C96354E3846DFB1E6B505D97091",
    "link_as_account": "nano_3p9484kawr9spyuhajmkk93jxhduxigbefcg935fzeh8pn4xkw6jiodmu19j",
    "signature": "5FABA583F5F31D11A89E69DE39CD3C787B663E7EC10004A0E7EAB853537DFAC118EE2B6331F7A9F3B231EED9657641A6B575789719E414F2C9553BE956C65605",
    "work": "88708f11aa27f599"
  }
}

function mySelects(onclickCallback) {
  var x, i, j, l, ll, selElmnt, a, b, c;
  /* Look for any elements with the class "custom-select": */
  x = document.getElementsByClassName("custom-select");
  l = x.length;
  for (i = 0; i < l; i++) {
    selElmnt = x[i].getElementsByTagName("select")[0];
    ll = selElmnt.length;
    /* For each element, create a new DIV that will act as the selected item: */
    a = document.createElement("DIV");
    a.setAttribute("class", "select-selected");
    a.innerHTML = selElmnt.options[selElmnt.selectedIndex].innerHTML;
    x[i].appendChild(a);
    /* For each element, create a new DIV that will contain the option list: */
    b = document.createElement("DIV");
    b.setAttribute("class", "select-items select-hide scrolly");
    for (j = 1; j < ll; j++) {
      /* For each option in the original select element,
      create a new DIV that will act as an option item: */
      c = document.createElement("DIV");
      c.setAttribute("class", "s-item");
      c.setAttribute("data", selElmnt.options[j].innerHTML);
      c.innerHTML = selElmnt.options[j].innerHTML;
      c.addEventListener("click", function (e) {
        /* When an item is clicked, update the original select box,
        and the selected item: */
        var y, i, k, s, h, sl, yl;
        s = this.parentNode.parentNode.getElementsByTagName("select")[0];
        sl = s.length;
        h = this.parentNode.previousSibling;
        for (i = 0; i < sl; i++) {
          if (s.options[i].innerHTML == this.innerHTML) {
            s.selectedIndex = i;
            h.innerHTML = this.innerHTML;
            y = this.parentNode.getElementsByClassName("same-as-selected");
            yl = y.length;
            for (k = 0; k < yl; k++) {
              y[k].removeAttribute("class");
            }
            this.setAttribute("class", "same-as-selected");
            break;
          }
        }
        h.click();
      });
      b.appendChild(c);
    }
    x[i].appendChild(b);
    a.addEventListener("click", function (e) {
      /* When the select box is clicked, close any other select boxes,
      and open/close the current select box: */
      e.stopPropagation();
      closeAllSelect(this);
      this.nextSibling.classList.toggle("select-hide");
      this.classList.toggle("select-arrow-active");
      onclickCallback(this.innerText)
    });
  }

  function closeAllSelect(elmnt) {
    /* A function that will close all select boxes in the document,
    except the current select box: */
    var x, y, i, xl, yl, arrNo = [];
    x = document.getElementsByClassName("select-items");
    y = document.getElementsByClassName("select-selected");
    xl = x.length;
    yl = y.length;
    for (i = 0; i < yl; i++) {
      if (elmnt == y[i]) {
        arrNo.push(i)
      } else {
        y[i].classList.remove("select-arrow-active");
      }
    }
    for (i = 0; i < xl; i++) {
      if (arrNo.indexOf(i)) {
        x[i].classList.add("select-hide");
      }
    }
  }

  /* If the user clicks anywhere outside the select box,
  then close all select boxes: */
  document.addEventListener("click", closeAllSelect);
}

function animateButton(e, action, delay = false) {
  e.preventDefault;

  switch (action) {
    case "loading":
      e.target.classList.remove('success'); //reset success
      e.target.classList.remove('error'); //reset error
      e.target.classList.remove('loading'); //reset animation
      e.target.classList.add('loading');
      break;
    case "stop":
      e.target.classList.remove('loading');
      break;
    case "success":
      e.target.classList.remove('loading'); //reset loading animation
      e.target.classList.remove('loerrorading'); //reset error
      e.target.classList.add('success');
      if (delay) {
        setTimeout(function () {
          e.target.classList.remove('success');
        }, delay);
      }
      break;
    case "error":
      e.target.classList.remove('loading'); //reset loading animation
      e.target.classList.remove('success'); //reset success
      e.target.classList.add('error');
      if (delay) {
        setTimeout(function () {
          e.target.classList.remove('error');
        }, delay);
      }
      break;
    default:
      e.target.classList.add('loading');
  }
}

function validateNode(nodeAddress) {
  return new Promise((resolve, reject) => {
    const c1 = rpc.account_history(dataTest.account, 1, true, dataTest.blockHash, nodeAddress)
    const c2 = rpc.account_info(dataTest.account, nodeAddress)
    const c3 = rpc.block_info(dataTest.blockHash, nodeAddress)
    const c4 = rpc.pending_blocks(dataTest.account, 0, nodeAddress)
    const c5 = rpc.broadcast(dataTest.blockContent, [nodeAddress])
    Promise.all([c1, c2, c3, c4, c5])
      .then((res) => resolve({ result: res, node_url: nodeAddress }))
      .catch((err) => reject({ error: err, node_url: nodeAddress }))
  })
}

function rep_info() {
  const friendlyFloat = function (n, max) {
    if (n.toString().includes('.') && n.toString().split('.')[1].length > max) {
      return parseFloat(n).toFixed(max)
    } else {
      return parseFloat(n)
    }
  }
  const rep = "nano_3kc8wwut3u8g1kwa6x4drkzu346bdbyqzsn14tmabrpeobn8igksfqkzajbb"
  rpc.delegators(rep, "https://app.natrium.io/api")
    .then((res) => {
      document.querySelector("#delegators").classList.remove("loading")
      for (let account in res) {
        rpc.account_info(account, "https://rpc.p2pow.online")
          .then((info) => {
            const confirmed_percentage = 100 / (parseInt(info.block_count) / parseInt(info.confirmation_height))
            const unconfirmed_blocks = parseInt(info.block_count) - parseInt(info.confirmation_height)
            const delegator_li = document.createElement("li")
            delegator_li.innerHTML = '<p class="account"></p>\
        <p>Weight: <span class="weight"></span>\
        | Confirmed: <span class="confirmation_height"></span> of <span class="height"></span> blocks. <span class="percentage"></span></p>'
            delegator_li.querySelector(".account").innerText = account
            delegator_li.querySelector(".weight").innerText = friendlyFloat(toMegaNano(res[account]), 5)
            delegator_li.querySelector(".confirmation_height").innerText = info.confirmation_height
            delegator_li.querySelector(".height").innerText = info.block_count
            delegator_li.querySelector(".percentage").innerText = friendlyFloat(confirmed_percentage, 2) + '%'
            if (unconfirmed_blocks == 0) {
              delegator_li.querySelector(".percentage").classList.add("green")
            } else if (unconfirmed_blocks == 1) {
              delegator_li.querySelector(".percentage").classList.add("yellow")
            } else {
              delegator_li.querySelector(".percentage").classList.add("red")
            }
            document.querySelector("#delegators ul").append(delegator_li)
          })
      }
    })
    .catch((err) => {
      throw new Error(err)
    })
}

function benchmark_rating(ms) {
  if (ms <= 1200) {
    return "Very Fast"
  } else if (ms <= 3000) {
    return "Fast"
  } else if (ms <= 5000) {
    return "Good"
  } else if (ms <= 15000) {
    return "Slow"
  } else if (ms <= 60000) {
    return "Very Slow"
  } else {
    return "Not recommended"
  }
}

//gets the input by element Id, gets min, max, and step from the markup. Gets the subtract and add buttons either by optional classnames, or by the next or last element sibling.
function NumberSpinner(elemId, subtractClassName, addClassName) {
  'use strict';
  var spinnerInput = document.getElementById(elemId);
  var btnSubtract = spinnerInput.parentElement.querySelector(addClassName) || spinnerInput.previousElementSibling;
  var btnAdd = spinnerInput.parentElement.querySelector(subtractClassName) || spinnerInput.nextElementSibling;
  var minLimit, maxLimit, step;

  function init() {
    minLimit = makeNumber(getAttribute(spinnerInput, 'min')) || 0,
      maxLimit = makeNumber(getAttribute(spinnerInput, 'max')) || false,
      step = makeNumber(getAttribute(spinnerInput, 'step') || '1');

    btnSubtract.addEventListener('click', changeSpinner, false);
    btnAdd.addEventListener('click', changeSpinner, false);
    btnSubtract.addEventListener('keyup', keySpinner, false);
    btnAdd.addEventListener('keyup', keySpinner, false);
    if (supportsTouch()) {
      btnSubtract.addEventListener('touchend', removeClickDelay, false);
      btnAdd.addEventListener('touchend', removeClickDelay, false);
    }
    if (supportsPointer()) {
      btnSubtract.addEventListener('pointerup', removeClickDelay, false);
      btnAdd.addEventListener('pointerup', removeClickDelay, false);
    }
  }
  function removeClickDelay(e) {
    e.preventDefault();
    e.target.click();
  }
  function makeNumber(inputString) {
    return parseInt(inputString, 10);
  }
  function update(direction) {
    var num = makeNumber(spinnerInput.value);
    if (direction === 'add') {
      spinnerInput.value = ((num + step) <= maxLimit) ? (num + step) : spinnerInput.value;
    } else if (direction === 'subtract') {
      spinnerInput.value = ((num - step) >= minLimit) ? (num - step) : spinnerInput.value;
    }
    if (spinnerInput.id == "stepper_difficulty") config.max_difficulty_send = spinnerInput.value
    if (spinnerInput.id == "stepper_difficulty_receive") config.max_difficulty_receive = spinnerInput.value
    console.log(config)
  }
  function getAttribute(el, attr) {
    var hasGetAttr = (el.getAttribute && el.getAttribute(attr)) || null;
    if (!hasGetAttr) {
      var attrs = el.attributes;
      for (var i = 0, len = attrs.length; i < len; i++) {
        if (attrs[i].nodeName === attr) {
          hasGetAttr = attrs[i].nodeValue;
        }
      }
    }
    return hasGetAttr;
  }
  /* Touch and Pointer support */
  function supportsTouch() {
    return ('ontouchstart' in window);
  }
  function supportsPointer() {
    return ('pointerdown' in window)
  }
  /* Keyboard support */
  function keySpinner(e) {
    switch (e.keyCode) {
      case 40:
      case 37: // Down, Left
        update('subtract')
        btnSubtract.focus()
        break
      case 38:
      case 39: // Top, Right
        update('add')
        btnAdd.focus()
        break
    }
  }
  function changeSpinner(e) {
    e.preventDefault()
    var increment = getAttribute(e.target, 'data-type')
    update(increment)
  }
  init()
}

const sliderSettings = {
  fill: '#528FDE',
  background: 'rgba(245, 245, 245, 0.5)'
}

function syncSettings(){
  document.getElementById("range_slider_val_min_pending_amount").value = config.min_pending_amount * 100000
  document.querySelector('#min_pending_amount_value span').innerHTML = config.min_pending_amount
  if (config.enable_active_difficulty == true){
    document.getElementById("input_enable_active_difficulty").setAttribute("checked", true)
    document.getElementById("input_disable_active_difficulty").removeAttribute("checked")
  } else {
    document.getElementById("input_enable_active_difficulty").removeAttribute("checked")
    document.getElementById("input_disable_active_difficulty").setAttribute("checked", true)
  }
  document.getElementById("range_slider_val_min_consensus").value = config.min_consensus * 100000
  document.querySelector('#min_consensus_value span').innerHTML = config.min_consensus
  if (config.enable_max_difficulty == true){
    document.getElementById("input_enable_max_difficulty").setAttribute("checked", true)
    document.getElementById("input_disable_max_difficulty").removeAttribute("checked")
  } else {
    document.getElementById("input_enable_max_difficulty").removeAttribute("checked")
    document.getElementById("input_disable_max_difficulty").setAttribute("checked", true)
  }
  document.getElementById("stepper_difficulty").value = config.max_difficulty_send
  document.getElementById("stepper_difficulty_receive").value = config.max_difficulty_receive
}


window.addEventListener('DOMContentLoaded', () => {

  syncSettings()

  const sliders = document.querySelectorAll('.range-slider');
  Array.prototype.forEach.call(sliders, (slider) => {
    slider.querySelector('input').addEventListener('input', (event) => {
      let target_value = slider.querySelector('input').dataset.value_target
      let value = event.target.value
      if (slider.querySelector('input').id == "range_slider_val_min_pending_amount") {
        value /= 100000
        config.min_pending_amount = value
      } else if (slider.querySelector('input').id == "range_slider_val_min_consensus") {
        config.min_consensus = value
      }
      document.querySelector('#' + target_value + " span").innerHTML = value
      applyFill(event.target);
    });
    applyFill(slider.querySelector('input'));
  });

  function applyFill(slider) {
    const percentage = 100 * (slider.value - slider.min) / (slider.max - slider.min);
    const bg = `linear-gradient(90deg, ${sliderSettings.fill} ${percentage}%, ${sliderSettings.background} ${percentage + 0.1}%)`;
    slider.style.background = bg;
  }

  document.getElementById('label_enable_active_difficulty').addEventListener('click', () => { config.enable_active_difficulty = true })
  document.getElementById('label_disable_active_difficulty').addEventListener('click', () => { config.enable_active_difficulty = false })

  document.getElementById('label_enable_max_difficulty').addEventListener('click', () => { config.enable_max_difficulty = true })
  document.getElementById('label_disable_max_difficulty').addEventListener('click', () => { config.enable_max_difficulty = false })

  NumberSpinner("stepper_difficulty", ".minus", ".plus")
  NumberSpinner("stepper_difficulty_receive", ".minus", ".plus")

  function listPublicNodes(nodes) {
    nodes.forEach((nodeAddress) => {
      console.log(nodeAddress)
      let optionNode = '<option value="' + nodeAddress + '">' + nodeAddress + '</option>'
      document.querySelector("#public_nano_node select").innerHTML += optionNode
    })
    mySelects(function (nodeAddress) {
      if (nodeAddress != config.node) {
        const resetButton = document.querySelector("button#connectPublicNanoNode")
        resetButton.classList.remove('success'); //reset success
        resetButton.classList.remove('error'); //reset error
        resetButton.classList.remove('loading'); //reset animation
        resetButton.classList.remove('loadstoping'); //reset stop
        resetButton.innerHTML = 'Connect <i class="glyphicon glyphicon-open">'
      }
    })
    nodes.forEach((nodeAddress) => {
      validateNode(nodeAddress)
        .then((res) => {
          document.querySelector('.s-item[data="' + res.node_url + '"]').classList.add("online")
        })
        .catch((err) => {
          console.error(err)
          document.querySelector('.s-item[data="' + err.node_url + '"]').classList.add("offline")
        })
    })
  }

  const nodesPath = path.join(__dirname, 'nodes.txt')
  let nodes = fs.readFileSync(nodesPath).toString().replace(/\r\n/g, '\n').split('\n')
  listPublicNodes(nodes)

  document.querySelector("button#connectPublicNanoNode").addEventListener("click", function (e) {
    const list = document.querySelector('#public_nano_node select')
    const nodeAddress = list[list.selectedIndex].value
    animateButton(e, "loading")
    validateNode(nodeAddress)
      .then(res => {
        config.node = nodeAddress
        updateConfig({ node: nodeAddress })
          .then((res) => {
            document.getElementById("next_1").disabled = false
            e.target.innerHTML = 'Connected <i class="glyphicon glyphicon-saved"></i>'
            animateButton(e, "success")
          }).catch((err) => {
            e.target.innerHTML = 'Error <i class="glyphicon glyphicon-remove-circle"></i>'
            animateButton(e, "error")
            throw new Error(err)
          })
      })
      .catch(err => {
        e.target.innerHTML = 'Error <i class="glyphicon glyphicon-remove-circle"></i>'
        animateButton(e, "error")
        throw new Error(err)
      })
  })

  document.querySelector("button#connectNanoNode").addEventListener("click", function (e) {
    const nodeAddress = document.querySelector("input#nano_node").value
    animateButton(e, "loading")
    validateNode(nodeAddress)
      .then(res => {
        config.node = nodeAddress
        updateConfig({ node: nodeAddress })
          .then((res) => {
            document.getElementById("next_1").disabled = false
            e.target.innerHTML = 'Connected <i class="glyphicon glyphicon-saved"></i>'
            animateButton(e, "success")
          }).catch((err) => {
            e.target.innerHTML = 'Error <i class="glyphicon glyphicon-remove-circle"></i>'
            animateButton(e, "error")
            throw new Error(err)
          })
      })
      .catch(err => {
        e.target.innerHTML = 'Error <i class="glyphicon glyphicon-remove-circle"></i>'
        animateButton(e, "error")
      })
  })

  document.querySelector("button#startNanoWorkServer").addEventListener("click", function (e) {
    const workerArgs = document.getElementById("nano_worker_args")
    const consoleEl = document.getElementById("workerResponse")
    let workerConsolePressed = false

    const workerAddress = "http://[::1]:7099"

    consoleEl.addEventListener('mousedown', function () {
      workerConsolePressed = true
    })
    consoleEl.addEventListener('mouseup', function () {
      workerConsolePressed = false
    })

    function workerConsoleLog(msg, type) {
      consoleEl.innerHTML += `<p class="${type}">${msg}</p>`
      if (!workerConsolePressed) consoleEl.scrollTop = consoleEl.scrollHeight
    }

    animateButton(e, "loading")

    consoleEl.classList.add("active")
    document.getElementById("contentStartWorker").classList.add("consoleOpen")

    const bin = path.join(__dirname, 'nano-work-server')

    const args = workerArgs.value

    console.log(bin, "", args)

    const child = spawn(bin, args.split(" "))

    ipcRenderer.send('pid_message', child.pid);

    child.stdout.on('data', (data) => {
      console.log(`stdout:\n${data}`)
      workerConsoleLog(data, "info")

      if (data.includes("Ready to receive requests on [::1]:7099")) {

        document.getElementById("workerResponse").innerHTML += '<p class="info">Benchmark | Speed test your worker...</p>'

        rpc.work_generate(dataTest.blockHash, dataTest.difficulty, workerAddress)
          .then((workerResponse) => {
            config.worker = workerAddress
            updateConfig({ worker: workerAddress })
              .then((res) => {
                workerConsoleLog(JSON.stringify(workerResponse), "log")
                this.innerHTML = 'Connected <i class="glyphicon glyphicon-saved"></i>'
                animateButton(e, "success")
                document.getElementById("next_2").disabled = false
              })
              .catch((err) => {
                this.innerHTML = 'Error <i class="glyphicon glyphicon-remove-circle"></i>'
                animateButton(e, "error")
                document.getElementById("next_2").disabled = true
                workerConsoleLog(JSON.stringify(err), "error")
              })

          }).catch((err) => {
            this.innerHTML = 'Error <i class="glyphicon glyphicon-remove-circle"></i>'
            animateButton(e, "error")
            document.getElementById("next_2").disabled = true
            workerConsoleLog(JSON.stringify(err), "error")
          })
      }

    })

    child.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
      workerConsoleLog(data, "error")
      this.innerHTML = 'Error <i class="glyphicon glyphicon-remove-circle"></i>'
      animateButton(e, "error")
    })

    child.on('error', (error) => {
      console.error(`error: ${error.message}`);
      workerConsoleLog(error.message, "error")
      this.innerHTML = 'Error <i class="glyphicon glyphicon-remove-circle"></i>'
      animateButton(e, "error")
    })

    child.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
      workerConsoleLog(`child process exited with code ${code}`, "error")
      this.innerHTML = 'Error <i class="glyphicon glyphicon-remove-circle"></i>'
      animateButton(e, "error")
    })
  })

  document.querySelector("button#connectNanoWorkServer").addEventListener("click", function (e) {

    const consoleEl = document.getElementById("connectWorkerResponse")
    let consolePressed = false
    consoleEl.addEventListener('mousedown', function () {
      consolePressed = true
    })
    consoleEl.addEventListener('mouseup', function () {
      consolePressed = false
    })

    function connectWorkerConsoleLog(msg, type) {
      consoleEl.innerHTML += `<p class="${type}">${msg}</p>`
      if (!consolePressed) consoleEl.scrollTop = consoleEl.scrollHeight
    }

    animateButton(e, "loading")
    const workerAddress = document.getElementById("connect_work_server").value
    consoleEl.classList.add("active")
    document.getElementById("contentConnectWorker").classList.add("consoleOpen")
    connectWorkerConsoleLog("Benchmark | Speed test your worker...", "log")

    const time_before = new Date().getTime()
    rpc.work_generate(dataTest.blockHash, dataTest.difficulty, workerAddress)
      .then((workerResponse) => {
        const time_ellapsed = new Date().getTime() - time_before
        const rating = benchmark_rating(time_ellapsed)
        connectWorkerConsoleLog(JSON.stringify(workerResponse), "info")
        connectWorkerConsoleLog(`Time Ellapsed: ${time_ellapsed} ms [ ${rating} ]`, "info")
        config.worker = workerAddress
        updateConfig({ worker: workerAddress })
          .then((res) => {
            this.innerHTML = 'Connected <i class="glyphicon glyphicon-saved"></i>'
            animateButton(e, "success")
            document.getElementById("next_2").disabled = false
          })
          .catch((err) => {
            connectWorkerConsoleLog(JSON.stringify(err), "error")
            e.target.innerHTML = 'Error <i class="glyphicon glyphicon-remove-circle"></i>'
            animateButton(e, "error")
            document.getElementById("next_2").disabled = true
          })

      }).catch((err) => {
        connectWorkerConsoleLog(JSON.stringify(err), "error")
        e.target.innerHTML = 'Error <i class="glyphicon glyphicon-remove-circle"></i>'
        animateButton(e, "error")
        document.getElementById("next_2").disabled = true
      })
  })

  document.querySelector("button#saveSettings").addEventListener("click", function (e) {
    updateConfig()
      .catch((err) => {
        throw new Error(err)
      })
  })

  const tryConfirmBtn = document.getElementById("tryConfirm")
  tryConfirmBtn.addEventListener('click', () => {
    document.getElementById("import_list").setAttribute("disabled", true)
    document.getElementById("target_to_confirm").setAttribute("disabled", true)
    const target_account = document.getElementById("target_to_confirm").value
    tryConfirmBtn.disabled = true
    tryConfirmBtn.innerText = "Confirming..."
    document.getElementById('console').style.display = "block"
    safeUpdateConsole()
    findUnconfirmed({
      account: target_account,
      sync: true,
      force: true,
      follow: true
    })
      .then((res) => {
        document.getElementById("import_list").setAttribute("disabled", false)
        document.getElementById("target_to_confirm").setAttribute("disabled", false)
        tryConfirmBtn.innerText = "Finished!"
      })
      .catch((err) => {
        document.getElementById("import_list").setAttribute("disabled", false)
        document.getElementById("target_to_confirm").setAttribute("disabled", false)
        alert(err)
        throw new Error(err)
        process.exit(1)
        tryConfirmBtn.innerHTML = 'Error <i class="glyphicon glyphicon-remove-circle"></i>'
      })
  })

  document.getElementById("openRepInfo").addEventListener("click", function () {
    rep_info()
  })

})


