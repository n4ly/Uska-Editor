// 편집 모달의 두 토글 버튼 그룹: 스크립트 모드(script/preset)와 타이밍(start/end/idle).
// 둘 다 popup의 sync 등록을 통해 모달이 열릴 때 현재 값으로 동기화된다.

import { ATTR, CSS } from '../constants.js'
import { state } from '../state.js'
import { popup, syncDiscardBtn, syncCMDisplay } from '../popup.js'

export function initScriptModeToggle() {
    const { edit } = state
    const scriptField = popup.box.querySelector(`.field[${ATTR.field}=script]`)
    const baSelect    = popup.box.querySelector('.preset-action-select')

    function syncMode(mode) {
        scriptField.querySelectorAll('.script-mode-toggle-wrap .script-mode-btn').forEach(b => {
            b.classList.toggle(CSS.active, b.dataset.mode === mode)
        })
        popup.form.scriptMode.value = mode
        syncCMDisplay()
        if (baSelect) baSelect.classList.toggle('_hidden', mode === 'script')
        const baVal = popup.form.presetAction.value
        popup.box.querySelectorAll('.ba-btn').forEach(b => b.classList.toggle(CSS.active, !!baVal && b.dataset.ba === baVal))
    }

    scriptField.querySelectorAll('.script-mode-toggle-wrap .script-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains(CSS.active)) return
            syncMode(btn.dataset.mode)
            edit.changed = true
            syncDiscardBtn()
        })
    })

    popup.box.querySelectorAll('.ba-btn').forEach(btn => {
        btn.insertAdjacentHTML('beforeend', '<span class="ba-clear">✕</span>')
    })

    popup.box.querySelectorAll('.ba-btn:not(.ua-preset-btn)').forEach(btn => {
        btn.addEventListener('click', e => {
            if (e.target.closest('.ba-clear')) {
                popup.box.querySelectorAll('.ba-btn').forEach(b => b.classList.remove(CSS.active))
                popup.form.presetAction.value = ''
                edit.changed = true
                syncDiscardBtn()
                return
            }
            if (btn.classList.contains(CSS.active)) return
            popup.box.querySelectorAll('.ba-btn').forEach(b => b.classList.remove(CSS.active))
            btn.classList.add(CSS.active)
            popup.form.presetAction.value = btn.dataset.ba
            edit.changed = true
            syncDiscardBtn()
        })
    })

    popup._registerSync(() => syncMode(popup.form.scriptMode.value || 'script'))
}

export function initTimingToggle() {
    const { edit } = state
    const timingField = popup.box.querySelector(`.field[${ATTR.field}=timing]`)
    if (!timingField) return

    function syncTiming(val) {
        timingField.querySelectorAll('.timing-btn').forEach(b => {
            b.classList.toggle(CSS.active, b.dataset.timing === val)
        })
        popup.form.timing.value = val
    }

    timingField.querySelectorAll('.timing-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains(CSS.active)) return
            syncTiming(btn.dataset.timing)
            edit.changed = true
            syncDiscardBtn()
        })
    })

    popup._registerSync(() => syncTiming(popup.form.timing.value || 'start'))
}
