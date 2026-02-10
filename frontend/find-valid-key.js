const https = require("https");
const fs = require("fs");

// Base segments
const start = "AIzaSyCZc";
const segment1_options = ["0Bp", "OBp"]; // Zero vs Oh
const middle = "MdkLtsSu";
const segment2_options = ["I0Nu", "lONu", "IONu", "l0Nu"];
const end = "JkmBtJ7Mdi8HHRw";

const keys = [];

segment1_options.forEach((seg1) => {
  segment2_options.forEach((seg2) => {
    keys.push(start + seg1 + middle + seg2 + end);
  });
});

const checkKey = (key) => {
  return new Promise((resolve) => {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${key}`;
    const req = https.request(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const isValid =
            !data.includes("API key not valid") &&
            !data.includes("API_KEY_INVALID");
          if (isValid) {
            console.log(`VALID_KEY_FOUND: ${key}`);
            fs.writeFileSync("valid_key.txt", key);
            process.exit(0);
          }
          resolve();
        });
      },
    );

    req.on("error", (e) => {
      resolve();
    });

    req.write(
      JSON.stringify({
        identifier: "test@example.com",
        continueUri: "http://localhost",
      }),
    );
    req.end();
  });
};

async function run() {
  for (const key of keys) {
    process.stdout.write(".");
    await checkKey(key);
  }
  console.log("No valid key found.");
}

run();
