const sqlite3 = require("sqlite3").verbose();

// otevřeme databázi
const db = new sqlite3.Database("chat.db");

db.all("SELECT id, username FROM users", (err, rows) => {
    if (err) {
        console.error("Chyba při načítání uživatelů:", err);
        return;
    }

    console.log("Seznam registrovaných uživatelů:");
    rows.forEach(row => {
        console.log(`ID: ${row.id}, Uživatelské jméno: ${row.username}, heslo: ${row.sqlite3}`);
    });

    db.close();
});