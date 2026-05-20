// 사용자가 작성한 라이브러리(export/import) 코드를 즉시 실행 가능한 IIFE로 변환한다.
// background.js의 syncUserScripts와 applyInject에서 공통으로 사용된다.

export function nameToId(name) {
    return '__uskaLib_' + name.replace(/[^a-zA-Z0-9]/g, '_')
}

export function transformLibraryCode(name, code) {
    const id = nameToId(name)
    const exported = []
    let defaultName = null
    const transformed = code
        .replace(/^([ \t]*)export\s+default\s+(async\s+function)\s+(\w+)/gm, (_, i, d, n) => { exported.push(n); defaultName = n; return i + d + ' ' + n })
        .replace(/^([ \t]*)export\s+default\s+function\s+(\w+)/gm,           (_, i, n)    => { exported.push(n); defaultName = n; return i + 'function ' + n })
        .replace(/^([ \t]*)export\s+default\s+class\s+(\w+)/gm,              (_, i, n)    => { exported.push(n); defaultName = n; return i + 'class ' + n })
        .replace(/^([ \t]*)export\s+default\s+(\w+)\s*;?\s*$/gm,             (_, i, n)    => { defaultName = n; return '' })
        .replace(/^([ \t]*)export\s+(async\s+function)\s+(\w+)/gm,           (_, i, d, n) => { exported.push(n); return i + d + ' ' + n })
        .replace(/^([ \t]*)export\s+function\s+(\w+)/gm,                     (_, i, n)    => { exported.push(n); return i + 'function ' + n })
        .replace(/^([ \t]*)export\s+(const|let|var)\s+(\w+)/gm,              (_, i, k, n) => { exported.push(n); return i + k + ' ' + n })
        .replace(/^([ \t]*)export\s+class\s+(\w+)/gm,                        (_, i, n)    => { exported.push(n); return i + 'class ' + n })
    const names = [...new Set(exported)]
    const namedPart  = names.join(', ')
    const defaultPart = defaultName ? `__default: ${defaultName}` : ''
    const returnBody = [namedPart, defaultPart].filter(Boolean).join(', ')
    return 'var ' + id + ' = (() => {\n' + transformed + '\nreturn {' + returnBody + '}\n})()'
}

export function transformScriptImports(code, libs) {
    return libs.reduce((src, lib) => {
        const esc = lib.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return src
            .replace(new RegExp(`^([ \\t]*)import\\s*\\{([^}]+)\\}\\s*from\\s*['"]uska:${esc}['"][ \\t]*;?`, 'gm'),
                (_, i, names) => `${i}var { ${names.trim()} } = ${lib.id}`)
            .replace(new RegExp(`^([ \\t]*)import\\s*\\*\\s*as\\s*(\\w+)\\s*from\\s*['"]uska:${esc}['"][ \\t]*;?`, 'gm'),
                (_, i, alias) => `${i}var ${alias} = ${lib.id}`)
            .replace(new RegExp(`^([ \\t]*)import\\s+(\\w+)\\s*from\\s*['"]uska:${esc}['"][ \\t]*;?`, 'gm'),
                (_, i, name) => `${i}var ${name} = ${lib.id}.__default`)
    }, code)
}

// 그룹 contents에서 활성화된 라이브러리들을 추출해 변환된 형태로 반환한다.
// syncUserScripts와 applyInject에서 동일하게 사용되던 매핑 로직을 통합한다.
export function buildLibsFromGroup(group) {
    return (group.contents || [])
        .filter(c => c.activate && c.action === 'library' && c.script && c.libraryId)
        .map(c => ({
            name: c.libraryId,
            id: nameToId(c.libraryId),
            code: transformLibraryCode(c.libraryId, c.script),
        }))
}

// 라이브러리들의 IIFE 코드와 import-치환된 사용자 스크립트를 결합해 최종 실행 코드를 만든다.
export function combineWithLibs(script, libs) {
    if (!libs.length) return script
    const preamble = libs.map(l => l.code).join('\n')
    return preamble + '\n' + transformScriptImports(script, libs)
}
