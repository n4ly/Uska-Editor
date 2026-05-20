chrome.storage.local.get('theme', r => {
    if (!r.theme || r.theme === 'dark') document.documentElement.classList.add('theme-dark')
})
