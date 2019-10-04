const uska = {
    key: [],
    inject: () => {
        Mousetrap.prototype.stopCallback = (e, element, combo) => {
            return element.tagName === 'INPUT'
                || element.tagName === 'SELECT'
                || element.tagName === 'TEXTAREA'
                || element.isContentEditable
        }
        uska.key.forEach((action) => {
            if (action.key.indexOf('space') + 1) {
                window.onkeydown = (e) => {
                    if (e.keyCode == 32 && e.target == document.body) {
                        e.preventDefault();
                    }
                };
            }
            Mousetrap.bind(action.key.toLowerCase(), () => {
                let script = document.createElement('script')
                script.textContent = action.script
                document.body.appendChild(script)
                document.body.removeChild(script)
            })
        })
    }
}
chrome.runtime.sendMessage({ type: 'inject', url: document.URL }, (response) => {
    response.forEach((content) => {
        switch (content.action) {
            case "instant":
                eval(content.script)
                return
            case "style":
                try {
                    (() => {
                        let style = document.createElement('style')
                        style.setAttribute("type", "text/css")
                        style.innerHTML = content.script
                        document.head.appendChild(style);
                    })();
                }
                catch (e) { }
                return
            case "key":
                uska.key.push({ key: content.key, script: content.script })
                return
        }
    })
    uska.inject()
})