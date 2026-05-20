// 사이드바 그룹 + 컨텐츠 스크립트 항목의 드래그앤드랍.
// drag 상태는 이 모듈 내부에 한정한다 (다른 모듈은 사용하지 않음).

import { find } from '../utils.js'
import { CSS } from '../constants.js'
import { state } from '../state.js'
import { getStorage, setStorage, reloadAll } from '../../shared/storage.js'

export function initDragDrop() {
    const sidebarEl = find('.sidebar')
    const contentEl = find('.content')

    let drag = {}

    function clearClasses(root, ...groups) {
        groups.forEach(group => {
            root.querySelectorAll(group.map(c => `.${c}`).join(', '))
                .forEach(el => el.classList.remove(...group))
        })
    }

    function clearScriptIndicator() {
        clearClasses(contentEl, [CSS.dragBefore, CSS.dragAfter], [CSS.dragOver])
    }

    function clearGroupIndicator() {
        clearClasses(sidebarEl, [CSS.groupDragBefore, CSS.groupDragAfter])
    }

    function clearScriptGroupIndicator() {
        clearClasses(sidebarEl, [CSS.scriptDragOver])
    }

    function getInsertIndex(ul, clientY) {
        const items = [...ul.querySelectorAll(`li.line:not(.${CSS.dragging})`)]
        for (let i = 0; i < items.length; i++) {
            const { top, height } = items[i].getBoundingClientRect()
            if (clientY < top + height / 2) return i
        }
        return items.length
    }

    // 스크립트 드래그 (content 영역)
    contentEl.addEventListener('dragstart', e => {
        const li = e.target.closest('li.line')
        if (!li) return
        drag.type      = 'script'
        drag.sourceGroup = state.selectedGroup
        drag.sourceNth   = +li.dataset.nth
        e.dataTransfer.effectAllowed = 'move'
        requestAnimationFrame(() => li.classList.add(CSS.dragging))
    })

    // 그룹 드래그 (sidebar 영역)
    sidebarEl.addEventListener('dragstart', e => {
        const group = e.target.closest('.sidebar-group')
        if (!group) return
        drag.type        = 'group'
        drag.sourceGroup = +group.dataset.group
        e.dataTransfer.effectAllowed = 'move'
        requestAnimationFrame(() => group.classList.add(CSS.dragging))
    })

    document.addEventListener('dragend', () => {
        contentEl.querySelectorAll(`li.line.${CSS.dragging}`).forEach(el => el.classList.remove(CSS.dragging))
        sidebarEl.querySelectorAll(`.sidebar-group.${CSS.dragging}`).forEach(el => el.classList.remove(CSS.dragging))
        clearScriptIndicator()
        clearGroupIndicator()
        clearScriptGroupIndicator()
        drag = {}
    })

    contentEl.addEventListener('dragover', e => {
        if (drag.type !== 'script') return
        const ul = e.target.closest('ul.line')
        if (!ul) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'

        clearScriptIndicator()
        const idx   = getInsertIndex(ul, e.clientY)
        const items = [...ul.querySelectorAll(`li.line:not(.${CSS.dragging})`)]

        if (items.length === 0) {
            ul.classList.add(CSS.dragOver)
        } else if (idx < items.length) {
            items[idx].classList.add(CSS.dragBefore)
        } else {
            items[items.length - 1].classList.add(CSS.dragAfter)
        }

        drag.targetGroup = state.selectedGroup
        drag.targetIndex = idx
    })

    sidebarEl.addEventListener('dragover', e => {
        const group = e.target.closest('.sidebar-group')
        if (!group) return

        if (drag.type === 'group') {
            if (group.classList.contains(CSS.dragging)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            clearGroupIndicator()
            const { top, height } = group.getBoundingClientRect()
            const before = e.clientY < top + height / 2
            group.classList.add(before ? CSS.groupDragBefore : CSS.groupDragAfter)
            drag.targetGroup  = +group.dataset.group
            drag.insertBefore = before

        } else if (drag.type === 'script') {
            const targetIdx = +group.dataset.group
            if (targetIdx === drag.sourceGroup) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            clearScriptGroupIndicator()
            group.classList.add(CSS.scriptDragOver)
            drag.targetGroup = targetIdx
        }
    })

    contentEl.addEventListener('dragleave', e => {
        if (drag.type !== 'script') return
        const ul = e.target.closest('ul.line')
        if (ul && !ul.contains(e.relatedTarget)) clearScriptIndicator()
    })

    sidebarEl.addEventListener('dragleave', e => {
        const group = e.target.closest('.sidebar-group')
        if (!group || group.contains(e.relatedTarget)) return
        if (drag.type === 'group') clearGroupIndicator()
        else if (drag.type === 'script') clearScriptGroupIndicator()
    })

    contentEl.addEventListener('drop', async e => {
        if (drag.type !== 'script') return
        e.preventDefault()
        const ul = e.target.closest('ul.line')
        if (!ul || drag.sourceGroup === undefined) return

        const sourceGroup = drag.sourceGroup
        const sourceNth   = drag.sourceNth
        const targetGroup = drag.targetGroup ?? state.selectedGroup
        const targetIndex = drag.targetIndex ?? 0
        drag = {}
        clearScriptIndicator()

        const storage = await getStorage()
        const [item] = storage[sourceGroup].contents.splice(sourceNth, 1)
        const insertAt = Math.max(0, Math.min(targetIndex, storage[targetGroup].contents.length))
        storage[targetGroup].contents.splice(insertAt, 0, item)
        await setStorage(storage)
        reloadAll()
    })

    sidebarEl.addEventListener('drop', async e => {
        if (drag.type === 'script') {
            e.preventDefault()
            const group = e.target.closest('.sidebar-group')
            if (!group) return
            const targetGroup = +group.dataset.group
            if (targetGroup === drag.sourceGroup) return
            const sourceGroup = drag.sourceGroup
            const sourceNth   = drag.sourceNth
            drag = {}
            clearScriptGroupIndicator()
            const storage = await getStorage()
            const [item] = storage[sourceGroup].contents.splice(sourceNth, 1)
            storage[targetGroup].contents.push(item)
            await setStorage(storage)
            reloadAll()
            return
        }

        if (drag.type !== 'group') return
        e.preventDefault()
        const group = e.target.closest('.sidebar-group')
        if (!group || drag.sourceGroup === undefined) return

        const sourceGroup  = drag.sourceGroup
        const targetGroup  = drag.targetGroup ?? +group.dataset.group
        const insertBefore = drag.insertBefore ?? true
        drag = {}
        clearGroupIndicator()

        if (sourceGroup === targetGroup) return

        const storage = await getStorage()
        const priorSelected = storage[state.selectedGroup]

        const [grp] = storage.splice(sourceGroup, 1)
        let insertAt = targetGroup > sourceGroup ? targetGroup - 1 : targetGroup
        if (!insertBefore) insertAt++
        insertAt = Math.max(0, Math.min(insertAt, storage.length))
        storage.splice(insertAt, 0, grp)

        // 그룹 순서가 바뀌어도 이전 선택을 유지하기 위해 객체 ref로 다시 인덱스 찾는다.
        const newIdx = storage.indexOf(priorSelected)
        if (newIdx !== -1) state.selectedGroup = newIdx

        await setStorage(storage)
        reloadAll()
    })
}
