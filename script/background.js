const storage = () => { return JSON.parse(localStorage.data || '[]') }
const prepare = {
    ua: {
        contents: [],
        applied: [],
        update: () => {
            prepare.ua.contents = []
            storage().forEach(group => {
                group['contents'].forEach(content => {
                    if (content.activate && content.action == "user agent") {
                        prepare.ua.contents.push({ url: content.url, string: content.script, activate: true })
                    }
                })
            })
        },
        apply: (header) => {
            if (["main_frame", "sub_frame", "xmlhttprequest"].includes(header.type)) {
                const ua = prepare.ua
                ua.applied = []
                ua.contents.forEach(content => {
                    if (isAllowedSite(content, header.url)) {
                        ua.applied = content.url
                        header.requestHeaders.some(i => {
                            if (i.name == "User-Agent") {
                                i.value = content.string
                                return true
                            }
                        })
                    }
                })
            }
            return { requestHeaders: header.requestHeaders }
        }
    },
    inject: {
        contents: [],
        applied: [],
        update: () => {
            prepare.inject.contents = []
            storage().forEach(group => {
                group['contents'].forEach(content => {
                    if (content.activate && content.action != "user agent") {
                        prepare.inject.contents.push(content)
                    }
                })
            })
        },
        apply: (request) => {
            const inject = prepare.inject
            inject.applied = []
            inject.contents.forEach(content => {
                if (isAllowedSite(content, request.url)) {
                    inject.applied.push(content)
                }
            })
            return inject.applied
        }
    }
}
const globToRegex = (glob) => {
    // Use a regexp if the url starts and ends with a slash `/`
    if (/^\/.*\/$/.test(glob)) return new RegExp(glob.replace(/^\/(.*)\/$/, '$1'))
    const specialChars = '\\^$*+?.()|{}[]'
    let regexChars = ['^']
    for (let i = 0; i < glob.length; ++i) {
        let c = glob.charAt(i)
        if (c === '*') {
            regexChars.push('.*.')
        } else {
            if (specialChars.indexOf(c) >= 0) {
                regexChars.push('\\')
            }
            regexChars.push(c)
        }
    }
    regexChars.push('$')
    return new RegExp(regexChars.join(''))
}
const isAllowedSite = (content, url) => {
    if (!content.activate) {
        return false
    }
    if (!content.url[0]) {
        return true
    }
    let allow = false
    content.url.some(checkUrl => {
        if (globToRegex(checkUrl).test(url)) {
            allow = true
            return true
        }
    })
    return allow
}
chrome.webRequest.onBeforeSendHeaders.addListener((header) => { return prepare.ua.apply(header) }, { urls: prepare.ua.applied }, ["blocking", "requestHeaders"])
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type == "inject") {
        sendResponse(prepare.inject.apply(request))
    } else if (request.type == "syncedLoad") {
        prepare.ua.update()
        prepare.inject.update()
        chrome.runtime.sendMessage({ type: "load" });
    } 
})
prepare.ua.update()
prepare.inject.update()