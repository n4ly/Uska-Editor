// 사이드바, 컨텐츠 헤더, 스크립트 목록을 렌더링하는 순수 HTML 빌더 모음.
// DOM 직접 변경 (innerHTML)은 renderSidebar/renderContent에 한정되며,
// 나머지는 문자열을 반환한다.

import { globToRegexString } from '../shared/url-match.js'
import { i18n, find, esc } from './utils.js'
import { CSS, icon, isPresetScript } from './constants.js'
import { state } from './state.js'

export function urlMatchesItem(item, currentUrl) {
    if (!currentUrl) return false
    if (!item.url || !item.url[0]) return true
    return item.url.some(pattern => {
        try { return new RegExp(globToRegexString(pattern)).test(currentUrl) } catch (_) { return false }
    })
}

// 그룹 contents 배열 → <li> 문자열들로 변환.
export function applyContents(data, currentUrl) {
    if (data.length === 0) return `<li class="line-placeholder">${i18n('emptyList')}</li>`
    const userScriptsBlocked = !state.userScriptsAvailable
    // 같은 그룹 안에서 libraryId가 둘 이상이면 중복으로 _warn.
    const libIdCount = data.reduce((m, c) => {
        if (c.action === 'library' && c.libraryId) m.set(c.libraryId, (m.get(c.libraryId) || 0) + 1)
        return m
    }, new Map())
    return data.map((item, i) => {
        // preset 모드는 background의 chrome.scripting/tabs API로 처리되므로 user scripts 불필요.
        const needsUserScripts = ['instant', 'key', 'gesture'].includes(item.action) && item.scriptMode !== 'preset'
        const warn = item.action !== 'note' && (
            (item.scriptMode === 'preset' ? !item.presetAction : !item.script) ||
            (item.action === 'key' && !item.key) ||
            (item.action === 'gesture' && !item.trigger) ||
            (item.action === 'library' && !item.libraryId) ||
            (item.action === 'library' && item.libraryId && libIdCount.get(item.libraryId) > 1) ||
            (userScriptsBlocked && needsUserScripts)
        )
        const risk = item.action === 'instant' &&
            isPresetScript(item) &&
            (!item.url || !item.url.filter(u => u).length)
        const active = item.activate && item.action !== 'note' && urlMatchesItem(item, currentUrl)
        return `
        <li class="line${warn ? ' _warn' : ''}${risk ? ' _risk' : ''}" draggable="true" data-action="${item.action}" data-nth="${i}">
            <span class="active-dot${active ? ' _active' : ''}"${active ? ` title="${i18n('activeOnPage')}"` : ''}></span>
            <input type="checkbox" class="activate-check" ${item.activate ? 'checked' : ''} ${item.action === 'note' ? 'disabled' : ''}>
            <label class="right" data-action="activate"></label>
            <div class="left">
                <span class="action-tag">${item.action}</span>
                <div class="line-name">
                    <h1>${item.name ? esc(item.name) : `<span class="name-empty">${i18n('nameEmpty')}</span>`}</h1>
                    ${isPresetScript(item) ? `<span class="preset-icon">${icon.lightning}</span>` : ''}
                </div>
            </div>
            ${item.action === 'key' && item.key ? `<span class="key-badge">${esc(item.key)}</span>` : ''}
            ${item.action === 'gesture' && item.trigger ? `<span class="key-badge gesture-badge">${esc(item.trigger)}</span>` : ''}
        </li>`
    }).join('')
}

// 현재 URL에서 활성 상태인 항목 수 (사이드바 그룹 카운트 표시용).
export function groupActiveCount(group, currentUrl) {
    if (!currentUrl || group.activate === false) return 0
    return group.contents.filter(item =>
        item.activate &&
        item.action !== 'note' &&
        urlMatchesItem(item, currentUrl)
    ).length
}

export function renderSidebar(storage, currentUrl) {
    find('.sidebar-list').innerHTML = storage.map((group, i) => {
        const activeCount = groupActiveCount(group, currentUrl)
        const countText = activeCount > 0
            ? `${group.contents.length}${i18n('itemCountSuffix')} · <span class="sg-active-count">${activeCount} ${i18n('activeCountText')}</span>`
            : `${group.contents.length}${i18n('itemCountSuffix')}`
        return `
        <div class="sidebar-group${i === state.selectedGroup ? ' _active' : ''}${group.activate === false ? ' _g-disabled' : ''}" data-group="${i}" draggable="true">
            <div class="sg-dot" style="background:${group.theme.background}"></div>
            <div class="sg-info">
                <span class="sg-name">${esc(group.name)}</span>
                <span class="sg-count">${countText}</span>
            </div>
            <input type="checkbox" class="sg-toggle-check" ${group.activate !== false ? 'checked' : ''}>
            <label data-action="toggle-group"></label>
        </div>`
    }).join('')
    requestAnimationFrame(() => updateFade(find('.sidebar')))
}

export function renderContent(storage, groupIdx, currentUrl) {
    const group = storage[groupIdx]
    if (!group) {
        find('.content-header').innerHTML = ''
        find('.scripts-container').innerHTML = `<p class="line-placeholder">${i18n('selectGroup')}</p>`
        return
    }
    find('.content-header').innerHTML = `
        <div class="ch-info">
            <input type="color" class="theme-color-input ch-color-input" value="${group.theme.background}">
            <div class="ch-text">
                <div class="ch-name-wrap">
                    <h1 class="ch-name" data-action="edit-group">${esc(group.name)}</h1>
                    <span class="ch-edit-icon" data-action="edit-group">${icon.edit}</span>
                </div>
${group.meta ? `<span class="ch-meta" data-action="update">${esc(group.meta)}</span>` : ''}
            </div>
        </div>
        <div class="ch-actions">
            <div class="ch-action-group">
                <button type="button" data-action="delete-group" class="btn-ghost ch-delete-btn" title="${i18n('deleteGroupTitle')}">
                    ${icon.trash}
                </button>
                <button type="button" data-action="export-group" class="btn-ghost" title="${i18n('exportGroupTitle')}">
                    ${icon.export}
                </button>
            </div>
            <button data-action="add" class="btn-primary">
                ${icon.plus}
                ${i18n('addScriptBtn')}
            </button>
        </div>
    `
    find('.scripts-container').innerHTML = `<ul class="line">${applyContents(group.contents, currentUrl)}</ul>`
    requestAnimationFrame(() => updateFade(find('.scripts-container')))
}

// 스크롤 가능한 영역의 위/아래 페이드 마스크 토글.
export function updateFade(el) {
    if (!el) return
    const scrollable = el.scrollHeight > el.clientHeight
    el.classList.toggle(CSS.fadeTop,    scrollable && el.scrollTop > 0)
    el.classList.toggle(CSS.fadeBottom, scrollable && el.scrollTop + el.clientHeight < el.scrollHeight - 1)
}
