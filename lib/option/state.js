// 옵션 페이지의 공유 상태.
// EventTarget을 상속하여 향후 옵저버 패턴이 필요한 경우 emit/on으로 변경 알림이 가능하다.
// 단순 변경은 직접 속성 할당으로 충분하며, 옵저버가 필요한 경우에만 emit() 호출.

class OptionState extends EventTarget {
    constructor() {
        super()
        // 그룹 헤더 편집 모드 진입 여부 (편집 시 true).
        this.headerEditSnapshot = null
        // 편집 모달의 현재 컨텍스트.
        this.edit = { mode: '', group: 0, nth: 0, changed: false }
        // 사이드바에서 선택된 그룹의 인덱스.
        this.selectedGroup = 0
        // chrome.userScripts API 사용 가능 여부 (settings.js의 initUserScriptsWarning에서 갱신).
        // false면 instant/key/gesture 액션이 작동하지 않음.
        this.userScriptsAvailable = true
    }

    // 키 변경 이벤트 발화. 옵저버 등록은 on(`${key}:change`, handler).
    emit(key) {
        this.dispatchEvent(new CustomEvent(`${key}:change`, { detail: this[key] }))
    }

    // 옵저버 등록 + cleanup 함수 반환.
    on(event, handler) {
        this.addEventListener(event, handler)
        return () => this.removeEventListener(event, handler)
    }
}

export const state = new OptionState()
