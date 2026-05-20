// 사용자 지정 glob 패턴(*, **)을 RegExp 문자열로 변환한다.
// `/.../` 형태로 감싼 입력은 정규식 그대로 취급한다.

export function globToRegexString(glob) {
    if (/^\/.*\/$/.test(glob)) return glob.replace(/^\/(.*)\/$/, '$1')
    const special = '\\^$+?.()|{}[]'
    let out = ['^']
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i]
        if (c === '*') {
            out.push('.*')
        } else {
            if (special.includes(c)) out.push('\\')
            out.push(c)
        }
    }
    out.push('$')
    return out.join('')
}
