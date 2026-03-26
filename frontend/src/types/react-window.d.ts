// Type declarations for react-window v1
// Needed because npm workspaces hoists react-window to the root node_modules
// but the frontend TypeScript compiler can't resolve @types from the root.
import { Component, CSSProperties } from "react";

export interface ListChildComponentProps<T = any> {
  index: number;
  style: CSSProperties;
  data: T;
  isScrolling?: boolean;
}

export interface ListOnItemsRenderedProps {
  overscanStartIndex: number;
  overscanStopIndex: number;
  visibleStartIndex: number;
  visibleStopIndex: number;
}

export interface FixedSizeListProps<T = any> {
  children: (props: ListChildComponentProps<T>) => React.ReactElement | null;
  height: number | string;
  itemCount: number;
  itemSize: number;
  width: number | string;
  className?: string;
  direction?: "horizontal" | "vertical";
  initialScrollOffset?: number;
  innerElementType?: React.ElementType;
  itemData?: T;
  itemKey?: (index: number, data: T) => string | number;
  layout?: "horizontal" | "vertical";
  onItemsRendered?: (props: ListOnItemsRenderedProps) => void;
  onScroll?: (props: { scrollDirection: string; scrollOffset: number; scrollUpdateWasRequested: boolean }) => void;
  outerElementType?: React.ElementType;
  overscanCount?: number;
  style?: CSSProperties;
  useIsScrolling?: boolean;
  [key: string]: any;
}

export class FixedSizeList<T = any> extends Component<FixedSizeListProps<T>> {
  scrollTo(scrollOffset: number): void;
  scrollToItem(index: number, align?: "auto" | "smart" | "center" | "end" | "start"): void;
  resetAfterIndex(index: number, shouldForceUpdate?: boolean): void;
}
