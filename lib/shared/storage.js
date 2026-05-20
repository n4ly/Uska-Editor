// chrome.storage.local 'data' 키를 단일 진실 공급원으로 사용한다.
// 모든 스토리지 접근은 이 모듈을 통해 이루어져야 한다.

export async function getStorage() {
    const { data } = await chrome.storage.local.get('data')
    try { return JSON.parse(data || 'null') || [] } catch (_) { return [] }
}

export async function setStorage(value) {
    await chrome.storage.local.set({ data: JSON.stringify(value) })
}

export async function initMigrations() {
    // localStorage → chrome.storage.local 일회성 마이그레이션 (구버전 호환)
    const { data: existing } = await chrome.storage.local.get('data')
    if (!existing && typeof localStorage !== 'undefined' && localStorage.data) {
        try {
            const migrated = JSON.parse(localStorage.data)
            if (Array.isArray(migrated) && migrated.length > 0) {
                await chrome.storage.local.set({ data: localStorage.data })
                localStorage.removeItem('data')
            }
        } catch (_) {}
    }

    const storage = await getStorage()
    let dirty = false
    storage.forEach(g => {
        if (g.activate === undefined) { g.activate = true; dirty = true }
        ;(g.contents || []).forEach(c => {
            if (c.action === 'text') { c.action = 'note'; dirty = true }
        })
    })
    if (dirty) await setStorage(storage)
}

export function reloadAll() {
    chrome.runtime.sendMessage({ type: 'syncedLoad' })
}
