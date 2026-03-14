/**
 * PWA Install Logic 🌿📱
 */
document.addEventListener('DOMContentLoaded', () => {
    let deferredPrompt;
    const installBtn = document.getElementById('installAppBtn');

    if (!installBtn) return;

    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Update UI to notify the user they can add to home screen
        installBtn.style.display = 'flex';
        console.log('🌿 PWA Install Prompt captured');
    });

    installBtn.addEventListener('click', (e) => {
        // hide our user interface that shows our A2HS button
        installBtn.style.display = 'none';
        // Show the prompt
        if (deferredPrompt) {
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('🌿 User accepted the A2HS prompt');
                } else {
                    console.log('🌿 User dismissed the A2HS prompt');
                }
                deferredPrompt = null;
            });
        }
    });

    // Register Service Worker (scoped to /GyS-Chats/ to avoid conflicts with other PWAs)
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js', {
                scope: '/GyS-Chats/'
            })
                .then(registration => {
                    console.log('🌿 ServiceWorker registration successful with scope: ', registration.scope);
                }, err => {
                    console.log('🌿 ServiceWorker registration failed: ', err);
                });
        });
    }
});
