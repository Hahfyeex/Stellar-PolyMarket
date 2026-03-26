const fs = require('fs');
const path = require('path');

const TW_TO_VAR = {
  // Backgrounds
  'bg-gray-950': 'bg-background',
  'bg-gray-900': 'bg-surface',
  'bg-gray-850': 'bg-surface',
  'bg-gray-800': 'bg-surface-elevated',
  'bg-gray-700': 'bg-surface-hover',
  'bg-gray-600': 'bg-surface-active',
  'bg-blue-600': 'bg-primary',
  'bg-blue-700': 'bg-primary-hover',
  'bg-blue-500': 'bg-primary-light',
  'bg-black': 'bg-background',
  'bg-white': 'bg-white',

  // Text
  'text-white': 'text-foreground',
  'text-gray-200': 'text-foreground-muted',
  'text-gray-300': 'text-muted-foreground',
  'text-gray-400': 'text-muted',
  'text-gray-500': 'text-muted-subtle',
  'text-gray-600': 'text-subtle',
  'text-blue-400': 'text-primary',
  'text-blue-300': 'text-primary-light',
  'text-blue-100': 'text-primary-lighter',

  // Borders
  'border-gray-800': 'border-border',
  'border-gray-700': 'border-border-hover',
  'border-gray-600': 'border-border-active',
  'border-blue-500': 'border-primary',
  'border-blue-400': 'border-primary-light',

  // Rings
  'ring-blue-500': 'ring-primary',

  // Gradients (from-, to-, via-)
  'from-gray-900': 'from-surface',
  'from-gray-800': 'from-surface-elevated',
  'to-gray-800': 'to-surface-elevated',
  'to-gray-900': 'to-surface',
  
  // Custom semantic mappings for rest
};

// Instead of string replacement which is risky, we will map ALL used tailwind colors to CSS variables in the theme!
// We'll generate globals.css with light and dark mode for default tailwind palette

const colors = ['gray', 'blue', 'green', 'red', 'purple', 'yellow', 'orange'];
const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '850', '900', '950'];

// Read globals.css
const globalsPath = path.join(__dirname, 'src', 'app', 'globals.css');
let globalsContent = fs.readFileSync(globalsPath, 'utf8');

const tailwindColorsHex = {
  gray: { 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 850: '#171e2e', 900: '#111827', 950: '#030712' },
  blue: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554' },
  green: { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d', 950: '#052e16' },
  red: { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d', 950: '#450a0a' },
  purple: { 50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8', 900: '#581c87', 950: '#3b0764' },
  yellow: { 50: '#fefce8', 100: '#fef9c3', 200: '#fef08a', 300: '#fde047', 400: '#facc15', 500: '#eab308', 600: '#ca8a04', 700: '#a16207', 800: '#854d0e', 900: '#713f12', 950: '#422006' },
  orange: { 50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412', 900: '#7c2d12', 950: '#431407' }
};

let rootVars = `\n/* Color Tokens mapped to CSS variables */\n:root {\n`;
let lightVars = `\n[data-theme='light'] {\n`; // the app default is dark, so light mode must reverse 'gray' and adapt others

for (const c of colors) {
  for (const s of shades) {
    if (tailwindColorsHex[c][s]) {
      rootVars += `  --color-${c}-${s}: ${tailwindColorsHex[c][s]};\n`;
      
      // For light mode, we invert the gray scale and let primary colors pop
      if (c === 'gray') {
        // Reverse shade
        const revS = shades[shades.length - 1 - shades.indexOf(s)];
        lightVars += `  --color-${c}-${s}: ${tailwindColorsHex[c][revS] || tailwindColorsHex[c]['500']};\n`;
      } else {
        // Maintain standard primary hues but adjust them slightly darker for readable contrast on white backgrounds
        // or just use standard
        lightVars += `  --color-${c}-${s}: ${tailwindColorsHex[c][s]};\n`;
      }
    }
  }
}
rootVars += `  --color-black: #000000;\n  --color-white: #ffffff;\n  --color-transparent: transparent;\n`;
lightVars += `  --color-black: #ffffff;\n  --color-white: #000000;\n`;

// Additional mapping for standard bg-gray-950 to be light in light mode
rootVars += `}\n`;
lightVars += `}\n`;

if (!globalsContent.includes(':root {')) {
  // Inject tokens
  globalsContent = globalsContent.replace('body {', `${rootVars}${lightVars}\nbody {`);
  globalsContent = globalsContent.replace('background-color: #030712;', 'background-color: var(--color-gray-950);');
  globalsContent = globalsContent.replace('color: white;', 'color: var(--color-white);');
  
  fs.writeFileSync(globalsPath, globalsContent);
}

// Generate tailwind.config.js
const twConfigPath = path.join(__dirname, 'tailwind.config.js');
let twConfigContext = `
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        black: 'var(--color-black)',
        white: 'var(--color-white)',
        transparent: 'var(--color-transparent)',
`;
for (const c of colors) {
  twConfigContext += `        ${c}: {\n`;
  for (const s of shades) {
    if (tailwindColorsHex[c][s]) {
      twConfigContext += `          ${s}: 'var(--color-${c}-${s})',\n`;
    }
  }
  twConfigContext += `        },\n`;
}
twConfigContext += `
      },
      spacing: {
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-left": "env(safe-area-inset-left)",
        "safe-right": "env(safe-area-inset-right)",
      },
    },
  },
  plugins: [],
};
`;

fs.writeFileSync(twConfigPath, twConfigContext);
console.log('Successfully refactored colors config');
