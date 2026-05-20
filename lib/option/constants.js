import { i18n } from './utils.js'

// ---------- 액션 타입 목록 ----------
export const actions = ['user agent', 'instant', 'style', 'key', 'gesture', 'note', 'block', 'library']

// ---------- CSS 상태 클래스 ----------
export const CSS = {
    active:          '_active',
    error:           '_error',
    open:            '_open',
    closing:         '_closing',
    recording:       '_recording',
    dragging:        '_dragging',
    hasValue:        '_has-value',
    fadeTop:         '_fade-top',
    fadeBottom:      '_fade-bottom',
    dragBefore:      '_drag-before',
    dragAfter:       '_drag-after',
    dragOver:        '_drag-over',
    groupDragBefore: '_group-drag-before',
    groupDragAfter:  '_group-drag-after',
    scriptDragOver:  '_script-drag-over',
}

// ---------- 데이터 속성 이름 ----------
export const ATTR = {
    action:  'data-action',
    field:   'data-field',
    group:   'data-group',
    nth:     'data-nth',
    mode:    'data-mode',
    trigger: 'data-trigger',
    dir:     'data-dir',
    ba:      'data-ba',
    ua:      'data-ua',
    id:      'data-id',
    value:   'data-value',
}

// ---------- CodeMirror 기본 설정 ----------
export const CM_BASE = {
    lineNumbers:    true,
    autofocus:      false,
    viewportMargin: Infinity,
}

// ---------- 키 / 제스처 라벨 ----------
export const KEY_LABELS = {
    ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', meta: 'Meta', mod: 'Ctrl',
    enter: 'Enter', backspace: '⌫', delete: 'Del', escape: 'Esc',
    tab: 'Tab', space: 'Space', pageup: 'PgUp', pagedown: 'PgDn',
    home: 'Home', end: 'End', insert: 'Ins',
    up: '↑', down: '↓', left: '←', right: '→',
}
export const MODIFIERS  = new Set(['LMB', 'RMB'])
export const DIR_ARROW  = { U: '↑', D: '↓', L: '←', R: '→' }
export const LABEL_MAP  = { LMB: i18n('gestureLmbLabel'), RMB: i18n('gestureRmbLabel'), WU: i18n('gestureWuLabel'), WD: i18n('gestureWdLabel') }

// ---------- 빠른 설정 프리셋 ----------
export const BLOCK_PRESETS = [
    { id: 'google-ads',       name: i18n('presetGoogleAdsName'),       desc: 'doubleclick.net · googlesyndication.com · googleadservices.com',
      patterns: ['*://doubleclick.net*',       '*://*.doubleclick.net*',
                 '*://googlesyndication.com*', '*://*.googlesyndication.com*',
                 '*://googleadservices.com*',  '*://*.googleadservices.com*'] },
    { id: 'google-analytics', name: i18n('presetGoogleAnalyticsName'), desc: 'google-analytics.com · googletagmanager.com',
      patterns: ['*://google-analytics.com*',  '*://*.google-analytics.com*',
                 '*://googletagmanager.com*',   '*://*.googletagmanager.com*'] },
    { id: 'meta',             name: i18n('presetMetaName'),            desc: 'connect.facebook.net · facebook.com/tr',
      patterns: ['*://connect.facebook.net*',
                 '*://facebook.com/tr*',        '*://*.facebook.com/tr*'] },
    { id: 'amazon-ads',       name: i18n('presetAmazonAdsName'),       desc: 'amazon-adsystem.com',
      patterns: ['*://amazon-adsystem.com*',   '*://*.amazon-adsystem.com*'] },
    { id: 'taboola',          name: 'Taboola',           desc: 'taboola.com',
      patterns: ['*://taboola.com*',            '*://*.taboola.com*'] },
    { id: 'outbrain',         name: 'Outbrain',          desc: 'outbrain.com · outbrainimg.com',
      patterns: ['*://outbrain.com*',           '*://*.outbrain.com*',
                 '*://outbrainimg.com*',         '*://*.outbrainimg.com*'] },
    { id: 'criteo',           name: 'Criteo',            desc: 'criteo.com · criteo.net',
      patterns: ['*://criteo.com*',             '*://*.criteo.com*',
                 '*://criteo.net*',              '*://*.criteo.net*'] },
    { id: 'trade-desk',       name: 'The Trade Desk',    desc: 'adsrvr.org',
      patterns: ['*://adsrvr.org*',             '*://*.adsrvr.org*'] },
]

export const BLOCK_PATTERN_SET = new Set(BLOCK_PRESETS.flatMap(p => p.patterns))
export const UA_PRESET_SET = new Set(
    [...document.querySelectorAll('.ua-preset-btn')].map(b => b.dataset.ua).filter(Boolean)
)

// 프리셋으로 만들어진 항목인지 판별 (스크립트 목록의 ⚡ 아이콘 표시용).
export function isPresetScript(item) {
    if (['instant', 'key', 'gesture'].includes(item.action)) {
        return item.scriptMode === 'preset' && !!item.presetAction
    }
    if (item.action === 'block') {
        const lines = (item.script || '').split('\n').map(s => s.trim()).filter(Boolean)
        return lines.length > 0 && lines.every(l => BLOCK_PATTERN_SET.has(l))
    }
    if (item.action === 'user agent') {
        return UA_PRESET_SET.has(item.script)
    }
    return false
}

// ---------- SVG 아이콘 ----------
export const icon = {
    export:     `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10V3M5 6l3-3 3 3M2 13h12"/></svg>`,
    trash:      `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 2.5h3M2 5h12M4 5l.8 8a1 1 0 001 .5h4.4a1 1 0 001-.5L12 5M8 8.5v3"/></svg>`,
    edit:       `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2l3 3-8 8-4 1 1-4 8-8z"/></svg>`,
    plus:       `<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 1v10M1 6h10"/></svg>`,
    download:   `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v7M5 7l3 3 3-3M2 13h12"/></svg>`,
    exportFill: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10V3M5 6l3-3 3 3M2 13h12"/></svg>`,
    close:      `<svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>`,
    clear:      `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3H13a1 1 0 011 1v8a1 1 0 01-1 1H4L1 8z"/><path d="M7 6l4 4M11 6l-4 4"/></svg>`,
    check:      `<svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5l3 3 5-6"/></svg>`,
    lightning:  `<svg width="14" height="14" viewBox="5 2 6 12" fill="currentColor"><path d="M9 2L5 9h3L6 14l5-7H8z"/></svg>`,
}

export function initIcons() {
    const q  = s => document.querySelector(s)
    const qa = s => document.querySelectorAll(s)
    qa('.popup-close').forEach(el => el.innerHTML = icon.close)
    q('.key-clear-btn').innerHTML   = icon.clear
    q('.gp-back-btn').innerHTML     = icon.clear
    q('.sf-import').innerHTML       = icon.download
}
