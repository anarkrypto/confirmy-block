let completes = []
const timelist = document.querySelectorAll(".timeline .li")
const sections = document.querySelectorAll("section")

updateTimeline(0)

function updateTimeline(id) {
  const timelist_item = parseInt(id)
  const id_previous = parseInt(id) - 1

  if (id_previous >= 0 && !completes.includes(id_previous)) {
    timelist[id_previous].classList.add('complete')
    completes.push(id_previous)
  }

  if (!timelist[timelist_item].classList.contains('active')) {
    timelist[timelist_item].classList.add('active')
    timelist[timelist_item].addEventListener("click", function () {
      nextSection(id)
    }, false)
  }

}
function nextSection(id) {
  sections.forEach((section) => {
    console.log(section)
    section.classList.add("hidden")
  })
  document.querySelector("#section" + id).classList.remove("hidden")
  updateTimeline(id)
}

sections.forEach((section) => {
  section.querySelectorAll(".collapsible").forEach((coll) => {

    let closing = false

    coll.querySelector(".openCloseBtn").addEventListener('mouseup', e => {
      if (coll.classList.contains("active")) {
        closing = true
        coll.classList.remove("active")
      }
    })

    window.addEventListener('mousedown', e => {
      closing = false
    })

    coll.addEventListener("click", function () {
      let clicked = this
      section.querySelectorAll(".collapsible").forEach((collEl) => {
        if (collEl != this) collEl.classList.remove("active")
      })
      if (!this.classList.contains("active") && !closing) this.classList.add("active")
    })
  })
})

function removeFile() {
  document.querySelector("#selected_file").classList.add("hidden")
  document.querySelector("#selected_file .filename").innerText = ""
  document.querySelector("#drop_zone").style.borderColor = "#8e9297"
  document.querySelector("#drop_zone .zone_content").classList.remove("hidden")
}

function showFile(filename) {
  document.querySelector("#drop_zone").style.borderColor = "#53b6ac"
  document.querySelector("#drop_zone .zone_content").classList.add("hidden")
  document.querySelector("#selected_file .filename").innerText = filename
  document.querySelector("#selected_file").classList.remove("hidden")
}


function dropHandler(ev) {
  console.log('File(s) dropped');

  // Prevent default behavior (Prevent file from being opened)
  ev.preventDefault();

  if (ev.dataTransfer.items) {
    // Use DataTransferItemList interface to access the file
    // If dropped item isn't file, reject 
    if (ev.dataTransfer.items[0].kind === 'file') {
      var file = ev.dataTransfer.items[0].getAsFile();
      console.log('... filename = ' + file.name);
      showFile(file.name)
    }
  } else {
    // Use DataTransfer interface to access the file(s)
    if (ev.dataTransfer.files.length) {
      console.log('... filename = ' + ev.dataTransfer.files[0].name);
      showFile(file.name)
    }
  }
}

function dragOverHandler(ev) {
  console.log('File(s) in drop zone');

  // Prevent default behavior (Prevent file from being opened)
  ev.preventDefault();
}

function generateQr(nanoAccount) {
  new QRCode(document.getElementById("qrcode"), {
    text: "nano:" + nanoAccount,
    width: 200,
    height: 200,
    colorDark: "#2f3136",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  })
}

document.addEventListener("DOMContentLoaded", function (event) {
  //generateQr("nano_3bs7d8xyy1ouwn5jbrnwpo5prqrkwi4fpu56gr7we6z4ew1z5rgzb6xkqdbs")
});