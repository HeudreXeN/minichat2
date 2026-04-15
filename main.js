const socket = io();

let username = "";
let currentDM = "";
let selectedUser1 = "";
let selectedUser2 = "";

// =========================
// 🔁 AUTO LOGIN
// =========================
window.onload = () => {
    const savedUser = localStorage.getItem("username");

    if (savedUser) {
        username = savedUser;

        document.getElementById("login").style.display = "none";
        document.getElementById("chat").style.display = "block";

        document.getElementById("currentUser").textContent =
            "Přihlášen: " + username;

        socket.emit("load messages");
        socket.emit("auto login", username);
        socket.emit("get all users");
    }

    if (localStorage.getItem("darkMode") === "true") {
        document.body.classList.add("dark");
    }
};

// =========================
// 🔐 REGISTER
// =========================
function register() {
    const u = document.getElementById("usernameInput").value.trim();
    const p = document.getElementById("passwordInput").value.trim();

    if (!u || !p) return alert("Zadej jméno i heslo");

    socket.emit("register", { username: u, password: p });
}

// =========================
// 🔐 LOGIN
// =========================
function login() {
    const u = document.getElementById("usernameInput").value.trim();
    const p = document.getElementById("passwordInput").value.trim();

    if (!u || !p) return alert("Zadej jméno i heslo");

    socket.emit("login", { username: u, password: p });
}

// =========================
// ✔ SUCCESS LOGIN/REGISTER
// =========================
socket.on("register success", handleLogin);
socket.on("login success", handleLogin);

function handleLogin(name) {
    username = name;
    localStorage.setItem("username", name);

    document.getElementById("login").style.display = "none";
    document.getElementById("chat").style.display = "block";

    document.getElementById("currentUser").textContent =
        "Přihlášen: " + username;

    document.getElementById("messages").innerHTML = "";

    socket.emit("load messages");
    socket.emit("get all users");
}

// =========================
// ❌ ERRORS
// =========================
socket.on("register error", (msg) => alert(msg));
socket.on("login error", (msg) => alert(msg));

// =========================
// 💬 GLOBAL CHAT
// =========================
socket.on("load messages", (msgs) => {
    const ul = document.getElementById("messages");
    ul.innerHTML = "";
    msgs.forEach(addGlobalMessage);
});

socket.on("chat message", addGlobalMessage);

function sendGlobal() {
    const text = document.getElementById("input").value.trim();
    if (!text) return;

    socket.emit("chat message", {
        user: username,
        text
    });

    document.getElementById("input").value = "";
}

function addGlobalMessage(msg) {
    const li = document.createElement("li");
    li.textContent = `[${msg.time}] ${msg.user}: ${msg.text}`;

    if (username === "Admin") {
        const btn = document.createElement("button");
        btn.textContent = "❌";
        btn.onclick = () => socket.emit("delete message", msg.id);
        li.appendChild(btn);
    }

    document.getElementById("messages").appendChild(li);

    // auto scroll
    document.getElementById("messages").scrollTop =
        document.getElementById("messages").scrollHeight;
}

// =========================
// 👥 USERS
// =========================
socket.on("all users", (users) => {
    const ul = document.getElementById("users");
    ul.innerHTML = "";

    users.forEach((u) => {
        const li = document.createElement("li");
        li.textContent = u;
        li.onclick = () => openDM(u);
        ul.appendChild(li);
    });
});

// =========================
// 💌 DM OPEN
// =========================
function openDM(user) {
    if (username === "Admin") {

        if (!selectedUser1) {
            selectedUser1 = user;
            alert("Vyber druhého uživatele");
            return;
        }

        selectedUser2 = user;

        document.getElementById("dmChat").style.display = "flex";
        document.getElementById("dmHeader").textContent =
            "DM: " + selectedUser1 + " ↔ " + selectedUser2;

        socket.emit("load dm history", {
            user1: selectedUser1,
            user2: selectedUser2
        });

        selectedUser1 = "";
        selectedUser2 = "";

    } else {
        currentDM = user;

        document.getElementById("dmChat").style.display = "flex";
        document.getElementById("dmHeader").textContent = "DM s: " + user;

        socket.emit("load dm history", {
            user1: username,
            user2: currentDM
        });
    }
}

// =========================
// 📥 DM HISTORY
// =========================
socket.on("dm history", (msgs) => {
    const ul = document.getElementById("dmMessages");
    ul.innerHTML = "";

    msgs.forEach((m) => {
        const li = document.createElement("li");
        li.textContent = `[${m.time}] ${m.sender}: ${m.text}`;
        ul.appendChild(li);
    });

    ul.scrollTop = ul.scrollHeight;
});

// =========================
// 📩 DM MESSAGE (ONLY ONCE!)
// =========================
socket.on("dm message", ({ sender, text, time }) => {
    const ul = document.getElementById("dmMessages");

    const li = document.createElement("li");
    li.textContent = `[${time}] ${sender}: ${text}`;
    ul.appendChild(li);

    ul.scrollTop = ul.scrollHeight;
});

// =========================
// 📤 SEND DM
// =========================
function sendDM() {
    const text = document.getElementById("dmInput").value.trim();
    if (!text) return;

    socket.emit("dm message", {
        sender: username,
        receiver: currentDM,
        text
    });

    document.getElementById("dmInput").value = "";
}

// =========================
// 🚪 LOGOUT
// =========================
function logout() {
    localStorage.removeItem("username");
    location.reload();
}

// =========================
// 🌙 DARK MODE
// =========================
function toggleDarkMode() {
    document.body.classList.toggle("dark");
    localStorage.setItem(
        "darkMode",
        document.body.classList.contains("dark")
    );
}

// =========================
// 📱 SIDEBAR
// =========================
function openSidebar() {
    document.querySelector(".sidebar").classList.add("open");
    document.getElementById("overlay").classList.add("show");
}

function closeSidebar() {
    document.querySelector(".sidebar").classList.remove("open");
    document.getElementById("overlay").classList.remove("show");
}

window.addEventListener("load", () => {

    const btn = document.getElementById("closeDmBtn");

    if (btn) {
        btn.addEventListener("click", () => {
            document.getElementById("dmChat").style.display = "none";

            currentDM = "";
            selectedUser1 = "";
            selectedUser2 = "";
        });
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        document.getElementById("dmChat").style.display = "none";
        currentDM = "";
    }
});