// user agent 액션의 입력 모드 토글 (input vs preset).
// preset 모드에서는 미리 정의된 UA 문자열 버튼을 선택해 CM 값을 채운다.

import { ATTR, CSS, UA_PRESET_SET } from '../constants.js'
import { state } from '../state.js'
import { popup, syncDiscardBtn, syncCMDisplay, setCMValue, cmEditor } from '../popup.js'

export function initUaPresets() {
    const { edit } = state
    const field     = popup.box.querySelector(`.field[${ATTR.field}=script]`)
    const modeWrap  = field.querySelector('.ua-mode-toggle-wrap')
    const uaSelect  = field.querySelector('.ua-preset-select')

    function syncUaMode(mode) {
        field.querySelectorAll('.ua-mode-btn').forEach(b => b.classList.toggle(CSS.active, b.dataset.mode === mode))
        syncCMDisplay()
        uaSelect.classList.toggle('_hidden', mode === 'input')
        if (mode !== 'input') {
            const current = (cmEditor ? cmEditor.getValue() : '').trim()
            field.querySelectorAll('.ua-preset-btn').forEach(b => b.classList.toggle(CSS.active, b.dataset.ua === current))
        }
    }

    modeWrap.addEventListener('click', e => {
        const btn = e.target.closest('.ua-mode-btn')
        if (!btn || btn.classList.contains(CSS.active)) return
        syncUaMode(btn.dataset.mode)
    })

    uaSelect.addEventListener('click', e => {
        if (e.target.closest('.ba-clear')) {
            field.querySelectorAll('.ua-preset-btn').forEach(b => b.classList.remove(CSS.active))
            setCMValue('')
            edit.changed = true
            syncDiscardBtn()
            return
        }
        const btn = e.target.closest('.ua-preset-btn')
        if (!btn) return
        if (btn.classList.contains(CSS.active)) return
        setCMValue(btn.dataset.ua)
        field.querySelectorAll('.ua-preset-btn').forEach(b => b.classList.toggle(CSS.active, b === btn))
        edit.changed = true
        syncDiscardBtn()
    })

    // 편집 시 저장값이 UA 프리셋과 일치하면 preset 모드로 시작.
    popup._registerSync(() => {
        const current = (cmEditor ? cmEditor.getValue() : '').trim()
        syncUaMode(UA_PRESET_SET.has(current) ? 'preset' : 'input')
    })
}
