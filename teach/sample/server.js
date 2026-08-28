const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const host = "127.0.0.1";
const port = Number(process.env.PORT) || 3000;
const indexPath = path.join(__dirname, "public", "index.html");

// This function intentionally contains a bug for the debugging exercise.
function calculateCartTotal(items) {
  return items.reduce((total, item) => {
    const unitPrice = item.price.amount.toFixed(2);
    return total + Number(unitPrice) * item.quantity;
  }, 0);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body, null, 2));
}

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/") {
    fs.readFile(indexPath, (error, content) => {
      if (error) {
        console.error("Failed to read the HTML file:", error);
        sendJson(response, 500, { ok: false, error: "Failed to load page" });
        return;
      }

      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(content);
    });
    return;
  }

  if (request.method === "GET" && request.url === "/api/calculate") {
    const cart = [
      { name: "Keyboard", price: 299, quantity: 1 },
      { name: "Mouse", price: 99, quantity: 2 }
    ];

    try {
      const total = calculateCartTotal(cart);
      sendJson(response, 200, { ok: true, total });
    } catch (error) {
      console.error("Cart calculation failed:", error);
      sendJson(response, 500, {
        ok: false,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      });
    }
    return;
  }

  sendJson(response, 404, { ok: false, error: "Not found" });
});

server.listen(port, host, () => {
  console.log(`Sample server is running at http://${host}:${port}`);
});
