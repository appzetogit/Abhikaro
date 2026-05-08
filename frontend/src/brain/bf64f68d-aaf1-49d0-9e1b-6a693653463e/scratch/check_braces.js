import fs from 'fs';
const content = fs.readFileSync('e:/Abhikaro-main/frontend/src/module/user/pages/cart/Cart.jsx', 'utf8');

let openBraces = 0;
let closeBraces = 0;
let openParens = 0;
let closeParens = 0;
let openBrackets = 0;
let closeBrackets = 0;

for (let char of content) {
    if (char === '{') openBraces++;
    if (char === '}') closeBraces++;
    if (char === '(') openParens++;
    if (char === ')') closeParens++;
    if (char === '[') openBrackets++;
    if (char === ']') closeBrackets++;
}

console.log(`Braces: { ${openBraces}, } ${closeBraces} (Diff: ${openBraces - closeBraces})`);
console.log(`Parens: ( ${openParens}, ) ${closeParens} (Diff: ${openParens - closeParens})`);
console.log(`Brackets: [ ${openBrackets}, ] ${closeBrackets} (Diff: ${openBrackets - closeBrackets})`);