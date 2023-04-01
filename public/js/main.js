
const chatMessages = document.getElementById("chat-messages");
emojione.ascii = true;
let title = $('#historyDate');
function addChatMessage(message) {
    const messageElement = document.createElement("li");
    messageElement.classList.add("shoutbox-content");
    // Встановлюємо флаг, чи відображати поля для спойлеру
    let showChat = false;
    // додаємо всі властивості об’єкта
    for (const prop in message) {
        // якщо це одне з вибраних полів, пропускаємо його
        if (['user', 'text', 'time', 'message_id', 'aiAnswer'].includes(prop)) {
            continue;
        }
        const value = typeof message[prop] === "object"
            ? JSON.stringify(message[prop], null, 2)
            : String(message[prop]).replace(/</g, '&lt;').replace(/>/g, '&gt;');

        if (typeof message[prop] === "object") {
            messageElement.innerHTML += `<details ${showChat && ''}> <summary>${prop}</summary>`;
            const nestedObject = message[prop];
            for (const nProp in nestedObject) {
                const nestedValue = nestedObject[nProp];
                const valueToPrint = typeof nestedValue === "object"
                    ? JSON.stringify(nestedValue, null, 2)
                    : String(nestedValue).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                messageElement.innerHTML += `
                &emsp;&emsp;<b>${nProp}</b>: ${valueToPrint}<br>
            `;
            }
            messageElement.innerHTML += '</details>';
            showChat = true;
        } else {
            messageElement.innerHTML += `<p><b>${prop}</b>: ${value}</p>`;
        }
    }
    let onceMedia = '';
    const user = typeof message.user === "string" ? message.user : '';
    const text = typeof message.text === "string" ? message.text : '';
    const time = new Date(message.time).toLocaleString() || '';
    const photo = message.url_photo ? `<img class="photo" src="${message.url_photo}" width="650" height="auto">` : '';
    const sticker = message.url_sticker ? `<img class="sticker" src="${message.url_sticker}" width="196" height="196">` : '';
    const video_note = message.url_video_note ? `<div id="circular-progress-${message.message_id}" class="circular-progress">
    <video class="video_note" id="video_note-${message.message_id}" autoplay muted>
        <source
            src="${message.url_video_note}"
            type="video/mp4" />
    </video>
    <span id="progress-value-${message.message_id}" onclick="document.querySelector('#video_note-${message.message_id}').click()" class="progress-value"></span>
</div>` : '';
    const voice = message.url_voice ? `<div class="audio-player">
    <button class="play-pause-button">${message.voice.duration}s.</button>
    <div class="progress-bar-container">
      <div class="progress"></div>
    </div>
    <audio src="${message.url_voice}"></audio>
  </div>` : '';
    const music = message.url_audio ? `<div id="audio-player">
  <h2>${message.audio.performer} — ${message.audio.title}</h2>
  <audio src="${message.url_audio}" id="audio"></audio>
  <div id="controls">
    <button id="play-button">Грати#?</button>
    <div id="timeline-container">
      <div id="timeline"></div>
      <div id="current-time"></div>
    </div>
  </div>
</div>`: '';
    const video = message.url_video ? `<div class="video-player">
                                        <video src="${message.url_video}" controls></video>
                                    </div>`: '';
    const animated_sticker = message.url_animated_sticker ? `<tgs-player style='width: auto;height: 220px;' autoplay=true loop=true mode='normal' src='http://localhost:3002/${message.url_animated_sticker}' ></tgs-player>` : '';
    const animation = message.url_animation ? `<div class="animation">
    <video class="animation" src="${message.url_animation}"  autoplay loop></video>
</div>`: '';
    if (photo) {
        onceMedia = photo;
    } else if (sticker) {
        onceMedia = sticker;
    } else if (video_note) {
        onceMedia = video_note;
    } else if (voice) {
        onceMedia = voice;
    } else if (video) {
        onceMedia = video;
    } else if (animated_sticker) {
        onceMedia = animated_sticker;
    } else if (animation) {
        onceMedia = animation;
    } else if (music) {
        onceMedia = music;

    }
    messageElement.innerHTML = `
<span class="shoutbox-username"><b>${user}</b></span>
<br>
<span class="shoutbox-comment-reply">${text.replace("\n", "<br>")}</span>
<br>
${onceMedia}
<br>
${message.aiAnswer ? `<span style="color:#ff8000;"><b>AI Answer:</b><br> ${message.aiAnswer.replaceAll("\n", "<br>")}</span><br><br>` : ''}

<details ${showChat && ''}>
    <summary>(Spoiler) JSON:</summary><pre><code class="language-json">${JSON.stringify(message, null, 2)}</code></pre>
    
</details>
<span class="shoutbox-comment-ago"><b>${time}</b></span>
`;
    messageElement.classList.add("shoutbox-content");
    if (latestMessageId !== 0) {
        chatMessages.insertBefore(messageElement, chatMessages.firstChild);
    } else {
        chatMessages.appendChild(messageElement);
    }
}
// Отримання даних про повідомлення з сервера
let statusFunc = false;
let latestMessageId = 0;
let selectedUserDate = $('#selectDate').val() ? $('#selectDate').val() : new Date();
async function fetchMessages() {
    const serverRespon = await getSettingsFromServer();
    selectedUserDate = serverRespon.Date ? serverRespon.Date : new Date();
    const response = await fetch(`/messages?since=${latestMessageId}&date=${selectedUserDate}&group=${groupAfterSelection}`);
    if (!response.ok) {
        console.error("Не вдалось отримати список повідомлень");
        return;
    }
    const messages = await response.json();
    if (messages.length === 0) {
        messages.forEach(addChatMessage);
    }
    if (messages.length > 0) {
        latestMessageId = messages[0].message_id;
        messages.reverse();
        messages.forEach(addChatMessage);
    }
    title.html(`<button id="settings-btn" class="settings-btn">Settings</button>Last Update: ${new Date().toLocaleString()}`);
    await injectVoicePlayer(statusFunc);
    injectMusicPlayer(statusFunc);
    Prism.highlightAll('pre.language-json'); //розкрашування json
}
/* Для того щоб навіть пізніше додані елементи могли викликати функцію */
async function getSettingsFromServer() {
    let response = [];
    await fetch('/api/v1/getSettings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
        .then(response => response.json())
        .then(data => {
            response = data;
        }).catch(error => console.error(error));
    return response;
}
let groupAfterSelection = '';
$(document).ready(function () {
    $(document).on('change', '#groupsSelect', function () {
        groupAfterSelection = $(this).val();
        console.log(groupAfterSelection);
    });

    $(document).on('click', '.settings-btn', async function () {
        const data = await getSettingsFromServer();
        const groups = data.groups;
        let options = "";
        if (groups) {
            groups.forEach((group) => {
                options += `<option value="${group}">${group}</option>`;
            });
            //<label for="selectGroupChat">Select chat:</label>
            const selectTemplate = `
    <select id="groupsSelect" class="js-example-basic-single" name="state">
    <option value="" >Chuse option</option>
    <option value="allPrivate" >All Private Message</option>
      ${options}
    </select>`;

            $("#groupsSelect").replaceWith(selectTemplate);
            $('#groupsSelect').select2({
                width: '100%',
                style: "display:block;",
                minimumResultsForSearch: -1
            });
            $('#groupsSelectLabel').css({ "display": "block" });
        }

        //  
        $('#listeningPort').val(data['Listening Port']);
        $('#listeningPath').val(data['Listening Path']);
        $('#corsServerPort').val(data['Cors Server Port']);
        const dateParts = data['Date'].split('.');
        const formattedDate = `${dateParts[2]}-${(Number(dateParts[1])).toString().padStart(2, "0")}-${(Number(dateParts[0])).toString().padStart(2, "0")}`;
        $('#selectDate').val(formattedDate);
        $("#dialog").dialog("open");
    });
    $(function () {
        $("#dialog").dialog({
            autoOpen: false,
            width: "40%",
            modal: true,
            buttons: {
                "Save": async function () {
                    // Send values to server
                    const data = {
                        'Listening Port': $('#listeningPort').val(),
                        'Listening Path': $('#listeningPath').val(),
                        'Cors Server Port': $('#corsServerPort').val(),
                        'Date': formatDate($('#selectDate').val()),
                        'group': groupAfterSelection
                    };
                    console.log(formatDate($('#selectDate').val()));
                    await fetch('/api/v1/setSettings', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(data)
                    }).then(response => response.json()).then(data => {
                        $('#listeningPort').val(data['Listening Port']);
                        $('#listeningPath').val(data['Listening Path']);
                        $('#corsServerPort').val(data['Cors Server Port']);

                    }).catch(error => console.error(error));
                    $(this).dialog("close");
                    // location.reload();
                    $('#chat-messages').empty();
                    latestMessageId = 0;
                    await fetchMessages();
                },
                Cancel: function () {
                    $(this).dialog("close");
                }
            }
        });
    });
    /* settings button event listening */

    /* Фунція для йобаного кружечка togle */
    $(document).on('click', 'video', function () {
        startProgressBar(this.id);
        if (this.paused) {
            this.play();
            this.muted = false;
            this.currentTime = 0;
            this.loop = false;
            console.log("1");
            return;
        }
        if (this.play && this.muted) {
            console.log("2");
            this.currentTime = 0;
            this.muted = false;
            return;
        }
        if (this.play && !this.muted) {
            console.log("3");
            this.pause();
            return;
        }
    });
});
/* Фунція для йобаного кружечка togle */

/* Фунція для відображення прогресу йобаного кружечка */
function startProgressBar(video_noteId) {
    const id = video_noteId.replace("video_note-", "");
    const video = document.querySelector(`#video_note-${id}`);
    const circularProgress = document.querySelector(`#circular-progress-${id}`);
    const progressValue = document.querySelector(`#progress-value-${id}`);
    const progressEndValue = 100;
    const speed = 5;
    function updateProgress() {
        const currentPosition = (video.currentTime / video.duration) * 100;
        const degrees = currentPosition * 3.8;
        // progressValue.textContent = `${currentPosition.toFixed()}%`;
        //progressValue.textContent = `${video.currentTime.toFixed(1)}/${video.duration.toFixed(1)}`;
        circularProgress.style.background = `conic-gradient(#7d2ae8 ${degrees}deg, #ededed 0deg)`;
        const progressElement = circularProgress.querySelector('.progress');
        //progressElement.style.transform = `rotate(${degrees}deg)`;
        if (currentPosition >= progressEndValue) {
            clearInterval(progress);
            progressValue.textContent = '';
        }
    }
    const progress = setInterval(updateProgress, speed);
}
/* Фунція для відображення прогресу йобаного кружечка */



/* Music Це треба фіксить багато ще*/
function injectMusicPlayer(funcStatus) {

    if (!funcStatus) {

        const audioPlayers = document.querySelectorAll('#audio-player');
        const playButtons = document.querySelectorAll('#play-button');

        audioPlayers.forEach((audioPlayer, index) => {
            const playButton = playButtons[index];
            const audio = audioPlayer.querySelector('audio');

            // Слухач на кнопку грати/пауза.
            playButton.addEventListener('click', (event) => {
                if (audio.paused || audio.ended) {
                    audio.play();
                    playButton.innerText = "Не Грати#?";
                } else {
                    audio.pause();
                    playButton.innerText = "Грати#?";
                }
            });

            // Слухач на подію timeupdate аудіо.
            audio.addEventListener('timeupdate', () => {
                const duration = audio.duration;
                const currentTimeValue = audio.currentTime;
                const progress = (currentTimeValue / duration) * 100;
                const timeline = audioPlayer.getElementsByTagName("div")[0].getElementsByTagName("div")[0];
                const currentTime = audioPlayer.getElementsByTagName("div")[1];

                // timeline.style.width = `${progress}%`;
                currentTime.innerText = `${currentTimeValue.toFixed(2)}s / ${duration.toFixed(2)}s`;
            });
        });

    }

}
/* Music */

fetchMessages();
setInterval(fetchMessages, 8295);


function formatDate(date, time = false, tHour = false) {
    let d = new Date(date);

    if (isNaN(d)) {
        return date;
    }

    const day = d.getDate().toString().padStart(2, '0'); // 01
    const month = (d.getMonth() + 1).toString().padStart(2, '0'); // 04
    const year = d.getFullYear(); // 2023

    if (tHour) {
        return `${d.toLocaleTimeString('uk-UA', { hour12: false })}`;
    } else if (time) {
        return `${day}.${month}.${year} ${d.toLocaleTimeString('uk-UA')}`;
    } else {
        return `${day}.${month}.${year}`;
    }
}
