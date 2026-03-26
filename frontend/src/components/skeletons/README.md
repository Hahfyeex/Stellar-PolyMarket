# Skeleton Loading States

A comprehensive skeleton loading system that replaces spinners with CSS shimmer animations. These layout-matching placeholders reduce Cumulative Layout Shift (CLS) and improve perceived performance.

## Overview

Instead of showing text like "Loading..." or a spinner, skeleton screens display placeholder elements that match the exact layout of the content they're loading. This creates a smooth, professional loading experience without visual jarring.

### Why Skeletons Instead of Spinners?

- **Zero CLS**: Placeholder dimensions match real content, preventing layout shifts
- **Perceived Performance**: Users feel like content is faster to load
- **Professional UX**: Modern apps (Twitter, LinkedIn, etc.) use skeletons
- **GPU-Accelerated**: CSS animations are smooth and performant on mobile

## Architecture

### Base Skeleton Component

The `Skeleton` component is the foundation for all skeleton screens. It provides:

```tsx
import Skeleton from "@/components/Skeleton";

// Basic usage
<Skeleton className="h-12 w-full mb-4" />

// Multiple skeletons
<Skeleton count={3} className="h-10 mb-2" />

// Custom element and gap
<Skeleton element="li" count={5} gap="1rem" className="h-16" />
```

### CSS Shimmer Animation

The shimmer effect is applied via the `.skeleton` CSS class in `globals.css`:

```css
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: calc(200% + 100px) 0;
  }
}

.skeleton {
  background-color: rgb(31, 41, 55); /* bg-gray-800 */
  background-image: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.1) 20%,
    rgba(255, 255, 255, 0.1) 60%,
    transparent
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 0.5rem;
}
```

**How it works:**
1. `background-size: 200%` makes the gradient twice the element width
2. `background-position` animates from left (-200%) to right (200%)
3. The gradient moves across, creating a flowing shimmer effect
4. `animation: shimmer 1.5s infinite` repeats smoothly
5. GPU-accelerated (uses `background-position`, not width/height)

## Skeleton Variants

### MarketCardSkeleton

Matches the layout of `MarketCard` component with:
- Multi-line title placeholder
- Status badge
- Pool info and end date
- Pool ownership chart area
- Outcome buttons
- Amount input field
- Message text area

```tsx
import MarketCardSkeleton from "@/components/skeletons/MarketCardSkeleton";

{loading ? (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {[1, 2, 3, 4].map(i => <MarketCardSkeleton key={i} />)}
  </div>
) : (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {markets.map(market => <MarketCard key={market.id} {...} />)}
  </div>
)}
```

### ActivityFeedSkeleton

Matches the layout of `LiveActivityFeed` with:
- Live indicator header
- Multiple activity rows
- Question, wallet, amount, and time placeholders
- Outcome badge

```tsx
import ActivityFeedSkeleton from "@/components/skeletons/ActivityFeedSkeleton";

{items.length === 0 && !error ? (
  <ActivityFeedSkeleton count={3} />
) : (
  <LiveActivityFeed {...props} />
)}
```

### MetricsSkeletons

Matches the layout of `LPMetricsOverview` with:
- 4-column grid layout
- Icon placeholder
- Label and value placeholders
- Subtext area

```tsx
import MetricsSkeletons from "@/components/skeletons/MetricsSkeletons";

{loading ? (
  <MetricsSkeletons />
) : (
  <LPMetricsOverview metrics={metrics} />
)}
```

## Creating New Skeleton Variants

When building a new skeleton for a component:

### 1. Analyze the Target Component Layout

Identify all text, images, and interactive elements. Note:
- Width and height constraints
- Spacing (margins, padding, gaps)
- Multi-line elements
- Icon dimensions

### 2. Create the Skeleton Component

```tsx
// src/components/skeletons/MyComponentSkeleton.tsx
import Skeleton from "../Skeleton";

export default function MyComponentSkeleton() {
  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      {/* Match exact layout of MyComponent */}
      <Skeleton className="h-6 w-40 mb-3" />
      <Skeleton className="h-12 w-full mb-2" />
      <div className="flex gap-2">
        <Skeleton className="flex-1 h-10" />
        <Skeleton className="w-20 h-10" />
      </div>
    </div>
  );
}
```

### 3. Use Exact Dimensions

Critical for preventing CLS:
- `h-*` and `w-*` must match target component
- Padding (`p-*`), margin (`m-*`), and gap must be identical
- Border radius and colors should match
- Use `min-height` on containers to reserve space

### 4. Add to Component's Loading State

```tsx
import MyComponentSkeleton from "@/components/skeletons/MyComponentSkeleton";

export default function MyComponent() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  return loading ? (
    <MyComponentSkeleton />
  ) : (
    <div>
      {/* Render real content */}
    </div>
  );
}
```

### 5. Test for CLS

In the browser:
1. Open DevTools → Lighthouse
2. Run Lighthouse audit focusing on CLS metric
3. Expect 0 or near-zero CLS
4. Compare skeleton vs. spinner impacts

## Best Practices

### ✅ Do

- **Match exact dimensions**: Use identical h/w values as the target
- **Reserve space**: Use `min-height` on containers to prevent jumping
- **Keep consistent timing**: All skeletons use 1.5s animation (configurable)
- **Test visually**: Compare side-by-side with real content
- **Document dimensions**: Comment on why specific heights are used

### ❌ Don't

- **Approximate dimensions**: Even 1px difference can cause CLS
- **Use spinners alongside**: Choose either skeleton OR spinner, not both
- **Animate height/width**: Only animate `background-position` (GPU-accelerated)
- **Forget mobile layouts**: Test responsive breakpoints (md:, lg:)
- **Hardcode colors**: Use Tailwind classes (bg-gray-800, etc.)

## Performance Characteristics

| Metric | Spinner | Skeleton |
|--------|---------|----------|
| CLS | High (layout shift) | 0 (exact match) |
| GPU Acceleration | Varies | Always (background-position) |
| Bundle Size | Small | Small (~1KB CSS) |
| Perceived Performance | Slower | Faster |
| Mobile Performance | Good | Better |

## Testing Skeletons

### Unit Tests (100% Coverage Required)

```tsx
import { render } from "@testing-library/react";
import MarketCardSkeleton from "@/components/skeletons/MarketCardSkeleton";

it("renders market card skeleton layout", () => {
  const { container } = render(<MarketCardSkeleton />);
  const skeletons = container.querySelectorAll(".skeleton");
  expect(skeletons.length).toBeGreaterThan(7); // Verify structure
});

it("has same styling as real MarketCard", () => {
  const { container } = render(<MarketCardSkeleton />);
  const wrapper = container.querySelector(".bg-gray-900");
  expect(wrapper).toHaveClass("rounded-xl", "p-5", "border");
});
```

### Visual/CLS Tests

1. **Lighthouse Audit**
   - Run Lighthouse with skeleton in place
   - Verify CLS score is 0 or near-zero
   - Compare against spinner baseline

2. **Manual Testing**
   - Load page with slow network (DevTools throttle)
   - Observe skeleton appearance
   - Verify no jumping when content loads
   - Test on iOS Safari and Android Chrome

3. **Responsive Testing**
   - Test on mobile (max-width: 768px)
   - Test on tablet (768px - 1024px)
   - Test on desktop (1024px+)
   - Verify grid layouts adapt correctly

## Browser Support

- Chrome/Edge: Full support (modern flexbox, CSS Grid)
- Firefox: Full support
- Safari: Full support (iOS 12+)
- Mobile browsers: Full support

## Examples

### Replace Spinner in Loading State

**Before:**
```tsx
{loading ? <p>Loading...</p> : <MarketCard {...} />}
```

**After:**
```tsx
{loading ? <MarketCardSkeleton /> : <MarketCard {...} />}
```

### Multiple Skeletons in Grid

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {loading
    ? [1, 2, 3, 4].map(i => <MarketCardSkeleton key={i} />)
    : markets.map(m => <MarketCard key={m.id} {...} />)
  }
</div>
```

### Activity Feed Loading

```tsx
{items.length === 0 && !error ? (
  <ActivityFeedSkeleton count={3} />
) : (
  <ul>
    {display.map(item => <ActivityRow key={item.id} {...} />)}
  </ul>
)}
```

## Troubleshooting

### CLS Still High?

- Verify skeleton dimensions exactly match real component
- Check for padding/margin mismatches
- Use `min-height` on parent containers
- Disable animations during test if needed

### Skeleton Looks Wrong?

- Compare color values (bg-gray-800 = rgb(31, 41, 55))
- Check border-radius matches (rounded-xl = 0.75rem)
- Verify responsive classes (md:, lg: breakpoints)
- Test in DevTools device toggle

### Animation Too Fast/Slow?

- 1.5s is the sweet spot (feels natural)
- To adjust globally: Edit `@keyframes shimmer` duration in `globals.css`
- CSS animations are preferred over JavaScript timers

## Support

For issues or improvements:
- Check existing skeleton variants in `/components/skeletons/`
- Review test coverage in `/components/__tests__/Skeleton.test.tsx`
- Run tests: `npm test -- --testPathPattern=Skeleton`
