const https = require("https");

const keys = [
  { name: "Backend", value: "AIzaSyCZc0BpMdkLtsSuI0NuJkmBtJ7Mdi8HHRw" },
  {
    name: "Screenshot_Interpretation_1",
    value: "AIzaSyCZcOBpMdkLtsSulONuJkmBtJ7Mdi8HHRw",
  },
  {
    name: "Screenshot_Interpretation_2",
    value: "AlzaSyCZcOBpMdkLtsSulONuJkmBtJ7Mdi8HHRw",
  },
];

const checkKey = (keyObj) => {
  return new Promise((resolve) => {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${keyObj.value}`;
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
          const isValid = !data.includes("API key not valid");
          console.log(`KeyName: ${keyObj.name}`);
          console.log(`Payload: ${data.substring(0, 150).replace(/\n/g, " ")}`);
          console.log(`IsValid: ${isValid}`);
          console.log("--------------------------------------------------");
          resolve();
        });
      },
    );

    req.on("error", (e) => {
      console.error(`Problem with request: ${e.message}`);
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
  for (const k of keys) {
    await checkKey(k);
  }
}

run();
