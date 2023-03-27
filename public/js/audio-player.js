
async function injectVoicePlayer(funcStatus) {
    if (!funcStatus) {
        const audioPlayers = document.querySelectorAll('.audio-player');
        audioPlayers.forEach(audioPlayer => {
            const audio = audioPlayer.querySelector('audio');
            const playPauseButton = audioPlayer.querySelector('.play-pause-button');
            const progressBar = audioPlayer.querySelector('.progress');
            const progressBarContainer = audioPlayer.querySelector('.progress-bar-container');

            playPauseButton.addEventListener('click', () => togglePlay(audio, playPauseButton));

            audio.addEventListener('timeupdate', updateProgressBar);

            function updateProgressBar() {
                const progressPercent = audio.currentTime / audio.duration * 100;
                progressBar.style.width = `${progressPercent}%`;
            }

            progressBarContainer.addEventListener('click', scrub);

            function scrub(event) {
                const scrubTime = event.offsetX / progressBarContainer.offsetWidth * audio.duration;
                audio.currentTime = scrubTime;
            }
        });

        function togglePlay(audio, button) {
            if (audio.paused) {
                audio.play();
                // button.textContent = 'Pause';
            } else {
                audio.pause();
                // button.textContent = 'Play';
            }
        }

    }
}
