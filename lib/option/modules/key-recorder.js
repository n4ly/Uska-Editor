// 단축키 기록 (key 액션의 키 입력 캡처).
// Mousetrap.record를 사용해 사용자가 누른 키 시퀀스를 폼 값으로 변환한다.

import { i18n } from '../utils.js'
import { CSS, KEY_LABELS } from '../constants.js'
import { state } from '../state.js'
import { popup, syncDiscardBtn } from '../popup.js'

export function initKeyRecorder() {
    const { edit } = state
    const btn         = popup.box.querySelector('.key-record-btn')
    const clearBtn    = popup.box.querySelector('.key-clear-btn')
    const wrap        = popup.box.querySelector('.key-input-wrap')
    const inp         = popup.form.key
    const chipDisplay = popup.box.querySelector('.key-chip-display')

    function renderChips() {
        const val = inp.value.trim()
        if (!val) {
            const ph = Mousetrap.recording ? i18n('pressKeyPrompt') : i18n('shortcutHolder')
            chipDisplay.innerHTML = `<span class="key-chip-placeholder">${ph}</span>`
            return
        }
        chipDisplay.innerHTML = val.split(' ').map((combo, si) => {
            const seqSep = si > 0 ? '<span class="gesture-sep">·</span>' : ''
            return seqSep + combo.split('+').map((part, i) => {
                const sep = i > 0 ? '<span class="gesture-sep">+</span>' : ''
                const label = KEY_LABELS[part.toLowerCase()] ?? part.toUpperCase()
                return sep + `<span class="gesture-chip">${label}</span>`
            }).join('')
        }).join('')
    }

    function syncClear() {
        wrap.classList.toggle(CSS.hasValue, !!inp.value)
        renderChips()
    }

    function stopRecording() {
        Mousetrap.recording = false
        btn.textContent = i18n('recordBtn')
        btn.classList.remove(CSS.recording)
        inp.classList.remove(CSS.recording)
        renderChips()
    }

    btn.addEventListener('click', () => {
        if (Mousetrap.recording) { stopRecording(); return }

        Mousetrap.recording = true
        btn.textContent = i18n('cancelRecordBtn')
        btn.classList.add(CSS.recording)
        inp.classList.add(CSS.recording)
        renderChips()

        Mousetrap.record(function (sequence) {
            inp.value = sequence.join(' ')
            edit.changed = true
            stopRecording()
            syncClear()
            syncDiscardBtn()
            popup.wrapper.key.classList.remove('_warn-edit', '_risk-edit')
        })
    })

    clearBtn.addEventListener('click', () => {
        inp.value = ''
        edit.changed = true
        syncClear()
        syncDiscardBtn()
    })

    popup._registerSync(syncClear)
    popup._stopRecording  = () => { if (Mousetrap.recording) stopRecording() }

    window.addEventListener('blur', popup._stopRecording)
    document.addEventListener('mousedown', e => {
        if (Mousetrap.recording && !e.target.closest('.key-record-wrap, .key-record-btn')) {
            stopRecording()
        }
    })
}
