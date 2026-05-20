// 옵션 페이지 entry point.
// 의존 모듈을 import하고 각 init을 호출 + 페이지 전역 키보드/메시지 핸들러를 등록한다.

import { getStorage, initMigrations, reloadAll } from './shared/storage.js'
import { i18n, find, getCurrentUrl } from './option/utils.js'
import { CSS, initIcons } from './option/constants.js'
import { state } from './option/state.js'
import { renderSidebar, renderContent, updateFade } from './option/render.js'
import { popup } from './option/popup.js'
import { initClickDelegation, exitGroupEdit, cancelGroupEdit } from './option/modules/click-delegation.js'
import { initDragDrop } from './option/modules/drag-drop.js'
import { initUserScriptsWarning, initSettings } from './option/modules/settings.js'
import { initKeyRecorder } from './option/modules/key-recorder.js'
import { initScriptModeToggle, initTimingToggle } from './option/modules/toggle-buttons.js'
import { initGesturePad } from './option/modules/gesture-pad.js'
import { initUaPresets } from './option/modules/ua-presets.js'
import { initBlockPresets } from './option/modules/block-presets.js'

// ── i18n: data-i18n* 속성을 가진 모든 요소를 현재 로케일로 채움 ───────
function initI18n() {
    [
        ['[data-i18n]',             'i18n',             'textContent'],
        ['[data-i18n-html]',        'i18nHtml',         'innerHTML'],
        ['[data-i18n-placeholder]', 'i18nPlaceholder',  'placeholder'],
        ['[data-i18n-title]',       'i18nTitle',        'title'],
    ].forEach(([sel, attr, prop]) => {
        document.querySelectorAll(sel).forEach(el => { el[prop] = i18n(el.dataset[attr]) })
    })
}

// ── 메시지 수신: background가 보내는 'load'에 대해 사이드바/컨텐츠 재렌더 ──
async function reload() {
    const storage = await getStorage()
    if (state.selectedGroup >= storage.length) state.selectedGroup = Math.max(0, storage.length - 1)

    const currentUrl = await getCurrentUrl()
    renderSidebar(storage, currentUrl)
    renderContent(storage, state.selectedGroup, currentUrl)

    chrome.runtime.sendMessage({ type: 'ua-update' })
    popup._closeUI()
}

// ── 모듈 초기화 (DOM 의존이라 모듈 로드 시점에 실행해도 안전 - type=module은 deferred) ──
initI18n()
initIcons()

initKeyRecorder()
initScriptModeToggle()
initTimingToggle()
initGesturePad()
initUaPresets()
initBlockPresets()

initClickDelegation()
initDragDrop()
initUserScriptsWarning()
initSettings()

// ── 페이지 전역 키 단축키: 모달/그룹 헤더 인라인 편집 종료 ───────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.headerEditSnapshot) cancelGroupEdit()
    if (e.key === 'Escape' && popup.box.classList.contains(CSS.open) && !Mousetrap.recording) popup.discard()
    if (e.ctrlKey && e.key === 'Enter'
        && popup.box.classList.contains(CSS.open)
        && !Mousetrap.recording) {
        e.preventDefault()
        popup.close()
    }
})

// ── 메시지 수신 ─────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request) => {
    if (request.type === 'load') reload()
})

// ── 스크롤 fade 마스크 ──────────────────────────────────────────────
find('.scripts-container').addEventListener('scroll', e => updateFade(e.currentTarget))
find('.sidebar').addEventListener('scroll', e => updateFade(e.currentTarget))
find('.popup-body').addEventListener('scroll', e => updateFade(e.currentTarget))

// ── 버전 라벨 ───────────────────────────────────────────────────────
const versionLabel = find('#version-label')
if (versionLabel) versionLabel.textContent = `Version ${chrome.runtime.getManifest().version}`

// ── 마지막에 마이그레이션 + 초기 렌더 트리거 ──────────────────────────
initMigrations().then(async () => {
    const { lastGroup } = await chrome.storage.local.get('lastGroup')
    if (typeof lastGroup === 'number') state.selectedGroup = lastGroup
    reloadAll()
})
