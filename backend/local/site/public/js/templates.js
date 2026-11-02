// Copy code buttons of the templates page: the code of the template is fetched and copied to the
// clipboard, to be pasted in the editor with Ctrl+V
for (const button of document.querySelectorAll('[data-template-code]')) {
    const label = button.textContent;
    button.addEventListener('click', async () => {
        try {
            const response = await fetch(button.dataset.templateCode);
            if (!response.ok) {
                throw new Error(String(response.status));
            }
            await navigator.clipboard.writeText(await response.text());
            button.textContent = 'Copied';
        } catch {
            button.textContent = 'Could not copy';
        }
        setTimeout(() => (button.textContent = label), 1500);
    });
}
