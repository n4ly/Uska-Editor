const uska = {
    _styles: new Set(),
    _keys: new Set(),
    _inputAllowKeys: new Set(),
    _hasSpaceKey: false,
    _gestureMap: new Map(),
    apply(response, isNavigation = false) {
        if (isNavigation) {
            Mousetrap.reset()
            this._keys.clear()
            this._inputAllowKeys.clear()
            this._gestureMap.clear()
            if (this._hasSpaceKey) {
                window.onkeydown = null
                this._hasSpaceKey = false
            }
        }
        response.forEach(content => {
            switch (content.action) {
                case 'instant':
                    // script 실행은 chrome.userScripts가 직접 주입
                    if (content.scriptMode === 'preset') {
                        chrome.runtime.sendMessage({ type: 'preset-action', action: content.presetAction })
                    }
                    break
                case 'style': {
                    if (this._styles.has(content.script)) break
                    this._styles.add(content.script)
                    injectStyle(content.script)
                    break
                }
                case 'key': {
                    const k = content.key + '\x00' + (content.script || content.presetAction)
                    if (this._keys.has(k)) break
                    this._keys.add(k)
                    if (content.inputAllow) this._inputAllowKeys.add(content.key.toLowerCase())
                    if (content.key.includes('space')) {
                        this._hasSpaceKey = true
                        window.onkeydown = e => {
                            if (e.keyCode === 32 && e.target === document.body) e.preventDefault()
                        }
                    }
                    Mousetrap.bind(content.key.toLowerCase(), () => {
                        if (content.scriptMode === 'preset') {
                            chrome.runtime.sendMessage({ type: 'preset-action', action: content.presetAction })
                        } else {
                            chrome.runtime.sendMessage({ type: 'execute', code: content.script })
                        }
                    })
                    break
                }
                case 'gesture': {
                    if (!content.trigger) break
                    const trigger = content.trigger.toUpperCase()
                    this._gestureMap.set(trigger, {
                        script: content.script,
                        scriptMode: content.scriptMode || 'script',
                        presetAction: content.presetAction || ''
                    })
                    break
                }
                case 'user-agent':
                    chrome.runtime.sendMessage({
                        type: 'execute',
                        code: `try{Object.defineProperty(navigator,'userAgent',{get:()=>${JSON.stringify(content.script)},configurable:true})}catch(_){}`
                    })
                    break
                case 'suppress-contextmenu':
                    document.addEventListener('contextmenu', e => { e.preventDefault(); e.stopImmediatePropagation() }, { capture: true, once: true })
                    break
            }
        })
    },
    inject() {
        const self = this
        Mousetrap.prototype.stopCallback = (e, element, combo) => {
            if (self._inputAllowKeys.has(combo)) return false
            return element.tagName === 'INPUT'
                || element.tagName === 'SELECT'
                || element.tagName === 'TEXTAREA'
                || element.isContentEditable
        }
    }
}

function injectStyle(css) {
    const style = document.createElement('style')
    style.textContent = css
    ;(document.head || document.documentElement).appendChild(style)
}

function requestInject(url, isNavigation = false) {
    chrome.runtime.sendMessage({ type: 'inject', url }, response => {
        if (chrome.runtime.lastError || !response) return
        uska.apply(response, isNavigation)
    })
}

uska.inject()
requestInject(document.URL)

window.addEventListener('message', e => {
    if (e.source !== window || e.data?.__uska !== 'open-tab' || !e.data.url) return
    chrome.runtime.sendMessage({ type: 'open-tab', url: e.data.url })
})

// ── Gesture state machine ────────────────────────────────────────
;(function () {
    const MIN_DIST = 30
    const BTN = { 0: 'LMB', 2: 'RMB' }
    const gs = {
        active: false, button: '', lastX: 0, lastY: 0, path: '', lastDir: '', suppress: false,
        rockerCombo: '', rockerConsumed: false, fired: false
    }

    function fireGesture(trigger) {
        const entry = uska._gestureMap.get(trigger)
        if (!entry) return false
        if (entry.scriptMode === 'preset') {
            chrome.runtime.sendMessage({ type: 'preset-action', action: entry.presetAction, href: gs.hrefTarget })
        } else {
            chrome.runtime.sendMessage({ type: 'execute', code: entry.script, gestureHref: gs.hrefTarget })
        }
        gs.suppress = true
        gs.fired = true
        return true
    }

    document.addEventListener('mousedown', e => {
        // 두 번째 버튼 누름 → 로커 대기, 방향 추적도 재시작
        if (e.button === 0 && (e.buttons & 2)) {
            gs.active = false
            gs.rockerCombo = 'RMB+LMB'
            gs.rockerConsumed = false
            gs.hrefTarget = e.target.closest('a')?.href || null
            gs.lastX = e.clientX; gs.lastY = e.clientY
            gs.path = ''; gs.lastDir = ''
            return
        }
        if (e.button === 2 && (e.buttons & 1)) {
            gs.active = false
            gs.rockerCombo = 'LMB+RMB'
            gs.rockerConsumed = false
            gs.hrefTarget = e.target.closest('a')?.href || null
            gs.lastX = e.clientX; gs.lastY = e.clientY
            gs.path = ''; gs.lastDir = ''
            e.preventDefault()
            return
        }
        // 단일 버튼 방향 제스처 추적 시작
        if (BTN[e.button]) {
            gs.active = true
            gs.button = BTN[e.button]
            gs.hrefTarget = e.target.closest('a')?.href || null
            gs.lastX = e.clientX; gs.lastY = e.clientY
            gs.path = ''; gs.lastDir = ''
            // RMB는 contextmenu가 mouseup 직후 발화되므로 미리 suppress.
            // 단순 우클릭(매치 없음+이동 없음)이면 mouseup에서 해제하여 일반 컨텍스트 메뉴 허용.
            gs.suppress = e.button === 2
            gs.rockerCombo = ''
        }
    }, true)

    document.addEventListener('mousemove', e => {
        if (!gs.active && !gs.rockerCombo) return
        if (gs.rockerConsumed) return
        const dx = e.clientX - gs.lastX
        const dy = e.clientY - gs.lastY
        if (dx * dx + dy * dy < MIN_DIST * MIN_DIST) return
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')
        if (dir !== gs.lastDir) { gs.path += dir; gs.lastDir = dir }
        gs.lastX = e.clientX
        gs.lastY = e.clientY
    }, true)

    document.addEventListener('mouseup', e => {
        // 모든 버튼이 해제되면 fired 플래그 해제 (click/contextmenu는 이후 이벤트로 발화되므로 setTimeout 사용)
        if (e.buttons === 0 && gs.fired) setTimeout(() => { gs.fired = false }, 0)

        // 로커: 버튼 하나를 뗄 때 발사 (휠로 소비된 경우 스킵)
        if (gs.rockerCombo) {
            const combo = gs.rockerCombo
            gs.rockerCombo = ''
            if (!gs.rockerConsumed) {
                let fired = gs.path && fireGesture(combo + '+' + gs.path)
                if (!fired) fired = fireGesture(combo)
            }
            gs.rockerConsumed = false
            gs.path = ''
            gs.suppress = true
            return
        }
        if (!gs.active || BTN[e.button] !== gs.button) {
            if (e.button === 2 && gs.suppress) e.preventDefault()
            return
        }
        gs.active = false
        const btn = gs.button
        let matched = false
        if (gs.path) {
            matched = fireGesture(btn + '+' + gs.path) || (btn === 'RMB' && fireGesture(gs.path))
        } else {
            matched = fireGesture(btn)
        }
        // RMB이고 이동도 매치도 없으면 일반 우클릭으로 보고 suppress 해제.
        if (btn === 'RMB' && !gs.path && !matched) gs.suppress = false
    }, true)

    document.addEventListener('wheel', e => {
        const dir = e.deltaY > 0 ? 'WD' : 'WU'
        let fired = false
        if (gs.rockerCombo) {
            // 로커 대기 중 휠 → rockerCombo+휠 시도
            fired = fireGesture(gs.rockerCombo + '+' + dir)
            if (fired) gs.rockerConsumed = true
        } else {
            const mods = []
            if (e.buttons & 1) mods.push('LMB')
            if (e.buttons & 2) mods.push('RMB')
            if (mods.length) fired = fireGesture([...mods, dir].join('+'))
            if (!fired) fired = fireGesture(dir)
        }
        if (fired) e.preventDefault()
    }, { capture: true, passive: false })

    document.addEventListener('click', e => {
        if (gs.fired) { e.preventDefault(); e.stopPropagation() }
    }, true)

    document.addEventListener('contextmenu', e => {
        if (gs.suppress || gs.fired) { e.preventDefault(); e.stopImmediatePropagation(); gs.suppress = false }
    }, true)
})()

let _lastUrl = location.href

function onNavigate() {
    const url = location.href
    if (url === _lastUrl) return
    _lastUrl = url
    requestInject(url, true)
}

if (typeof window.navigation !== 'undefined') {
    window.navigation.addEventListener('navigatesuccess', onNavigate)
} else {
    window.addEventListener('popstate', onNavigate)
    window.addEventListener('hashchange', onNavigate)

    const _pushState = history.pushState.bind(history)
    const _replaceState = history.replaceState.bind(history)
    history.pushState = (...args) => { _pushState(...args); onNavigate() }
    history.replaceState = (...args) => { _replaceState(...args); onNavigate() }
}

chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'suppress-contextmenu') {
        document.addEventListener('contextmenu', e => { e.preventDefault(); e.stopImmediatePropagation() }, { capture: true, once: true })
    }
})
