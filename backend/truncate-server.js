import fs from 'fs';
const content = fs.readFileSync('server.js', 'utf8');
const searchString = 'export default app;';
const index = content.lastIndexOf(searchString);
if (index !== -1) {
    const newContent = content.substring(0, index + searchString.length) + '\n';
    fs.writeFileSync('server.js', newContent);
    console.log('✅ server.js truncated successfully');
} else {
    console.log('❌ Could not find export default app;');
}
