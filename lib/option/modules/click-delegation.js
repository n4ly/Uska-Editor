// 페이지 전역의 click/input 위임 이벤트들을 한 곳에서 관리한다.
// - 사이드바 그룹 선택
// - 컨텐츠 헤더의 그룹 색상 변경
// - data-action 기반의 모든 액션 위임 (편집/삭제/내보내기/그룹 추가 등)
// - 그룹 헤더 인라인 편집 종료(외부 클릭 시 저장)

import { i18n, find, getCurrentUrl } from '../utils.js'
import { icon } from '../constants.js'
import { state } from '../state.js'
import { renderSidebar, renderContent } from '../render.js'
import { popup } from '../popup.js'
import { getStorage, setStorage, reloadAll } from '../../shared/storage.js'
import { PROMPT_GENERAL } from '../ai-prompt.js'

// 그룹 헤더 인라인 편집 종료 + 저장. Enter / 외부 클릭에서 호출.
export async function exitGroupEdit() {
    if (!state.headerEditSnapshot) return
    state.headerEditSnapshot = null
    const header = find('.content-header')
    if (!header) return
    const nameEl = header.querySelector('.ch-name')
    const newName = nameEl ? nameEl.textContent.trim() : ''
    const storage = await getStorage()
    if (newName) storage[state.selectedGroup].name = newName
    await setStorage(storage)
    reloadAll()
}

// 그룹 헤더 인라인 편집 취소. 원래 이름 복원 + reload 없음. Esc에서 호출.
export function cancelGroupEdit() {
    const original = state.headerEditSnapshot
    if (!original || typeof original !== 'string') return
    state.headerEditSnapshot = null
    const header = find('.content-header')
    if (!header) return
    const nameEl = header.querySelector('.ch-name')
    if (nameEl) {
        nameEl.textContent = original
        nameEl.contentEditable = 'false'
        nameEl.blur()
    }
    const editIcon = header.querySelector('.ch-edit-icon')
    if (editIcon) editIcon.classList.remove('_hidden')
}

export function initClickDelegation() {
    // ── 사이드바 그룹 선택 ───────────────────────────────
    find('.sidebar').addEventListener('click', function (e) {
        if (e.target.closest('[data-action]')) return
        const group = e.target.closest('.sidebar-group')
        if (!group) return
        const idx = +group.dataset.group
        if (idx === state.selectedGroup) return
        state.selectedGroup = idx
        chrome.storage.local.set({ lastGroup: idx })
        Promise.all([getStorage(), getCurrentUrl()]).then(([storage, currentUrl]) => {
            renderSidebar(storage, currentUrl)
            renderContent(storage, idx, currentUrl)
        })
    })

    // ── 그룹 제목 인라인 편집 키 처리 ───────────────────────
    document.addEventListener('keydown', async function (e) {
        if (!state.headerEditSnapshot) return
        if (e.key === 'Enter') { e.preventDefault(); await exitGroupEdit() }
        else if (e.key === 'Escape') { e.preventDefault(); cancelGroupEdit() }
    })

    // ── 컨텐츠 헤더 색상 변경 (그룹 테마) ────────────────
    document.addEventListener('input', function (e) {
        const input = e.target.closest('.ch-color-input')
        if (!input) return
        const color = input.value
        getStorage().then(async storage => {
            storage[state.selectedGroup].theme.background = color
            await setStorage(storage)
            const currentUrl = await getCurrentUrl()
            renderSidebar(storage, currentUrl)
        })
    })

    // ── data-action 위임 핸들러 ──────────────────────────
    document.addEventListener('click', async function (e) {
        // 그룹 인라인 편집 중 외부 클릭 시 저장
        if (state.headerEditSnapshot && !e.target.closest('.content-header')) {
            await exitGroupEdit()
            return
        }

        if (e.target.matches('.activate-check:disabled')) return

        const trigger = e.target.closest('[data-action]')
        if (!trigger) return

        if (trigger.dataset.action === 'discard') {
            popup._closeUI()
            return
        }

        if (trigger.dataset.action === 'done') {
            popup.close()
            return
        }

        if (trigger.dataset.action === 'activate') {
            const checkbox = trigger.previousElementSibling
            if (checkbox.disabled) return
            const newState = !checkbox.checked
            checkbox.checked = newState
            ;(async () => {
                const storage = await getStorage()
                const nth = +trigger.closest('li.line').dataset.nth
                storage[state.selectedGroup]['contents'][nth].activate = newState
                await setStorage(storage)
                chrome.runtime.sendMessage({ type: 'ua-update' })
                const currentUrl = await getCurrentUrl()
                renderSidebar(storage, currentUrl)
                renderContent(storage, state.selectedGroup, currentUrl)
            })()
            return
        }

        if (trigger.dataset.action === 'toggle-group') {
            const checkbox = trigger.previousElementSibling
            const newState = !checkbox.checked
            checkbox.checked = newState
            ;(async () => {
                const groupIdx = +trigger.closest('.sidebar-group').dataset.group
                const storage = await getStorage()
                storage[groupIdx].activate = newState
                await setStorage(storage)
                reloadAll()
            })()
            return
        }

        if (trigger.dataset.action === 'copy-prompt') {
            const originalText = trigger.textContent
            navigator.clipboard.writeText(PROMPT_GENERAL.trim())
            trigger.innerHTML = icon.check
            setTimeout(() => { trigger.textContent = originalText }, 1500)
            return
        }

        if (trigger.dataset.action === 'export-group') {
            const storage = await getStorage()
            navigator.clipboard.writeText(JSON.stringify(storage[state.selectedGroup], null, 2))
            const orig = trigger.innerHTML
            trigger.innerHTML = icon.check
            setTimeout(() => { trigger.innerHTML = orig }, 1500)
            return
        }

        if (trigger.dataset.action === 'edit-group') {
            if (state.headerEditSnapshot) return
            const header = find('.content-header')
            const editIcon = header.querySelector('.ch-edit-icon')
            if (editIcon) editIcon.classList.add('_hidden')
            const nameEl = header.querySelector('.ch-name')
            // Esc 시 복원할 수 있도록 원래 이름 저장 (truthy로 편집 모드 식별).
            state.headerEditSnapshot = nameEl.textContent
            nameEl.contentEditable = 'true'
            nameEl.focus()
            const range = document.createRange()
            range.selectNodeContents(nameEl)
            const sel = window.getSelection()
            sel.removeAllRanges()
            sel.addRange(range)
            return
        }

        if (trigger.dataset.action === 'pick-action') {
            popup.form.action.value = trigger.dataset.value
            popup.setting('add')
            return
        }

        if (trigger.dataset.action === 'new-group') {
            ;(async () => {
                const storage = await getStorage()
                const base = i18n('newGroupName')
                const names = new Set(storage.map(g => g.name))
                let name = base
                for (let i = 1; names.has(name); i++) name = `${base}(${i})`
                storage.push({
                    meta: '', name,
                    theme: { background: '#2c3e50' },
                    activate: true,
                    version: '', contents: [], parameter: []
                })
                state.selectedGroup = storage.length - 1
                await setStorage(storage)
                reloadAll()
            })()
            return
        }

        popup.setting(trigger.dataset.action, trigger, e)
    })
}
