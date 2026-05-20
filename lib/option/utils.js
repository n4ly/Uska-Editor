// 옵션 페이지 공통 유틸리티.
// chrome API와 DOM에 대한 얇은 래퍼만 둔다. 다른 옵션 모듈에 의존하지 않는다.

export const i18n = key => chrome.i18n.getMessage(key)

export function find(s) { return document.querySelector(s) }

export function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

// 입력 필드에 에러 표시 + 포커스 + 입력 시 자동 해제.
export function fieldError(el) {
    el.classList.add('_error')
    el.focus()
    el.addEventListener('input', () => el.classList.remove('_error'), { once: true })
}

// 현재 활성 탭의 URL을 가져온다. 권한이 없거나 탭이 없으면 null 반환.
export async function getCurrentUrl() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        return tab?.url || null
    } catch (_) { return null }
}
