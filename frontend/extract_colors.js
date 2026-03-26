const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else if(file.endsWith('.tsx') || file.endsWith('.ts')) { 
            results.push(file);
        }
    });
    return results;
}

const files = walk('src');
const colorRegex = /\b(?:bg|text|border|ring|from|to|via)-(?:gray|blue|purple|green|red|yellow|orange|white|black|transparent)[-\w\d]*\b/g;

let allMatches = new Set();
files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(colorRegex);
    if (matches) {
        matches.forEach(m => allMatches.add(m));
    }
});
console.log(Array.from(allMatches).sort().join('\n'));
