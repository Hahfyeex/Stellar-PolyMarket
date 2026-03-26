# CopyButton Component

A reusable clipboard utility component for copying wallet addresses, transaction IDs, and other long strings to the clipboard. The component displays an abbreviated version of the text while copying the full value.

## Features

- **Clipboard API Integration**: Uses the modern `navigator.clipboard.writeText()` API for reliable copying
- **Graceful Fallback**: Falls back to `document.execCommand('copy')` for browsers that don't support the Clipboard API
- **Abbreviated Display**: Shows first 6 + last 4 characters (e.g., `GABCDE...WXYZ`) for long values
- **Visual Feedback**: Displays "Copied!" tooltip message for 2 seconds after successful copy
- **Keyboard Accessible**: Full keyboard support (Enter and Space keys trigger copy)
- **Screen Reader Support**: Proper ARIA labels and status announcements for assistive technologies
- **Error Handling**: Built-in error callbacks for failed copy operations
- **Customizable**: Accept custom labels, className, and success/error callbacks

## Installation

The component is already integrated into the project at:
```plaintext
frontend/src/components/CopyButton.tsx
```

## Usage

### Basic Usage

```tsx
import CopyButton from "@/components/CopyButton";

export default function MyComponent() {
  const walletAddress = "GABCDEF123456WXYZABCDEF123456WXYZ";
  
  return (
    <CopyButton value={walletAddress} />
  );
}
```

### With Custom Label

```tsx
<CopyButton 
  value="TXABCDEF123456WXYZABCDEF123456" 
  label="Copy Transaction ID"
/>
```

### With Callbacks

```tsx
<CopyButton 
  value={walletAddress}
  label="Copy Wallet Address"
  onCopySuccess={() => console.log("Copied!")}
  onCopyError={(error) => console.error("Copy failed:", error)}
/>
```

### With Custom Styling

```tsx
<CopyButton 
  value={walletAddress}
  className="my-custom-class"
/>
```

## Props

### `value` (required)
- **Type**: `string`
- **Description**: The full value to copy to clipboard
- **Example**: `"GABCDEF123456WXYZABCDEF"`

### `label` (optional)
- **Type**: `string`
- **Default**: `"Copy to clipboard"`
- **Description**: ARIA label for accessibility and tooltip text
- **Example**: `"Copy Wallet Address"`

### `className` (optional)
- **Type**: `string`
- **Default**: `undefined`
- **Description**: Additional CSS classes to apply to the button
- **Example**: `"mx-2 my-1"`

### `onCopySuccess` (optional)
- **Type**: `() => void`
- **Description**: Callback function called when copy succeeds
- **Example**: `() => showNotification("Copied!")`

### `onCopyError` (optional)
- **Type**: `(error: Error) => void`
- **Description**: Callback function called when copy fails
- **Example**: `(error) => showNotification("Failed to copy")`

## Display Format

The component automatically abbreviates values longer than 10 characters:

| Display | Abbreviation | Example |
|---------|--------------|---------|
| Full value (≤10 chars) | No abbreviation | `SHORTVAL` → `SHORTVAL` |
| Long value (>10 chars) | First 6 + Last 4 | `GABCDEF123456WXYZABCDEF` → `GABCDE...CDEF` |

## Styling

The button uses responsive Tailwind CSS classes:

```tsx
// Base styles
"px-2 py-1 rounded-lg text-sm font-mono text-blue-400"
"bg-blue-600/20 border border-blue-500/50"

// Hover state
"hover:bg-blue-600/30 hover:border-blue-500"

// Focus state (keyboard navigation)
"focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"

// Transitions
"transition-all duration-200"

// Tooltip fade-out animation
"opacity-100" → "opacity-0" (over 2 seconds)
```

### Customizing Styles

Override styles via the `className` prop:

```tsx
<CopyButton 
  value={address}
  className="bg-green-600/20 text-green-400 hover:bg-green-600/30"
/>
```

## Keyboard Support

- **Enter Key**: Triggers copy action
- **Space Key**: Triggers copy action (prevents page scroll)
- **Tab Key**: Button is focusable and included in natural tab order
- **Focus Ring**: Visible focus ring (blue ring-offset-gray-800) for keyboard users

## Accessibility (a11y)

- ✅ ARIA labels on button element
- ✅ Keyboard navigation support (Enter/Space)
- ✅ Focus ring visible for keyboard users
- ✅ Status announcement for screen readers ("Copied!" message with `role="status"` and `aria-live="polite"`)
- ✅ Icon has `aria-hidden="true"` to avoid duplicate announcements
- ✅ Title attribute shows full value on hover

## Behavior Timeline

1. **User clicks button** → Clipboard API/execCommand is called with full value
2. **Copy succeeds** → 
   - "Copied!" message appears immediately
   - Success callback (if provided) is invoked
3. **After 2 seconds** → 
   - "Copied!" message fades out (opacity-0 transition)
   - Copied state resets

## Error Handling

If copy fails (e.g., permission denied):

```tsx
<CopyButton 
  value={address}
  onCopyError={(error) => {
    console.error("Copy failed:", error.message);
    // Show user-friendly error message
  }}
/>
```

The "Copied!" message will NOT appear if the copy operation fails.

## Browser Support

### Clipboard API (Modern)
- Chrome 63+
- Firefox 63+
- Safari 13.1+
- Edge 79+

### Fallback (execCommand)
- IE 9+
- Opera 11.6+
- Older browser versions

The component automatically detects browser capabilities and uses the appropriate method.

## Testing

The component includes 39 comprehensive tests covering:

- ✅ Rendering with abbreviation
- ✅ Custom labels and className
- ✅ Copy functionality (Clipboard API and execCommand fallback)
- ✅ "Copied!" tooltip fade-out timing
- ✅ Keyboard accessibility (Enter/Space)
- ✅ Error handling and callbacks
- ✅ Screen reader accessibility
- ✅ Rapid click handling
- ✅ Timeout cleanup (preventing race conditions)
- ✅ Integration with wallet addresses and transaction IDs

**Test Coverage**: 97.05% statements, 96.42% branches, 100% functions

Run tests:
```bash
npm test -- --testPathPattern="CopyButton"
```

Run tests with coverage:
```bash
npm test -- --testPathPattern="CopyButton" --coverage
```

## Common Use Cases

### In a Transaction List

```tsx
<div className="flex items-center gap-2">
  <span className="text-sm text-gray-400">{transactionId}</span>
  <CopyButton 
    value={transactionId}
    label="Copy Transaction ID"
  />
</div>
```

### In a User Profile

```tsx
<div className="space-y-2">
  <p className="text-gray-300">Wallet Address</p>
  <div className="flex items-center gap-2">
    <code className="text-sm">{walletAddress}</code>
    <CopyButton 
      value={walletAddress}
      label="Copy Wallet Address"
    />
  </div>
</div>
```

### In a Modal or Dialog

```tsx
<Dialog open={true}>
  <div className="space-y-4">
    <h2>Share Your Address</h2>
    <div className="bg-gray-800 p-4 rounded">
      <div className="flex justify-between items-center">
        <code>{publicKey}</code>
        <CopyButton 
          value={publicKey}
          label="Copy Public Key"
          onCopySuccess={() => setShowCopyConfirm(true)}
        />
      </div>
    </div>
  </div>
</Dialog>
```

## Implementation Details

### Abbreviation Logic

```ts
function abbreviateValue(value: string): string {
  if (value.length <= 10) {
    return value; // Show full value if 10 chars or less
  }
  // Show first 6 chars + last 4 chars
  return value.slice(0, 6) + "..." + value.slice(-4);
}
```

### Clipboard Methods

```ts
// Method 1: Modern Clipboard API (preferred)
await navigator.clipboard.writeText(value);

// Method 2: Fallback using execCommand (for older browsers)
const textarea = document.createElement("textarea");
textarea.value = value;
document.body.appendChild(textarea);
textarea.select();
document.execCommand("copy");
document.body.removeChild(textarea);
```

## Related Components

- `Skeleton.tsx` - Loading skeleton for list items while data is loading
- `LiveActivityFeed.tsx` - Uses CopyButton for copying transaction hashes
- `Toast.tsx` - Can be used alongside CopyButton for success notifications

## Troubleshooting

### "Failed to copy" Error

**Cause**: Clipboard API not available and execCommand failed

**Solution**: 
- Check browser compatibility
- Ensure HTTPS (Clipboard API requires secure context)
- Verify user permissions (browsers may require user permission)

### Tooltip Doesn't Disappear

**Cause**: Component unmounted before timeout completes

**Solution**: The component cleans up timers in its useEffect cleanup function; ensure component isn't forcefully unmounted

### Abbreviation Looks Wrong

**Cause**: Test value doesn't align with expected output

**Solution**: Ensure test value is >10 characters. Format is always first 6 + last 4.

### Keyboard Doesn't Work

**Cause**: Button not focused

**Solution**: Ensure button is focusable in tab order; check for `pointer-events: none` or `visibility: hidden` in parent styles

## Future Enhancements

- [ ] Configurable abbreviation format (e.g., 4 + 4 for longer strings)
- [ ] Custom copy message (instead of "Copied!")
- [ ] Configurable tooltip duration
- [ ] Toast notification integration
- [ ] Copy to clipboard with custom format (JSON, formatted string, etc.)
- [ ] Haptic feedback support for mobile
- [ ] Animation customization

## License

Part of the Stellar PolyMarket project.
