var reset = [{ 
    "meta": "",
    "name": "사용자 스크립트",
    "description": "사용자가 직접 등록한 스크립트는 이곳에 표시됩니다.",
    "theme": {
        "background": "#333",
        "color": "#fff"
    },
    "version": "",
    "contents": []
}]
var source = `
        title: Mousetrap
        owner: ccampbell
        url: https://craig.is/killing/mice
        github: https://github.com/ccampbell/mousetrap

        title: Shortkeys
        owner: Mike Crittenden
        github: https://github.com/mikecrittenden/shortkeys
`
var actions = ['user agent', 'instant', 'style', 'key']
var edit = {
    "mode": "",
    "group": "",
    "action": "",
    "nth": "",
    "changed": false
}
var listener = {
    action: function (e) {
        e.stopImmediatePropagation()
        if (this.dataset.action == "activate") {
            var storage = JSON.parse(localStorage.data)
            storage[e.path[3].dataset.group]['contents'][e.path[1].dataset.nth].activate = !this.previousElementSibling.checked
            localStorage.data = JSON.stringify(storage)
            reloadAll()
            return
        }
        popup.setting(this.dataset.action, this, e)

    },
    input: function (e) {
        edit.changed = true
    },
    add: function () {
        document.querySelectorAll('[data-action]')
            .forEach((el) => {
                el.addEventListener('click', this.action, false)
            })
        popup.box.querySelectorAll('[name]')
            .forEach((el) => {
                el.addEventListener('input', this.input, false)
            })
    },
    remove: function () {
        document.querySelectorAll('[data-action]')
            .forEach((el) => {
                el.removeEventListener('click', this.action)
            })
        popup.box.querySelectorAll('[name]')
            .forEach((el) => {
                el.removeEventListener('input', this.input)
            })
    }

}

function find(s) {
    return document.querySelector(s)
}

function send(type, url, data, async, after) {
    var form = new FormData()
    var xhr = new XMLHttpRequest()
    for (param in data) {
        form.append(param, data[param])
    }
    xhr.open(type, url, async == void 0 || async);
    xhr.onload = (xhr) => {
        after && after(xhr.target)
    }
    xhr.send(form);
    return xhr
}

function reloadAll() { /* 팝업과 옵션 html 동시에 업데이트 */
    chrome.runtime.sendMessage({
        type: "syncedLoad"
    });
}

function reload() {
    document.querySelectorAll('body > section')
        .forEach(e => e.remove())
    if (!localStorage.data) {
        localStorage.data = JSON.stringify(reset)

    }
    var storage = JSON.parse(localStorage.data)
    var resetCheck = 0
    for (i in storage) {
        if (storage[i].meta == "") {
            resetCheck = 1
        }
        var template = document.createElement("section")
        template.setAttribute("data-group", i)
        template.innerHTML = `
            <div class="header" style="background:${ storage[i].theme.background}; color:${storage[i].theme.color}">
                <div class="left">
                    <h1>${ storage[i].name}</h1>
                    <h2 class="ver">${ storage[i].version}</h2>
                    <h2>${ storage[i].description}</h2>
                    <h2 class="ver" id="meta" data-action="update">${ storage[i].meta}</h2>
                </div>
                <div class="right" >
<button data-action="export">Export</button>
                    <input type="button" id="delete" />
                    <label for="delete" data-action="delete-group">X</label>
                </div>
                
            </div>
            <ul class="line">
                ${applyContents(storage[i].contents)}
            </ul>
        `
        find("body")
            .appendChild(template);
    }
    if (!resetCheck) {
        storage.push(reset[0])
        localStorage.data = JSON.stringify(storage)
    }
    listener.remove()
    listener.add()
    chrome.runtime.sendMessage({
        type: 'ua-update'
    })
    popup.close()
}

function applyContents(data) {
    var li = ``
    for (i in data) {
        var li = li + `
    <li class=line data-action="${data[i].action}" data-nth="${i}">
        <div class="left">
            <h1>${data[i].key ? "[" + data[i].key + "] " : ''}${data[i].name}</h1>
            <h2 class="ver">${data[i].action}</h2>
        </div>
<input type="checkbox" id="activate" ${data[i].activate ? " checked" : ""}/>
        <label for="activate" class="right" data-action='activate'></label>
    </li>
    `
    }
    return li
}
var popup = {
    box: find('.popup'),
    trigger: "",
    closer: [find(".popup label[for=delete]"), find('.dim')],
    form: {
        name: find(".popup [name=name]"),
        key: find(".popup [name=key]"),
        action: find(".popup [name=action]"),
        url: find(".popup [name=url]"),
        script: find(".popup [name=script]")
    },
    button: {
        delete: find("[data-action='delete']"),
        save: find("[data-action='save']")
    }
}
popup.setting = function (type, trigger, e) {
    if (type == "add") {
        edit.mode = "add"
        this.setting(this.form.action.value)
        return
    } else if (type == "save") {
        var storage = JSON.parse(localStorage.data)
        if (actions.indexOf(edit.mode) + 1 || edit.mode == "add") {
            var need = ''
            if (!this.form.name.value) {
                need = need + "스크립트의 이름을 입력해 주세요.\n"
            }
            if (!this.form.script.value) {
                need = need + "스크립트의 내용이 비어있습니다."
            }
            if (this.form.action.value == "key" && !this.form.key.value) {
                need = need + "키 입력이 비어있습니다."
            }
            if (need) {
                alert(need)
                return 0
            }
            var newData = {
                "action": this.form.action.value,
                "name": this.form.name.value,
                "script": this.form.script.value,
                "url": this.form.url.value.split("\n") || [],
                "activate": edit.mode == "add" ? true : storage[edit.group]['contents'][edit.nth].activate
            }
            if (this.form.action.value == "key") {
                newData.key = this.form.key.value
            }
            if (actions.indexOf(edit.mode) + 1) {
                storage[edit.group]['contents'][edit.nth] = newData
            } else {
                for (i in storage) {
                    if (storage[i].meta == '') {
                        edit.group = i
                        break
                    }
                }
                storage[edit.group]['contents'].push(newData)
            }
        } else { /* import */
            try {
                storage.push(JSON.parse(this.form.url.value))
            } catch (_) {
                try {
                    var urls = this.form.url.value.split('\n')
                    for (url of urls) {
                        if (url == '') {
                            continue
                        }
                        new URL(url);
                        var data = JSON.parse(send('GET', url, '', false)
                            .response)
                        data.meta = url
                        storage.push(data)
                    }
                } catch (_) {
                    alert('올바르지 않은 입력입니다.')
                    return 0
                }
            }
        }
        edit.changed = false
        localStorage.data = JSON.stringify(storage)
        reloadAll()
        return 1
    } else if (type == "delete" || type == "delete-group") {
        if (confirm("해당 스크립트를 삭제할까요?")) {
            var storage = JSON.parse(localStorage.data)
            if (edit.mode) {
                storage[edit.group]['contents'].splice(edit.nth, 1)
            } else {
                storage.splice(e.path[3].dataset.group, 1)
            }
            localStorage.data = JSON.stringify(storage)
            edit.changed = false
            reloadAll()
        }
        return
    } else if (type == "update") {
        try {
            console.log(e.path[3].dataset.group)
            var response = JSON.parse(send('GET', trigger.innerText + "?update=" + Date.now(), '', false)
                .response)
            var storage = JSON.parse(localStorage.data)
            var newVer = response.version.split('.')
            var oldVer = storage[e.path[3].dataset.group].version.split('.')

            for (i in newVer) {
                if (newVer[i] * 1 > oldVer[i] * 1) {
                    if (confirm("업데이트가 가능합니다. 업데이트 할까요?")) {
                        response.meta = trigger.innerText
                        storage[e.path[3].dataset.group] = response
                        localStorage.data = JSON.stringify(storage)
                        reloadAll(1)
                    }
                    return
                }
            }
            alert("최신 버전입니다.")
        } catch (_) {
            alert('업데이트 확인에 실패했습니다.')
        }
        return
    } else if (type == "activate") {
        var storage = JSON.parse(localStorage.data)
        storage[trigger.parentNode.parentNode.parentNode.dataset.group]['contents'][trigger.parentNode.dataset.nth]["activate"] = !trigger.previousElementSibling.checked
        localStorage.data = JSON.stringify(storage)
        reloadAll()
        return
    }
    this.form.name.style.display = this.form.key.style.display = this.form.action.style.display = this.form.url.style.display = this.form.script.style.display = this.button.delete.style.display = this.button.save.style.display = "none"
    this.box.querySelector('h1')
        .innerText = this.form.name.value = this.form.key.value = this.form.url.value = this.form.script.value = ''
    this.box.querySelector('h1')
        .innerText = this.setting.data[edit.mode == "add" ? "add" : type].title
    var elementSet = this.setting.data[edit.mode == "add" ? "add" : type].element
    for (element of elementSet) {
        element.style.display = "inline-block"
    }
    this.form.key.setAttribute("style", "width:100px; visibility:" + (type == "key" ? "visible" : "hidden"))
    edit.mode = (edit.mode == "add" ? "add" : type)
    if (type == "export") {
        this.form.script.value = JSON.stringify(JSON.parse(localStorage.data)[trigger.parentNode.parentNode.parentNode.dataset.group])
    } else if (type == "source") {
        this.form.script.value = source
    } else if (actions.indexOf(type) + 1 && trigger) {
        edit.group = trigger.parentNode.parentNode.dataset.group
        edit.action = trigger.dataset.action
        edit.nth = trigger.dataset.nth
        var content = JSON.parse(localStorage.data)[edit.group]['contents'][edit.nth]
        this.form.name.value = content.name
        this.form.key.value = content.key ? content.key : ''
        this.form.action.value = trigger.dataset.action
        this.form.url.value = (content.url + '')
            .replace(/,/g, '\n')
        this.form.script.value = content.script
    }
    this.box.classList.add("_open")
}
popup.setting.data = {
    "add": {
        "title": "새로운 스크립트를 추가합니다.",
        "element": [popup.form.name, popup.form.action, popup.form.url, popup.form.script, popup.button.save]
    },
    "import": {
        "title": "스크립트를 가져옵니다. 데이터 또는 주소를 입력해 주세요.",
        "element": [popup.form.url, popup.button.save]
    },
    "export": {
        "title": "스크립트 그룹 내보내기",
        "element": [popup.form.script]
    },
    "source": {
        "title": "오픈소스 사용 정보입니다. 도움을 주셔서 감사합니다.",
        "element": [popup.form.script]
    },
    "user agent": {
        "title": "스크립트 편집",
        "element": [popup.form.name, popup.form.action, popup.form.url, popup.form.script, popup.button.delete, popup.button.save]
    },
    "instant": {
        "title": "스크립트 편집",
        "element": [popup.form.name, popup.form.action, popup.form.url, popup.form.script, popup.button.delete, popup.button.save]
    },
    "style": {
        "title": "스크립트 편집",
        "element": [popup.form.name, popup.form.action, popup.form.url, popup.form.script, popup.button.delete, popup.button.save]
    },
    "key": {
        "title": "스크립트 편집",
        "element": [popup.form.name, popup.form.key, popup.form.action, popup.form.url, popup.form.script, popup.button.delete, popup.button.save]
    }
}
popup.close = function () {
    if (edit.mode != "export" && edit.mode != "source" && edit.changed) {
        var lastChance = confirm("변경사항을 취소하고 창을 닫으시겠습니까?")
        if (!lastChance) {
            return
        }
    }
    edit.mode = ''
    edit.group = ''
    edit.action = ''
    edit.nth = ''
    edit.changed = false
    this.box.classList.remove("_open")
}
popup.form.action.addEventListener('change', function () {
    edit.mode = (edit.mode == "add" ? "add" : edit.mode)
    popup.form.key.setAttribute("style", "width:100px; visibility:" + (this.value == "key" ? "visible" : "hidden"))
});
popup.closer.forEach((el) => {
    el.addEventListener('click', function (e) {
        popup.close()
    });
})
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.type == "load") {
        reload()
    }
})
reloadAll()