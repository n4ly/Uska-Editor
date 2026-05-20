// block 액션의 입력 모드 토글 (input vs preset).
// preset 모드에서는 광고/추적 도메인 패턴 묶음을 선택/해제할 수 있고,
// 저장 시 popup._flushBlockPresets로 CM에 반영된다.

import { ATTR, CSS, BLOCK_PRESETS, BLOCK_PATTERN_SET } from '../constants.js'
import { state } from '../state.js'
import { popup, syncDiscardBtn, syncCMDisplay, setCMValue, cmEditor } from '../popup.js'

export function initBlockPresets() {
    const { edit } = state
    const field       = popup.box.querySelector(`.field[${ATTR.field}=script]`)
    const modeWrap    = field.querySelector('.block-mode-toggle-wrap')
    const blockSelect = field.querySelector('.block-preset-select')

    // preset 모드의 source of truth. null이면 input 모드(CM이 원본)
    let presetLines = null

    function getLines() {
        if (presetLines !== null) return presetLines
        const raw = cmEditor ? cmEditor.getValue() : popup.form.script.value
        return new Set(raw.split('\n').map(s => s.trim()).filter(Boolean))
    }

    function isActive(preset) {
        return preset.patterns.every(p => getLines().has(p))
    }

    function togglePreset(preset, item) {
        const lines = getLines()
        if (isActive(preset)) {
            preset.patterns.forEach(p => lines.delete(p))
            item.classList.remove(CSS.active)
        } else {
            preset.patterns.forEach(p => lines.add(p))
            item.classList.add(CSS.active)
        }
        edit.changed = true
        syncDiscardBtn()
    }

    function syncBlockSelect() {
        blockSelect.querySelectorAll('.bp-item').forEach(item => {
            const preset = BLOCK_PRESETS.find(p => p.id === item.dataset.id)
            if (preset) item.classList.toggle(CSS.active, isActive(preset))
        })
    }

    function syncBlockMode(mode) {
        if (mode === 'preset' && presetLines === null) {
            const raw = cmEditor ? cmEditor.getValue() : popup.form.script.value
            presetLines = new Set(raw.split('\n').map(s => s.trim()).filter(Boolean))
        } else if (mode === 'input' && presetLines !== null) {
            setCMValue([...presetLines].join('\n'))
            presetLines = null
        }
        field.querySelectorAll('.block-mode-btn').forEach(b => b.classList.toggle(CSS.active, b.dataset.mode === mode))
        syncCMDisplay()
        blockSelect.classList.toggle('_hidden', mode === 'input')
        if (mode === 'preset') syncBlockSelect()
    }

    // 항목 빌드
    BLOCK_PRESETS.forEach(preset => {
        const item = document.createElement('div')
        item.className = 'bp-item'
        item.dataset.id = preset.id
        item.innerHTML = `<span class="bp-checkbox"></span><div class="bp-info"><span class="bp-name">${preset.name}</span><span class="bp-desc">${preset.desc}</span></div>`
        blockSelect.appendChild(item)
        item.addEventListener('click', () => togglePreset(preset, item))
    })

    modeWrap.addEventListener('click', e => {
        const btn = e.target.closest('.block-mode-btn')
        if (!btn || btn.classList.contains(CSS.active)) return
        syncBlockMode(btn.dataset.mode)
    })

    // preset 모드에서 저장 시 CM에 반영
    popup._flushBlockPresets = function() {
        if (presetLines === null) return
        if (presetLines.size === 0) {
            presetLines = null
            syncBlockMode('input')
        } else {
            setCMValue([...presetLines].join('\n'))
            presetLines = null
        }
    }

    // 편집 시 저장된 모든 라인이 알려진 BLOCK_PRESETS에 속하면 preset 모드로 시작.
    popup._registerSync(() => {
        presetLines = null
        const raw = cmEditor ? cmEditor.getValue() : popup.form.script.value
        const lines = raw.split('\n').map(s => s.trim()).filter(Boolean)
        const allPreset = lines.length > 0 && lines.every(l => BLOCK_PATTERN_SET.has(l))
        syncBlockMode(allPreset ? 'preset' : 'input')
    })
}
