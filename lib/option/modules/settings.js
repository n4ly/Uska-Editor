// 설정 팝업 (테마, 전체 import/export, 초기화) + 사용자 스크립트 허용 확인 모달.
// 두 모달 모두 popup 객체와 무관한 독립적인 모달이다.

import { i18n, find, esc } from '../utils.js'
import { CSS } from '../constants.js'
import { state } from '../state.js'
import { getStorage, setStorage, reloadAll } from '../../shared/storage.js'

// 첫 진입 시 chrome.userScripts API 사용 가능 여부 확인 → 비활성화 시 안내 모달 표시.
// "다시 알리지 않음"으로 닫으면 storage에 플래그 저장하여 이후 표시 생략.
export async function initUserScriptsWarning() {
    const dim   = find('#us-warning-dim')
    const popup = find('#us-warning-popup')
    const closeBtn = find('#us-warning-close-btn')
    const dismissBtn = find('#us-warning-dismiss-btn')

    function close() {
        popup.classList.add(CSS.closing)
        dim.classList.add(CSS.closing)
        popup.classList.remove(CSS.open)
        dim.classList.remove(CSS.open)
        const onEnd = () => { popup.classList.remove(CSS.closing); dim.classList.remove(CSS.closing) }
        popup.addEventListener('animationend', onEnd, { once: true })
    }

    closeBtn.addEventListener('click', close)
    dim.addEventListener('click', close)
    dismissBtn.addEventListener('click', () => {
        chrome.storage.local.set({ usWarningDismissed: true })
        close()
    })

    const { usWarningDismissed } = await chrome.storage.local.get('usWarningDismissed')

    // chrome.userScripts.register([])는 토글 OFF 상태에서 명확히 throw하므로
    // 활성 여부 검사로 사용 (빈 배열이라 실제 등록은 일어나지 않음).
    try {
        if (!chrome.userScripts) throw new Error('userScripts API undefined')
        await chrome.userScripts.register([])
    } catch (_) {
        state.userScriptsAvailable = false
        if (!usWarningDismissed) {
            dim.classList.add(CSS.open)
            popup.classList.add(CSS.open)
        }
        // user scripts 비활성 상태가 확정된 후 사이드바/스크립트 목록 재렌더해 warn 표시 반영.
        reloadAll()
    }
}

export function initSettings() {
    const settingsDim   = find('#settings-dim')
    const settingsPopup = find('#settings-popup')

    function openSettings() {
        settingsDim.classList.add(CSS.open)
        settingsPopup.classList.add(CSS.open)
    }

    function closeSettings() {
        settingsPopup.classList.add(CSS.closing)
        settingsDim.classList.add(CSS.closing)
        settingsPopup.classList.remove(CSS.open)
        settingsDim.classList.remove(CSS.open)
        const onEnd = (e) => {
            if (e.target !== settingsPopup || e.animationName !== 'popup-out') return
            settingsPopup.removeEventListener('animationend', onEnd)
            settingsPopup.classList.remove(CSS.closing)
            settingsDim.classList.remove(CSS.closing)
        }
        settingsPopup.addEventListener('animationend', onEnd)
    }

    find('#settings-open-btn').addEventListener('click', openSettings)
    find('#settings-close-btn').addEventListener('click', closeSettings)
    find('#settings-done-btn').addEventListener('click', closeSettings)
    settingsDim.addEventListener('click', closeSettings)

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && settingsPopup.classList.contains(CSS.open)) closeSettings()
    })

    // ── 테마 토글 ─────────────────────────────────────────
    const themeSegmented = find('#theme-segmented')

    function applyTheme(theme) {
        document.documentElement.classList.toggle('theme-dark', theme === 'dark')
        themeSegmented.querySelectorAll('.theme-seg-btn').forEach(btn => {
            btn.classList.toggle(CSS.active, btn.dataset.theme === theme)
        })
    }

    chrome.storage.local.get('theme', ({ theme }) => applyTheme(theme || 'light'))

    themeSegmented.addEventListener('click', e => {
        const btn = e.target.closest('.theme-seg-btn')
        if (!btn || btn.classList.contains(CSS.active)) return
        const theme = btn.dataset.theme
        applyTheme(theme)
        chrome.storage.local.set({ theme })
    })

    // ── 전체 내보내기 ──────────────────────────────────────
    find('#settings-export-btn').addEventListener('click', async () => {
        const storage = await getStorage()
        const json = JSON.stringify(storage, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `uska-backup-${new Date().toISOString().slice(0,10)}.json`
        a.click()
        URL.revokeObjectURL(url)
    })

    // ── 전체 가져오기 ──────────────────────────────────────
    const importFileInput = find('#settings-import-file')

    find('#settings-import-btn').addEventListener('click', () => importFileInput.click())

    importFileInput.addEventListener('change', async e => {
        const file = e.target.files[0]
        if (!file) return
        try {
            const text = await file.text()
            const incoming = JSON.parse(text)
            if (!Array.isArray(incoming)) throw new Error()
            showImportSelect(incoming)
        } catch {
            alert(i18n('invalidJsonFile'))
        }
        e.target.value = ''
    })

    function showImportSelect(groups) {
        const dim        = find('#import-select-dim')
        const box        = find('#import-select-popup')
        const list       = find('#import-select-list')
        const confirmBtn = find('#import-select-confirm')
        const toggleBtn  = find('#import-select-toggle')
        const closeBtn   = find('#import-select-close')
        const cancelBtn  = find('#import-select-cancel')

        list.innerHTML = groups.map((g, i) => `
            <li>
                <label class="import-group-item">
                    <input type="checkbox" class="import-group-check" data-idx="${i}" checked>
                    <span class="igr-toggle"></span>
                    <span class="igr-dot" style="background:${esc(g.theme?.background || 'var(--text-muted)')}"></span>
                    <span class="igr-name">${esc(g.name || i18n('nameEmpty'))}</span>
                    <span class="igr-count">${g.contents?.length ?? 0}${i18n('itemCountSuffix')}</span>
                </label>
            </li>
        `).join('')

        const updateState = () => {
            const checked = list.querySelectorAll('input[type=checkbox]:checked')
            const allChecked = checked.length === groups.length
            confirmBtn.textContent = `${i18n('importBtn')} (${checked.length})`
            toggleBtn.textContent  = allChecked ? i18n('importSelectNoneBtn') : i18n('importSelectAllBtn')
            confirmBtn.disabled    = checked.length === 0
        }

        list.addEventListener('change', updateState)
        updateState()

        const close = () => {
            box.classList.add(CSS.closing)
            dim.classList.add(CSS.closing)
            box.classList.remove(CSS.open)
            dim.classList.remove(CSS.open)
            const onEnd = (e) => {
                if (e.target !== box || e.animationName !== 'popup-out') return
                box.removeEventListener('animationend', onEnd)
                box.classList.remove(CSS.closing)
                dim.classList.remove(CSS.closing)
            }
            box.addEventListener('animationend', onEnd)
        }

        toggleBtn.onclick = () => {
            const allChecked = list.querySelectorAll('input:checked').length === groups.length
            list.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = !allChecked })
            updateState()
        }

        closeBtn.onclick = cancelBtn.onclick = dim.onclick = close

        confirmBtn.onclick = async () => {
            const selected = [...list.querySelectorAll('input[type=checkbox]:checked')]
                .map(cb => groups[+cb.dataset.idx])
            const existing = await getStorage()
            await setStorage([...existing, ...selected])
            reloadAll()
            closeSettings()
            close()
        }

        dim.classList.add(CSS.open)
        box.classList.add(CSS.open)
    }

    // ── 초기화 ────────────────────────────────────────────
    find('#settings-reset-btn').addEventListener('click', async () => {
        if (!confirm(i18n('resetConfirm'))) return
        await setStorage([])
        reloadAll()
        closeSettings()
    })
}
