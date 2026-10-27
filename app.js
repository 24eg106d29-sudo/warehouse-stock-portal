
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "warehouse_stock",
    port: Number(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10
});

function addStatus(product) {
    return {
        ...product,
        status: product.quantity <= product.minStock
            ? "Low Stock"
            : "In Stock"
    };
}

async function initializeDatabase() {
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            quantity INT NOT NULL DEFAULT 0,
            minStock INT NOT NULL DEFAULT 0
        )
    `);

    const [rows] = await pool.execute(
        "SELECT COUNT(*) AS total FROM products"
    );

    if (rows[0].total === 0) {
        await pool.query(
            `INSERT INTO products (name, quantity, minStock)
             VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
            [
                "Laptop", 25, 10,
                "Keyboard", 5, 10,
                "Mouse", 40, 15
            ]
        );
    }

    console.log("MySQL database connected successfully.");
}

app.get("/api", (req, res) => {
    res.json({
        message: "Warehouse Stock Portal backend is running!"
    });
});

app.get("/api/products", async (req, res) => {
    try {
        const [products] = await pool.execute(
            "SELECT id, name, quantity, minStock FROM products ORDER BY id"
        );
        res.json(products.map(addStatus));
    } catch (error) {
        console.error("Fetch products error:", error.message);
        res.status(500).json({ message: "Could not fetch products." });
    }
});

app.post("/api/products", async (req, res) => {
    const { name, quantity, minStock } = req.body;

    if (
        typeof name !== "string" ||
        !name.trim() ||
        !Number.isInteger(quantity) ||
        quantity < 0 ||
        !Number.isInteger(minStock) ||
        minStock < 0
    ) {
        return res.status(400).json({
            message: "Enter a product name, valid quantity, and minimum stock."
        });
    }

    try {
        const [result] = await pool.execute(
            "INSERT INTO products (name, quantity, minStock) VALUES (?, ?, ?)",
            [name.trim(), quantity, minStock]
        );

        res.status(201).json(addStatus({
            id: result.insertId,
            name: name.trim(),
            quantity,
            minStock
        }));
    } catch (error) {
        console.error("Add product error:", error.message);
        res.status(500).json({ message: "Could not add product." });
    }
});

app.put("/api/products/:id", async (req, res) => {
    const id = Number(req.params.id);
    const { name, quantity, minStock } = req.body;

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ message: "Invalid product ID." });
    }

    if (
        name === undefined &&
        quantity === undefined &&
        minStock === undefined
    ) {
        return res.status(400).json({
            message: "Provide at least one field to update."
        });
    }

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({
            message: "Product name cannot be empty."
        });
    }

    if (
        quantity !== undefined &&
        (!Number.isInteger(quantity) || quantity < 0)
    ) {
        return res.status(400).json({
            message: "Quantity must be a non-negative integer."
        });
    }

    if (
        minStock !== undefined &&
        (!Number.isInteger(minStock) || minStock < 0)
    ) {
        return res.status(400).json({
            message: "Minimum stock must be a non-negative integer."
        });
    }

    try {
        const [rows] = await pool.execute(
            "SELECT id, name, quantity, minStock FROM products WHERE id = ?",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Product not found." });
        }

        const oldProduct = rows[0];
        const updated = {
            name: name === undefined ? oldProduct.name : name.trim(),
            quantity: quantity === undefined ? oldProduct.quantity : quantity,
            minStock: minStock === undefined ? oldProduct.minStock : minStock
        };

        await pool.execute(
            "UPDATE products SET name = ?, quantity = ?, minStock = ? WHERE id = ?",
            [updated.name, updated.quantity, updated.minStock, id]
        );

        res.json(addStatus({ id, ...updated }));
    } catch (error) {
        console.error("Update product error:", error.message);
        res.status(500).json({ message: "Could not update product." });
    }
});

app.delete("/api/products/:id", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ message: "Invalid product ID." });
    }

    try {
        const [rows] = await pool.execute(
            "SELECT id, name, quantity, minStock FROM products WHERE id = ?",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Product not found." });
        }

        await pool.execute("DELETE FROM products WHERE id = ?", [id]);

        res.json({
            message: "Product deleted successfully.",
            product: rows[0]
        });
    } catch (error) {
        console.error("Delete product error:", error.message);
        res.status(500).json({ message: "Could not delete product." });
    }
});

async function startServer() {
    try {
        await initializeDatabase();

        app.listen(PORT, () => {
            console.log(`Warehouse server running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Startup failed:", error.message);
        console.error("Check MySQL is running and your .env settings are correct.");
        process.exit(1);
    }
}

startServer();
