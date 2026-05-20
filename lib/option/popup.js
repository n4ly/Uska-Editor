// 편집 모달 (스크립트 추가/수정/삭제/가져오기/내보내기)의 단일 진실 공급원.
// CodeMirror 인스턴스 관리, 폼 상태, 모드 전환, save/discard 흐름 등을 모두 담당한다.
// 다른 IIFE 모듈(key-recorder, gesture-pad, ua-presets 등)은 popup, syncDiscardBtn,
// 그리고 일부 CM 헬퍼를 import하여 사용한다.

import { i18n, find, esc, fieldError } from './utils.js'
import { actions, CSS, ATTR, CM_BASE, BLOCK_PRESETS, BLOCK_PATTERN_SET, UA_PRESET_SET, icon } from './constants.js'
import { state } from './state.js'
import { updateFade } from './render.js'
import { getStorage, setStorage, reloadAll } from '../shared/storage.js'

const { edit } = state

// ---------- CodeMirror 상태 ----------
// export되어 다른 IIFE 모듈에서 참조 가능 (live binding이라 변경 시 자동 반영).
export let cmEditor = null
export let cmUrlEditor = null
export const cmImport = { script: null, group: null }
let cmChanging = false
let cmUrlChanging = false

// CM_SAVE_KEY는 popup.close()를 참조하므로 popup이 정의된 후에야 의미가 있지만,
// 실제 호출은 사용자가 Ctrl-Enter를 누르는 시점이라 lazy 평가로 안전.
const CM_SAVE_KEY = {
    extraKeys: { 'Ctrl-Enter': () => {
        if (!Mousetrap.recording) popup.close()
    }}
}

export function getCMMode(actionVal) {
    if (actionVal === 'instant' || actionVal === 'key' || actionVal === 'gesture' || actionVal === 'library') return 'javascript'
    if (actionVal === 'style') return 'css'
    return null
}

export function setCMValue(val) {
    if (!cmEditor) return
    cmChanging = true
    cmEditor.setValue(val || '')
    cmChanging = false
}

// CM 에디터와 상태바 가시성의 단일 진실 공급원.
// scriptMode와 uaMode 양쪽 모두 이 함수를 호출하며 직접 style.display를 건드리지 않는다.
export function syncCMDisplay() {
    const action    = popup.form.action.value
    const cmWrapper = cmEditor ? cmEditor.getWrapperElement() : null
    const statusbar = popup.box.querySelector(`.field[${ATTR.field}=script] .cm-statusbar`)
    let showCM
    if (action === 'user agent') {
        const uaActiveBtn = popup.box.querySelector(`.ua-mode-btn.${CSS.active}`)
        showCM = !uaActiveBtn || uaActiveBtn.dataset.mode === 'input'
    } else if (action === 'block') {
        const blockActiveBtn = popup.box.querySelector(`.block-mode-btn.${CSS.active}`)
        showCM = !blockActiveBtn || blockActiveBtn.dataset.mode === 'input'
    } else {
        showCM = popup.form.scriptMode.value !== 'preset'
    }
    if (cmWrapper) cmWrapper.classList.toggle('_hidden', !showCM)
    if (statusbar)  statusbar.classList.toggle('_hidden', !showCM)
}

export function getCMUrlValue() {
    return getCMImportValue(cmUrlEditor, popup.form.url)
}

export function setCMUrlValue(val) {
    popup.form.url.value = val || ''
    if (cmUrlEditor) {
        cmUrlChanging = true
        cmUrlEditor.setValue(val || '')
        cmUrlChanging = false
    }
}

function setupCMUrlEditor(value) {
    if (!cmUrlEditor) {
        cmUrlEditor = CodeMirror.fromTextArea(popup.form.url, {
            ...CM_BASE,
            ...CM_SAVE_KEY,
            lineWrapping: false,
            mode: null,
        })
        cmUrlEditor.on('change', () => {
            if (cmUrlChanging) return
            edit.changed = true
            syncDiscardBtn()
            popup.wrapper.url.classList.remove('_warn-edit', '_risk-edit')
        })
    }
    cmUrlChanging = true
    cmUrlEditor.setValue(value || '')
    cmUrlChanging = false
    setTimeout(() => cmUrlEditor.refresh(), 0)
}

function setupCMEditor(value, mode) {
    if (cmEditor) {
        cmEditor.toTextArea()
        cmEditor = null
    }
    cmEditor = CodeMirror.fromTextArea(popup.form.script, {
        ...CM_BASE,
        ...CM_SAVE_KEY,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        lineWrapping: true,
    })
    cmEditor.on('change', () => {
        if (cmChanging) return
        edit.changed = true
        syncDiscardBtn()
        popup.wrapper.script.classList.remove('_warn-edit', '_risk-edit')
    })
    const cursorPosEl = document.querySelector('.cm-cursor-pos')
    const updateCursorPos = (cm) => {
        const cur = cm.getCursor()
        if (cursorPosEl) cursorPosEl.textContent = `${cur.line + 1}:${cur.ch + 1}`
        const coords = cm.cursorCoords(true, 'window')
        const scrollEl = document.querySelector('.popup-body')
        if (!scrollEl) return
        const rect = scrollEl.getBoundingClientRect()
        const margin = 40
        if (coords.bottom > rect.bottom - margin) {
            scrollEl.scrollTop += coords.bottom - rect.bottom + margin
        } else if (coords.top < rect.top + margin) {
            scrollEl.scrollTop -= rect.top + margin - coords.top
        }
    }
    cmEditor.on('cursorActivity', updateCursorPos)
    cmEditor.on('focus', updateCursorPos)
    setCMValue(value)
    cmEditor.setOption('mode', mode)
    cmEditor.setOption('readOnly', false)
    setTimeout(() => {
        cmEditor.refresh()
        popup._syncAll()
    }, 0)
}

function getCMImportValue(cm, textarea) {
    return cm ? cm.getValue() : textarea.value
}

function makeImportEditor(textarea) {
    const cm = CodeMirror.fromTextArea(textarea, {
        ...CM_BASE,
        mode: 'application/json',
        lineWrapping: true,
    })
    cm.on('change', () => { edit.changed = true })
    return cm
}

function setupCMImportEditor(key, textarea, value) {
    if (!cmImport[key]) cmImport[key] = makeImportEditor(textarea)
    cmImport[key].setValue(value || '')
    setTimeout(() => cmImport[key].refresh(), 0)
}

// ---------- popup 객체 ----------
export const popup = {
    box: find('.popup'),
    dim: find('.dim'),
    closer: [find('.popup .popup-close'), find('.dim')],
    form: {
        group:          find('.popup [name=group]'),
        name:           find('.popup [name=name]'),
        libraryId:      find('.popup [name=library-id]'),
        key:            find('.popup [name=key]'),
        keyInputAllow:  find('.popup [name=key-input-allow]'),
        gestureTrigger: find('.popup [name=gesture-trigger]'),
        timing:         find('.popup [name=timing]'),
        scriptMode:     find('.popup [name=script-mode]'),
        presetAction:   find('.popup [name=preset-action]'),
        action:         find('.popup [name=action]'),
        url:            find('.popup [name=url]'),
        script:         find('.popup [name=script]'),
        scriptImport:   find('.popup [name=script-import]'),
        groupImport:    find('.popup [name=group-import]')
    },
    wrapper: {
        group:          find(`.popup .field[${ATTR.field}=group]`),
        name:           find(`.popup .field[${ATTR.field}=name]`),
        key:            find(`.popup .field[${ATTR.field}=key]`),
        gestureTrigger: find(`.popup .field[${ATTR.field}=gesture-trigger]`),
        libraryId:      find(`.popup .field[${ATTR.field}=library-id]`),
        timing:         find(`.popup .field[${ATTR.field}=timing]`),
        url:            find(`.popup .field[${ATTR.field}=url]`),
        script:         find(`.popup .field[${ATTR.field}=script]`),
        scriptImport:   find(`.popup .field[${ATTR.field}=script-import]`),
        groupImport:    find(`.popup .field[${ATTR.field}=group-import]`),
        actionSelect:   find(`.popup .field[${ATTR.field}=action-select]`),
        sourceLicense:  find(`.popup .field[${ATTR.field}=source-license]`)
    },
    button: {
        delete:            find(".popup [data-action='delete']"),
        exportScript:      find(".popup [data-action='export-script']"),
        discard:           find(".popup [data-action='discard']"),
        selectActionCopy:  find('.popup .select-action-copy'),
        selectActionImport:find('.popup .select-action-import'),
        saveHint:          find('.save-shortcut-hint')
    }
}

popup._syncRegistry = []
popup._registerSync = function(fn) { this._syncRegistry.push(fn) }
popup._syncAll      = function()   { this._syncRegistry.forEach(fn => fn()) }

popup.setting = async function(type, trigger, e) {
    if (type === 'add')                               return this._handleAdd()
    if (type === 'delete')         return this._delete()
    if (type === 'delete-group')   return this._deleteGroup()
    if (type === 'export-script')  return this._exportScript()
    if (type === 'update')                            return this._update(trigger)
    await this._open(type, trigger)
}

popup._handleAdd = async function() {
    if (edit.mode !== 'select-action') {
        edit.mode = 'select-action'
        await this._open('select-action')
    } else {
        edit.mode = 'add'
        await this._open(this.form.action.value)
    }
}

popup._autoFillName = function() {
    if (this.form.name.value) return
    const action = this.form.action.value
    if (action === 'block') {
        const inPreset = this.box.querySelector(`.block-mode-btn.${CSS.active}`)?.dataset.mode === 'preset'
        if (inPreset) {
            const active = [...this.box.querySelectorAll(`.bp-item.${CSS.active}`)]
            if (active.length > 0) {
                const first = BLOCK_PRESETS.find(p => p.id === active[0].dataset.id)?.name || ''
                this.form.name.value = active.length === 1 ? first : `${first} +${active.length - 1}`
            }
        }
    } else if (['instant', 'key', 'gesture'].includes(action) && this.form.scriptMode.value === 'preset') {
        const name = this.box.querySelector(`.ba-btn.${CSS.active}:not(.ua-preset-btn) .ba-name`)?.textContent
        if (name) this.form.name.value = name
    } else if (action === 'user agent') {
        const inPreset = this.box.querySelector(`.ua-mode-btn.${CSS.active}`)?.dataset.mode === 'preset'
        if (inPreset) {
            const name = this.box.querySelector(`.ua-preset-btn.${CSS.active} .ba-name`)?.textContent
            if (name) this.form.name.value = name
        }
    }
}

popup._buildScriptData = function(storage) {
    const action = this.form.action.value
    const targetGroup = +this.form.group.value
    const data = {
        action,
        name:     this.form.name.value,
        script:   cmEditor ? cmEditor.getValue() : this.form.script.value,
        url:      action === 'library' ? [] : getCMUrlValue().split('\n').filter(u => u),
        libraryId: action === 'library' ? this.form.libraryId.value.trim() : undefined,
        timing: action === 'instant' ? (this.form.timing.value || 'start') : undefined,
        activate: edit.mode === 'add' ? action !== 'note' : storage[edit.group].contents[edit.nth].activate
    }
    if (action === 'key') {
        data.key = this.form.key.value
        data.inputAllow = this.form.keyInputAllow.checked
    }
    if (action === 'gesture') {
        data.trigger = this.form.gestureTrigger.value.toUpperCase()
    }
    // preset 모드 + presetAction이 모두 있을 때만 preset으로 저장.
    // preset 모드인데 아무것도 선택 안 했으면 script 모드로 fallback (data.script만 저장).
    if (['instant', 'key', 'gesture'].includes(action)
        && this.form.scriptMode.value === 'preset'
        && this.form.presetAction.value) {
        data.scriptMode = 'preset'
        data.presetAction = this.form.presetAction.value
    }
    return { targetGroup, data }
}

popup._applyScriptToStorage = function(storage, targetGroup, data) {
    if (actions.includes(edit.mode)) {
        storage[edit.group].contents.splice(edit.nth, 1)
        if (edit.group === targetGroup) {
            storage[targetGroup].contents.splice(edit.nth, 0, data)
        } else {
            storage[targetGroup].contents.push(data)
        }
    } else {
        storage[targetGroup].contents.push(data)
    }
}

popup._parseImportScript = async function(storage) {
    const targetGroup = state.selectedGroup
    const raw = getCMImportValue(cmImport.script, this.form.scriptImport).trim()
    if (!raw) { alert(i18n('noScriptsToImport')); return false }
    const imported = []

    function pushItem(item) {
        if (!item.action || !item.name || !item.script) { alert(i18n('missingRequiredFields')); return false }
        imported.push({
            action: item.action, name: item.name, script: item.script,
            url: item.url || [],
            ...(item.action === 'key' && item.key        ? { key: item.key }               : {}),
            ...(item.action === 'key'                    ? { inputAllow: !!item.inputAllow } : {}),
            ...(item.action === 'gesture' && item.trigger ? { trigger: item.trigger }        : {}),
            ...(item.action === 'instant' && item.timing  ? { timing: item.timing }          : {}),
            activate: item.activate !== undefined ? item.activate : true
        })
        return true
    }

    let parsedAsJson = false
    try {
        const parsed = JSON.parse(raw)
        const items = Array.isArray(parsed) ? parsed : [parsed]
        for (const item of items) { if (!pushItem(item)) return false }
        parsedAsJson = true
    } catch (_) {}

    if (!parsedAsJson) {
        const lines = raw.split('\n').filter(l => l.trim())
        for (const line of lines) {
            let item
            try {
                item = JSON.parse(line)
            } catch (_) {
                try {
                    new URL(line)
                    const res = await fetch(line)
                    if (!res.ok) throw new Error()
                    const fetched = await res.json()
                    const items = Array.isArray(fetched) ? fetched : [fetched]
                    for (const fi of items) { if (!pushItem(fi)) return false }
                    continue
                } catch (_) {
                    alert(i18n('invalidInputPrefix') + line)
                    return false
                }
            }
            if (!pushItem(item)) return false
        }
    }
    if (!imported.length) { alert(i18n('noScriptsToImport')); return false }
    storage[targetGroup].contents.push(...imported)
    return true
}

popup._parseImportGroup = async function(storage) {
    try {
        storage.push(JSON.parse(getCMImportValue(cmImport.group, this.form.groupImport)))
    } catch (_) {
        try {
            const urls = getCMImportValue(cmImport.group, this.form.groupImport).split('\n').filter(u => u.trim())
            for (const url of urls) {
                new URL(url)
                const res = await fetch(url)
                if (!res.ok) throw new Error()
                const data = await res.json()
                data.meta = url
                storage.push(data)
            }
        } catch (_) {
            alert(i18n('invalidInput'))
            return false
        }
    }
    return true
}

popup._save = async function() {
    if (this._flushBlockPresets) this._flushBlockPresets()
    const storage = await getStorage()
    if (actions.includes(edit.mode) || edit.mode === 'add') {
        this._autoFillName()
        const result = this._buildScriptData(storage)
        if (!result) return
        this._applyScriptToStorage(storage, result.targetGroup, result.data)
    } else if (edit.mode === 'import-script') {
        if (!await this._parseImportScript(storage)) return
    } else {
        if (!await this._parseImportGroup(storage)) return
    }
    edit.changed = false
    await setStorage(storage)
    reloadAll()
}

popup._exportScript = function() {
    if (this._flushBlockPresets) this._flushBlockPresets()
    const action = this.form.action.value
    const data = {
        action,
        name:   this.form.name.value,
        script: cmEditor ? cmEditor.getValue() : this.form.script.value,
    }
    const url = getCMUrlValue().split('\n').map(u => u.trim()).filter(Boolean)
    if (url.length) data.url = url
    if (action === 'key') {
        if (this.form.key.value) data.key = this.form.key.value
        if (this.form.keyInputAllow.checked) data.inputAllow = true
    }
    if (action === 'gesture' && this.form.gestureTrigger.value)
        data.trigger = this.form.gestureTrigger.value.toUpperCase()
    if (action === 'instant' && this.form.timing.value && this.form.timing.value !== 'start')
        data.timing = this.form.timing.value
    if (['instant', 'key', 'gesture'].includes(action) && this.form.scriptMode.value === 'preset') {
        data.scriptMode = 'preset'
        data.presetAction = this.form.presetAction.value
        delete data.script
    }
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    const btn = this.button.exportScript
    const orig = btn.textContent
    btn.innerHTML = icon.check
    setTimeout(() => { btn.textContent = orig }, 1500)
}

popup._delete = async function() {
    if (!confirm(i18n('deleteConfirm'))) return
    const storage = await getStorage()
    storage[edit.group].contents.splice(edit.nth, 1)
    edit.changed = false
    await setStorage(storage)
    reloadAll()
}

popup._deleteGroup = async function() {
    if (!confirm(i18n('deleteConfirm'))) return
    const storage = await getStorage()
    storage.splice(state.selectedGroup, 1)
    if (state.selectedGroup >= storage.length) state.selectedGroup = Math.max(0, storage.length - 1)
    await setStorage(storage)
    reloadAll()
}

popup._update = async function(trigger) {
    try {
        const groupIdx = state.selectedGroup
        const res = await fetch(trigger.innerText + '?update=' + Date.now())
        if (!res.ok) throw new Error()
        const response = await res.json()
        const storage = await getStorage()
        const newVer = response.version.split('.')
        const oldVer = storage[groupIdx].version.split('.')
        for (let i = 0; i < newVer.length; i++) {
            if (newVer[i] * 1 > (oldVer[i] || 0) * 1) {
                if (confirm(i18n('updateAvailable'))) {
                    response.meta = trigger.innerText
                    storage[groupIdx] = response
                    await setStorage(storage)
                    reloadAll()
                }
                return
            }
        }
        alert(i18n('alreadyLatest'))
    } catch (_) {
        alert(i18n('updateCheckFailed'))
    }
}

popup._reset = function() {
    const allFields = [
        this.wrapper.group, this.wrapper.name, this.wrapper.key, this.wrapper.gestureTrigger,
        this.wrapper.libraryId, this.wrapper.timing, this.wrapper.url, this.wrapper.script, this.wrapper.scriptImport,
        this.wrapper.groupImport, this.wrapper.actionSelect, this.wrapper.sourceLicense,
        this.button.delete, this.button.exportScript, this.button.discard,
        this.button.selectActionCopy, this.button.selectActionImport,
        this.button.saveHint
    ]
    allFields.forEach(el => el.classList.add('_hidden'))
    this.box.querySelectorAll(`.${CSS.error}`).forEach(el => el.classList.remove(CSS.error))
    this.box.querySelectorAll('._warn-edit, ._risk-edit').forEach(el => el.classList.remove('_warn-edit', '_risk-edit'))
    this.box.querySelectorAll('.field-warn-msg').forEach(el => el.remove())
    this.form.name.value = this.form.libraryId.value = this.form.key.value = this.form.gestureTrigger.value = this.form.script.value = this.form.scriptImport.value = this.form.groupImport.value = ''
    this.form.keyInputAllow.checked = false
    this.form.timing.value = 'start'
    this.form.scriptMode.value = 'script'
    this.form.presetAction.value = ''
    setCMValue('')
    setCMUrlValue('')
    if (cmImport.script) cmImport.script.setValue('')
    if (cmImport.group)  cmImport.group.setValue('')
    this._syncAll()
}

popup._renderMode = function(type) {
    const modeKey = edit.mode === 'add' ? 'add' : type
    const titleEl = this.box.querySelector('.popup-title')
    titleEl.innerText = this.setting.data[modeKey].title
    titleEl.classList.toggle('_hidden', !this.setting.data[modeKey].title)
    this.setting.data[modeKey].element.forEach(el => el.classList.remove('_hidden'))
    edit.mode = edit.mode === 'add' ? 'add' : type
}

popup._loadGroupDropdown = function(storage) {
    this.form.group.innerHTML = storage
        .map((g, i) => `<option value="${i}">${esc(g.name)}</option>`)
        .join('')
}

popup._fillFormFromContent = function(storage, trigger) {
    edit.group = state.selectedGroup
    edit.nth   = +trigger.dataset.nth
    const content = storage[edit.group].contents[edit.nth]
    this.form.group.value           = state.selectedGroup
    this.form.name.value            = content.name
    this.form.libraryId.value       = content.libraryId || ''
    this.form.key.value             = content.key || ''
    this.form.keyInputAllow.checked = content.inputAllow || false
    this.form.gestureTrigger.value  = content.trigger || ''
    this.form.timing.value          = content.timing || 'start'
    this.form.scriptMode.value      = content.scriptMode || 'script'
    this.form.presetAction.value   = content.presetAction || ''
    this.form.action.value          = trigger.dataset.action
    setCMUrlValue((content.url || []).join('\n'))
    this.form.script.value = content.script
    return content.script ?? ''
}

// scripts-container 리스트의 _warn / _risk 표시와 동일한 조건을 검사해
// 편집창의 해당 필드 라벨에 사유를 표시한다.
popup._highlightWarnFields = function(content, groupContents) {
    function set(wrapper, level, msg) {
        if (!wrapper) return
        wrapper.classList.add(level === 'risk' ? '_risk-edit' : '_warn-edit')
        const label = wrapper.querySelector('.field-label')
        if (!label) return
        let msgEl = label.querySelector('.field-warn-msg')
        if (!msgEl) {
            msgEl = document.createElement('span')
            msgEl.className = 'field-warn-msg'
            label.appendChild(msgEl)
        }
        msgEl.textContent = '⚠ ' + msg
    }

    // _warn 조건 (필수 입력 누락). preset 모드는 script 대신 presetAction을 검사.
    const scriptMsgs = []
    const isEmpty = content.scriptMode === 'preset' ? !content.presetAction : !content.script
    if (content.action !== 'note' && isEmpty) scriptMsgs.push(i18n('warnEmpty'))
    // preset 모드(빠른 설정)는 background에서 처리되므로 user scripts 불필요.
    if (!state.userScriptsAvailable
        && ['instant', 'key', 'gesture'].includes(content.action)
        && content.scriptMode !== 'preset') {
        scriptMsgs.push(i18n('warnUserScripts'))
    }
    if (scriptMsgs.length) set(this.wrapper.script, 'warn', scriptMsgs.join(' · '))

    if (content.action === 'key' && !content.key) {
        set(this.wrapper.key, 'warn', i18n('warnKeyEmpty'))
    }
    if (content.action === 'gesture' && !content.trigger) {
        set(this.wrapper.gestureTrigger, 'warn', i18n('warnGestureEmpty'))
    }
    if (content.action === 'library') {
        if (!content.libraryId) {
            set(this.wrapper.libraryId, 'warn', i18n('warnLibraryIdEmpty'))
        } else if (groupContents) {
            const dup = groupContents.filter(c => c.action === 'library' && c.libraryId === content.libraryId).length
            if (dup > 1) set(this.wrapper.libraryId, 'warn', i18n('warnLibraryIdDup'))
        }
    }

    // _risk 조건: 자동 실행 instant + 프리셋이지만 URL 미지정 → 모든 페이지에서 동작
    const isPreset =
        (['instant', 'key', 'gesture'].includes(content.action) && content.scriptMode === 'preset' && !!content.presetAction) ||
        (content.action === 'block' && (() => {
            const lines = (content.script || '').split('\n').map(s => s.trim()).filter(Boolean)
            return lines.length > 0 && lines.every(l => BLOCK_PATTERN_SET.has(l))
        })()) ||
        (content.action === 'user agent' && UA_PRESET_SET.has(content.script))
    if (content.action === 'instant' && isPreset && (!content.url || !content.url.filter(u => u).length)) {
        set(this.wrapper.url, 'risk', i18n('warnUrlEmpty'))
    }
}


popup._updateActionDisplay = function() {
    const isLocked = actions.includes(edit.mode) || edit.mode === 'add'
    const actionVal = this.form.action.value
    const displayEl = this.box.querySelector('.action-display')
    if (isLocked) {
        displayEl.classList.remove('_hidden')
        displayEl.textContent = actionVal
        displayEl.dataset.value = actionVal
        if (edit.mode === 'add') {
            this.wrapper.key.classList.toggle('_hidden',            actionVal !== 'key')
            this.wrapper.gestureTrigger.classList.toggle('_hidden', actionVal !== 'gesture')
            this.wrapper.url.classList.toggle('_hidden',            actionVal === 'note' || actionVal === 'library')
            this.wrapper.timing.classList.toggle('_hidden',         actionVal !== 'instant')
            this.wrapper.libraryId.classList.toggle('_hidden',      actionVal !== 'library')
        }
        const modeWrap = this.wrapper.script.querySelector('.script-mode-toggle-wrap')
        if (modeWrap) modeWrap.classList.toggle('_hidden', !['instant', 'key', 'gesture'].includes(actionVal))
        const uaModeWrap = this.wrapper.script.querySelector('.ua-mode-toggle-wrap')
        if (uaModeWrap) uaModeWrap.classList.toggle('_hidden', actionVal !== 'user agent')
        const blockModeWrap = this.wrapper.script.querySelector('.block-mode-toggle-wrap')
        if (blockModeWrap) blockModeWrap.classList.toggle('_hidden', actionVal !== 'block')
        const libraryHint = this.wrapper.script.querySelector('.library-hint')
        if (libraryHint) libraryHint.classList.toggle('_hidden', actionVal !== 'library')
    } else {
        displayEl.classList.add('_hidden')
    }
}

popup._updateFieldLabels = function() {
    const actionVal = this.form.action.value
    const scriptLabel = this.wrapper.script.querySelector('.field-label')
    const urlLabel    = this.wrapper.url.querySelector('.field-label')
    if (urlLabel) urlLabel.innerHTML = `${i18n('urlPatternLabel')} <span class="field-hint">— ${i18n('urlPatternHint')}</span>`
    if (actionVal === 'block') {
        if (scriptLabel) scriptLabel.innerHTML = i18n('blockUrlPatternLabel')
        this.form.script.placeholder = '*ads.example.com*\n*tracker.com/script.js*'
    } else {
        if (scriptLabel) scriptLabel.innerHTML = actionVal === 'note' ? i18n('noteContentLabel') : i18n('scriptLabel')
        this.form.script.placeholder = actionVal === 'note' ? i18n('noteContentHolder') : i18n('scriptHolder')
    }
}

popup._setupEditors = function() {
    const actionVal = this.form.action.value
    if (actions.includes(edit.mode) || edit.mode === 'add') {
        setupCMEditor(this.form.script.value, getCMMode(actionVal))
    }
    if (!this.wrapper.url.classList.contains('_hidden')) {
        setupCMUrlEditor(getCMUrlValue())
    }
    if (!this.wrapper.scriptImport.classList.contains('_hidden')) {
        setupCMImportEditor('script', this.form.scriptImport, this.form.scriptImport.value)
    }
    if (!this.wrapper.groupImport.classList.contains('_hidden')) {
        setupCMImportEditor('group', this.form.groupImport, this.form.groupImport.value)
    }
}

popup._show = function(loadedScript) {
    this._syncAll()
    if (loadedScript !== null) setCMValue(loadedScript)
    this.box.classList.remove(CSS.closing)
    this.dim.classList.remove(CSS.closing)
    this.box.classList.add(CSS.open)
    this.dim.classList.add(CSS.open)
    const popupBody = find('.popup-body')
    requestAnimationFrame(() => {
        popupBody.scrollTop = 0
        if (cmEditor) cmEditor.refresh()
        if (cmUrlEditor) cmUrlEditor.refresh()
        updateFade(popupBody)
    })
}

popup._open = async function(type, trigger) {
    let loadedScript = null
    let editingContent = null
    let editingGroupContents = null
    this._reset()
    this._renderMode(type)
    if (edit.mode === 'add' || actions.includes(edit.mode)) {
        const storage = await getStorage()
        this._loadGroupDropdown(storage)
        if (actions.includes(type) && trigger) {
            loadedScript = this._fillFormFromContent(storage, trigger)
            editingContent = storage[edit.group].contents[edit.nth]
            editingGroupContents = storage[edit.group].contents
        } else {
            this.form.group.value = state.selectedGroup
        }
    }
    this._updateActionDisplay()
    this._updateFieldLabels()
    // _updateFieldLabels가 .field-label.innerHTML을 변경하므로 그 다음에 호출.
    if (editingContent) this._highlightWarnFields(editingContent, editingGroupContents)
    this._setupEditors()
    this._show(loadedScript)
}

export const scriptEditFields = [
    popup.wrapper.group, popup.wrapper.name,
    popup.wrapper.url, popup.wrapper.script, popup.button.delete, popup.button.exportScript, popup.button.saveHint
]

export const libraryEditFields = [
    popup.wrapper.group, popup.wrapper.name, popup.wrapper.libraryId,
    popup.wrapper.script, popup.button.delete, popup.button.exportScript, popup.button.saveHint
]

popup.setting.data = {
    'select-action': { title: i18n('selectScriptTypeTitle'),
                       element: [popup.wrapper.actionSelect, popup.button.selectActionCopy, popup.button.selectActionImport] },
    add:    { title: '',
              element: [popup.wrapper.group, popup.wrapper.name, popup.wrapper.url, popup.wrapper.script, popup.button.saveHint] },
    import: { title: i18n('importGroupTitle'),
              element: [popup.wrapper.groupImport, popup.button.saveHint] },
    source: { title: i18n('openSourceLicenseTitle'),
              element: [popup.wrapper.sourceLicense] },
    'user agent': { title: '', element: scriptEditFields },
    instant:      { title: '', element: [...scriptEditFields.slice(0, 4), popup.wrapper.timing, ...scriptEditFields.slice(4)] },
    style:        { title: '', element: scriptEditFields },
    key:          { title: '',
                    element: [...scriptEditFields.slice(0, 3), popup.wrapper.key, ...scriptEditFields.slice(3)] },
    gesture:      { title: '',
                    element: [...scriptEditFields.slice(0, 3), popup.wrapper.gestureTrigger, ...scriptEditFields.slice(3)] },
    'import-script': { title: i18n('scriptImportTitle'),
                       element: [popup.wrapper.scriptImport, popup.button.saveHint] },
    note:    { title: '',
               element: [popup.wrapper.group, popup.wrapper.name, popup.wrapper.script, popup.button.delete, popup.button.exportScript, popup.button.saveHint] },
    block:   { title: '', element: scriptEditFields },
    library: { title: '', element: libraryEditFields }
}

export function syncDiscardBtn() {
    popup.button.discard.classList.toggle('_hidden', !(edit.changed && actions.includes(edit.mode)))
}

popup._closeUI = function() {
    edit.mode = ''; edit.group = edit.nth = 0
    edit.changed = false
    syncDiscardBtn()
    if (!this.box.classList.contains(CSS.open)) return
    this.box.classList.add(CSS.closing)
    this.dim.classList.add(CSS.closing)
    this.box.classList.remove(CSS.open)
    this.dim.classList.remove(CSS.open)
    const onEnd = (e) => {
        if (e.target !== this.box || e.animationName !== 'popup-out') return
        this.box.removeEventListener('animationend', onEnd)
        this.box.classList.remove(CSS.closing)
        this.dim.classList.remove(CSS.closing)
        if (!this.box.classList.contains(CSS.open)) this._reset()
    }
    this.box.addEventListener('animationend', onEnd)
}

popup.discard = function() {
    if (this._stopRecording) this._stopRecording()
    if (edit.changed && !confirm(i18n('discardChangesConfirm'))) return
    this._closeUI()
}

// Done: 저장이 필요한 모드면 저장, 아니면 그냥 닫기
popup.close = function() {
    if (this._stopRecording) this._stopRecording()
    const alwaysSave = edit.mode === 'add' || edit.mode === 'import' || edit.mode === 'import-script'
    const saveIfChanged = actions.includes(edit.mode) && edit.changed
    if (alwaysSave || saveIfChanged) {
        this._save()
    } else {
        this._closeUI()
    }
}

popup.closer.forEach(el => el.addEventListener('click', () => popup.discard()))

// 폼 input 변경 감지 (script는 CodeMirror change 이벤트로 별도 처리).
popup.box.querySelectorAll('[name]').forEach(el => {
    if (el.name === 'script') return
    el.addEventListener('input', () => { edit.changed = true; syncDiscardBtn() })
})

// 사용자가 입력하면 해당 필드의 warn/risk 표시 자동 제거.
popup.box.addEventListener('input', e => {
    const field = e.target.closest('.field')
    if (field) field.classList.remove('_warn-edit', '_risk-edit')
}, true)
