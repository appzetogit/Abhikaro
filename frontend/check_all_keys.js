const https = require("https");

// Segments
const start = "AIzaSyCZc";
const middle = "MdkLtsSu";
const end = "JkmBtJ7Mdi8HHRw";

const seg1s = ["0Bp", "OBp"];
const seg2s = ["I0Nu", "lONu", "IONu", "l0Nu"]; // Indigo-0, Lima-O, Indigo-O, Lima-0

const keys = [];
seg1s.forEach((s1) => {
  seg2s.forEach((s2) => {
    keys.push(start + s1 + middle + s2 + end);
  });
});

console.log(`Checking ${keys.length} keys...`);

const check = (key) => {
  return new Promise((r) => {
    const req = https.request(
      `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          const isInvalid =
            d.includes("API_KEY_INVALID") || d.includes("API key not valid");
          console.log(
            `Key: ...${key.substring(9, 12)}...${key.substring(20, 24)}...`,
          );
          console.log(`Status: ${res.statusCode}`);
          if (isInvalid) console.log("Result: INVALID");
          else console.log(`Result: PROBABLY VALID (${d.substring(0, 50)}...)`);
          console.log("---");
          r();
        });
      },
    );
    req.on("error", (e) => r());
    req.write(
      JSON.stringify({
        identifier: "test@example.com",
        continueUri: "http://localhost",
      }),
    );
    req.end();
  });
};

(async () => {
  for (const k of keys) await check(k);
})();
