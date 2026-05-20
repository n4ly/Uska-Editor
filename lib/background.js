import { globToRegexString } from './shared/url-match.js'
import { getStorage } from './shared/storage.js'
import { buildLibsFromGroup, combineWithLibs } from './shared/library-transform.js'

const suppressCMTabs = new Set()

function isAllowed(content, url) {
    if (!content.activate) return false
    if (!content.url || !content.url[0]) return true
    return content.url.some(pattern => {
        try {
            return new RegExp(globToRegexString(pattern)).test(url)
        } catch (_) {
            return false
        }
    })
}

function extractDomains(patterns) {
    return [...new Set(
        patterns
            .filter(p => p && !/^\/.*\/$/.test(p))
            .map(p => {
                try {
                    const noProto = p.replace(/^(\*|https?):\/\/(\*\.)?/, '')
                    const domain  = noProto.split('/')[0].replace(/^\*\.?/, '').replace(/\*/g, '')
                    return domain.includes('.') ? domain : null
                } catch (_) { return null }
            })
            .filter(Boolean)
    )]
}

const UA_RESOURCE_TYPES = ['main_frame', 'sub_frame', 'xmlhttprequest', 'other']
const BLOCK_RESOURCE_TYPES = ['main_frame', 'sub_frame', 'script', 'stylesheet', 'image', 'font', 'xmlhttprequest', 'media', 'websocket', 'other']

// 활성 그룹/항목들에서 DNR로 처리할 콘텐츠를 분류한다.
function collectDNRContents(storage) {
    const uaContents = []
    const blockContents = []
    storage.forEach(group => {
        if (group.activate === false) return
        ;(group.contents || []).forEach(content => {
            if (!content.activate) return
            if (content.action === 'user agent') {
                uaContents.push({ url: content.url, string: content.script })
            } else if (content.action === 'block') {
                blockContents.push({ url: content.url, script: content.script })
            }
        })
    })
    return { uaContents, blockContents }
}

// User-Agent 헤더를 수정하는 DNR 룰 (id는 호출 측에서 부여).
function buildUARules(uaContents) {
    const rules = []
    uaContents.forEach(content => {
        const urlList = Array.isArray(content.url) ? content.url.filter(u => u) : []
        const action = {
            type: 'modifyHeaders',
            requestHeaders: [{ header: 'User-Agent', operation: 'set', value: content.string }]
        }

        if (urlList.length === 0) {
            rules.push({ priority: 1, action, condition: { resourceTypes: UA_RESOURCE_TYPES } })
            return
        }

        urlList.forEach(pattern => {
            try {
                const regexFilter = globToRegexString(pattern)
                new RegExp(regexFilter) // JS 레벨 유효성 선검증
                rules.push({ priority: 1, action, condition: { regexFilter, resourceTypes: UA_RESOURCE_TYPES } })
            } catch (_) { /* 잘못된 패턴 무시 */ }
        })
    })
    return rules
}

// URL 패턴을 차단하는 DNR 룰 (id는 호출 측에서 부여).
// content.url을 initiatorDomains로 변환해 적용 사이트를 한정한다.
function buildBlockRules(blockContents) {
    const rules = []
    blockContents.forEach(content => {
        const blockPatterns = (content.script || '').split('\n').map(s => s.trim()).filter(Boolean)
        const initiatorList = Array.isArray(content.url) ? content.url.filter(u => u) : []
        const initiatorDomains = extractDomains(initiatorList)

        blockPatterns.forEach(pattern => {
            try {
                const regexFilter = globToRegexString(pattern)
                new RegExp(regexFilter)
                const condition = { regexFilter, resourceTypes: BLOCK_RESOURCE_TYPES }
                if (initiatorDomains.length) condition.initiatorDomains = initiatorDomains
                rules.push({ priority: 1, action: { type: 'block' }, condition })
            } catch (_) {}
        })
    })
    return rules
}

// 룰 일괄 적용. 일괄이 실패하면 (잘못된 패턴 등) 하나씩 재시도해 가능한 룰만 등록.
async function applyDynamicRules(removeRuleIds, addRules) {
    try {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules })
    } catch (_) {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [] }).catch(() => {})
        for (const rule of addRules) {
            await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [], addRules: [rule] }).catch(() => {})
        }
    }
}

async function updateDNRRules() {
    const storage = await getStorage()
    const { uaContents, blockContents } = collectDNRContents(storage)
    const existing = await chrome.declarativeNetRequest.getDynamicRules()
    const removeRuleIds = existing.map(r => r.id)
    const rulesWithoutId = [...buildUARules(uaContents), ...buildBlockRules(blockContents)]
    const addRules = rulesWithoutId.map((r, i) => ({ ...r, id: i + 1 }))
    await applyDynamicRules(removeRuleIds, addRules)
}

function buildUrlMatches(urlPatterns) {
    if (!urlPatterns || !urlPatterns.filter(u => u).length) return ['<all_urls>']
    const matches = []
    for (const p of urlPatterns) {
        if (!p) continue
        try {
            if (/^\/.*\/$/.test(p)) { matches.push('<all_urls>'); break }
            const noProto = p.replace(/^(\*|https?):\/\//, '')
            matches.push(`*://${noProto}`)
        } catch (_) {}
    }
    return matches.length ? matches : ['<all_urls>']
}

async function syncUserScripts() {
    if (!chrome.userScripts) return
    await chrome.userScripts.unregister({})
    const storage = await getStorage()
    const scripts = []
    let idx = 0
    storage.forEach(group => {
        if (group.activate === false) return
        const libs = buildLibsFromGroup(group)
        ;(group.contents || []).forEach(content => {
            if (!content.activate) return
            if (content.action === 'instant' && content.script) {
                const rawScript = combineWithLibs(content.script, libs)
                const timing = content.timing === 'end' ? 'document_end'
                             : content.timing === 'idle' ? 'document_idle'
                             : 'document_start'
                scripts.push({
                    id: `uska_instant_${idx++}`,
                    matches: buildUrlMatches(content.url),
                    js: [{ code: rawScript }],
                    runAt: timing,
                    world: 'MAIN'
                })
            }
        })
    })
    for (const script of scripts) {
        await chrome.userScripts.register([script]).catch(() => {})
    }
}

async function applyInject(request) {
    const storage = await getStorage()
    const contents = []
    let uaOverride = null
    storage.forEach(group => {
        if (group.activate === false) return
        const libs = buildLibsFromGroup(group)
        ;(group.contents || []).forEach(content => {
            if (content.activate && content.action === 'user agent' && isAllowed(content, request.url)) {
                uaOverride = content.script
            }
            if (content.activate && content.action !== 'user agent' && content.action !== 'note' && content.action !== 'block' && content.action !== 'library' && content.action !== 'instant') {
                if (libs.length && ['key', 'gesture'].includes(content.action)) {
                    contents.push({ ...content, script: combineWithLibs(content.script || '', libs) })
                } else {
                    contents.push(content)
                }
            }
        })
    })
    const result = contents.filter(content => isAllowed(content, request.url))
    if (uaOverride !== null) result.unshift({ action: 'user-agent', script: uaOverride })
    return result
}

// ── 인접 탭으로 이동 + 컨텍스트 메뉴 자동 닫기 ──
function moveToAdjacentTab(tabId, direction) {
    chrome.tabs.query({ currentWindow: true }, tabs => {
        const sorted = tabs.sort((a, b) => a.index - b.index)
        const cur = sorted.findIndex(t => t.id === tabId)
        const next = sorted[(cur + direction + sorted.length) % sorted.length]
        chrome.tabs.update(next.id, { active: true })
        chrome.tabs.sendMessage(next.id, { type: 'suppress-contextmenu' }).catch(() => {})
    })
}

// ── 페이지 컨텍스트에서 함수 실행 (scripting API 래퍼) ──
function execInPage(tabId, frameIds, func) {
    const target = frameIds ? { tabId, frameIds } : { tabId }
    chrome.scripting.executeScript({ target, func }).catch(() => {})
}

// ── preset-action 디스패치 테이블 ──
// 각 핸들러는 (tabId, request, sender) 시그니처를 가진다.
const presetActionHandlers = {
    'tab-prev':     tabId => moveToAdjacentTab(tabId, -1),
    'tab-next':     tabId => moveToAdjacentTab(tabId, +1),
    'tab-close':    tabId => chrome.tabs.remove(tabId),
    'tab-new':      (tabId, req) => chrome.tabs.create(req.href ? { url: req.href } : {}),
    'tab-duplicate': tabId => chrome.tabs.duplicate(tabId),
    'tab-pin':      tabId => chrome.tabs.get(tabId, tab => chrome.tabs.update(tabId, { pinned: !tab.pinned })),
    'tab-mute':     tabId => chrome.tabs.get(tabId, tab => chrome.tabs.update(tabId, { muted: !tab.mutedInfo.muted })),
    'tab-detach':   tabId => chrome.windows.create({ tabId }),

    'nav-back':        tabId => { chrome.tabs.goBack(tabId);    suppressCMTabs.add(tabId) },
    'nav-forward':     tabId => { chrome.tabs.goForward(tabId); suppressCMTabs.add(tabId) },
    'nav-reload':      tabId => { chrome.tabs.reload(tabId);    suppressCMTabs.add(tabId) },
    'nav-reload-hard': tabId => { chrome.tabs.reload(tabId, { bypassCache: true }); suppressCMTabs.add(tabId) },
    'nav-stop':        tabId => execInPage(tabId, null, () => window.stop()),

    'scroll-top':    (tabId, _req, sender) => execInPage(tabId, [sender.frameId], () => window.scrollTo({ top: 0, behavior: 'smooth' })),
    'scroll-bottom': (tabId, _req, sender) => execInPage(tabId, [sender.frameId], () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })),
    'page-print':    tabId => execInPage(tabId, null, () => window.print()),
    'page-source':   tabId => chrome.tabs.get(tabId, tab => chrome.tabs.create({ url: 'view-source:' + tab.url })),
}

// ── 메시지 타입별 핸들러 ──
// inject만 비동기 응답을 위해 true를 반환. 나머지는 undefined.
function handleInject(request, sender, sendResponse) {
    const tabId = sender.tab?.id
    applyInject(request).then(result => {
        if (tabId && suppressCMTabs.has(tabId)) {
            suppressCMTabs.delete(tabId)
            sendResponse([{ action: 'suppress-contextmenu' }, ...result])
        } else {
            sendResponse(result)
        }
    })
    return true
}

function handleExecute(request, sender) {
    if (!sender.tab) return
    const gestureHref = request.gestureHref ?? null
    const fullCode = `window.uskaHref=${JSON.stringify(gestureHref)};window.uskaOpenHref=(url)=>{window.postMessage({__uska:'open-tab',url:url??window.uskaHref},'*')};${request.code}`
    chrome.userScripts.execute({
        target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
        js: [{ code: fullCode }],
        world: 'MAIN'
    }).catch(() => {})
}

function handleBrowserAction(request, sender) {
    const tabId = sender.tab?.id
    if (!tabId) return
    const fn = presetActionHandlers[request.action]
    if (fn) fn(tabId, request, sender)
}

const messageHandlers = {
    inject:           handleInject,
    execute:          handleExecute,
    'open-tab':       request => { if (request.url) chrome.tabs.create({ url: request.url }) },
    'preset-action': handleBrowserAction,
    syncedLoad:       () => updateDNRRules().then(() => chrome.runtime.sendMessage({ type: 'load' }).catch(() => {})),
    'ua-update':      () => updateDNRRules(),
    'scripts-updated': () => syncUserScripts(),
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handler = messageHandlers[request.type]
    if (handler) return handler(request, sender, sendResponse)
})

updateDNRRules()
syncUserScripts()

// storage가 외부에서(또는 reloadAll 메시지보다 먼저) 변경된 경우에도 즉시 동기화.
// syncedLoad 메시지 핸들러와 중복 호출이 가능하나 idempotent하므로 문제 없음.
chrome.storage.local.onChanged.addListener(() => {
    updateDNRRules()
    syncUserScripts()
})
