// gesture 액션의 트리거 입력기.
// modifier(LMB/RMB) 토글 + 방향(UDLR) 또는 휠(WU/WD) suffix를 조합해 'LMB+RMB+UD' 같은 값을 만든다.

import { i18n } from '../utils.js'
import { ATTR, CSS, MODIFIERS, DIR_ARROW, LABEL_MAP } from '../constants.js'
import { state } from '../state.js'
import { popup, syncDiscardBtn } from '../popup.js'

export function initGesturePad() {
    const { edit } = state
    const field   = popup.box.querySelector(`.field[${ATTR.field}=gesture-trigger]`)
    const input   = popup.form.gestureTrigger
    const display = field.querySelector('.gesture-display')

    // value 구조: modifier들을 '+' 로 이어붙인 뒤 suffix(방향 or 휠) 추가
    // 예: 'LMB+RMB+UD', 'RMB+LR'
    function parseValue(val) {
        const parts = val ? val.split('+') : []
        const modifiers = []
        let suffix = ''
        for (const p of parts) {
            if (MODIFIERS.has(p)) modifiers.push(p)
            else suffix = p
        }
        return { modifiers, suffix }
    }

    function buildValue(modifiers, suffix) {
        if (!modifiers.length) return ''
        return suffix ? [...modifiers, suffix].join('+') : modifiers.join('+')
    }

    function renderDisplay() {
        const val = input.value
        const { modifiers, suffix } = parseValue(val)
        const hasDirections = suffix && /^[UDLR]+$/.test(suffix)
        const hasWheel = suffix === 'WU' || suffix === 'WD'

        if (!val) {
            display.innerHTML = `<span class="gesture-placeholder">${i18n('gestureSelectPrompt')}</span>`
        } else {
            display.innerHTML = val.split('+').map((part, i) => {
                const sep = i > 0 ? '<span class="gesture-sep">+</span>' : ''
                if (/^[UDLR]+$/.test(part)) {
                    return sep + [...part].map(ch => `<div class="gesture-chip gesture-chip-dir">${DIR_ARROW[ch]}</div>`).join('')
                }
                return sep + `<div class="gesture-chip">${LABEL_MAP[part] ?? part}</div>`
            }).join('')
        }

        // 활성 상태: modifier는 토글, 휠은 suffix 일치
        field.querySelectorAll('.gp-set-btn').forEach(b => {
            const t = b.dataset.trigger
            b.classList.toggle(CSS.active, modifiers.includes(t) || suffix === t)
        })

        // 비활성화: 방향 버튼은 휠 선택 시 또는 modifier 없을 때, 휠 버튼은 방향 선택 시 또는 modifier 없을 때
        field.querySelectorAll('.gp-dir-btn').forEach(b => { b.disabled = !!(hasWheel || !modifiers.length) })
        field.querySelectorAll('.gp-set-btn').forEach(b => {
            if (b.dataset.trigger === 'WU' || b.dataset.trigger === 'WD') {
                b.disabled = !!(hasDirections || !modifiers.length)
            }
        })
    }

    field.addEventListener('click', e => {
        const btn = e.target.closest('.gp-btn')
        if (!btn || btn.disabled) return

        const { modifiers, suffix } = parseValue(input.value)

        if (btn.classList.contains('gp-dir-btn')) {
            if (!modifiers.length) return
            const dir = btn.dataset.dir
            const dirPart = /^[UDLR]*$/.test(suffix) ? suffix : ''
            if (dirPart.slice(-1) === dir) return  // 연속 중복 방지
            input.value = buildValue(modifiers, dirPart + dir)

        } else if (btn.classList.contains('gp-back-btn')) {
            if (suffix) {
                if (/^[UDLR]{2,}$/.test(suffix)) {
                    input.value = buildValue(modifiers, suffix.slice(0, -1))
                } else {
                    input.value = buildValue(modifiers, '')
                }
            } else {
                input.value = buildValue(modifiers.slice(0, -1), '')
            }

        } else if (btn.classList.contains('gp-set-btn')) {
            const trigger = btn.dataset.trigger
            if (MODIFIERS.has(trigger)) {
                // modifier 토글
                const newMods = modifiers.includes(trigger)
                    ? modifiers.filter(m => m !== trigger)
                    : [...modifiers, trigger]
                input.value = buildValue(newMods, suffix)
            } else {
                // WU / WD: suffix 교체
                if (!modifiers.length) return
                input.value = buildValue(modifiers, trigger)
            }
        }

        renderDisplay()
        edit.changed = true
        syncDiscardBtn()
        field.classList.remove('_warn-edit', '_risk-edit')
    })

    popup._registerSync(renderDisplay)
}
