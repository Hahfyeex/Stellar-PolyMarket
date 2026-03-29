import React, { useEffect, useState, useRef } from 'react';

interface CountUpProps {
  target: number;
  duration?: number;
  suffix?: string;
  className?: string;
}

/**
 * CountUp Component
 * Animates a number from 0 to target value using requestAnimationFrame and ease-out cubic.
 * Respects prefers-reduced-motion and triggers on viewport entry via IntersectionObserver.
 * Closes #604
 */
const CountUp: React.FC<CountUpProps> = ({
  target,
  duration = 1500,
  suffix = '',
  className = '',
}) => {
  const [count, setCount] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<HTMLSpanElement>(null);
  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);

  // Formatting large numbers with commas correctly
  const formatNumber = (num: number) => {
    return Math.floor(num).toLocaleString('en-US');
  };

  // Easing function: ease-out cubic (decelerates towards the end)
  const easeOutCubic = (t: number): number => {
    return 1 - Math.pow(1 - t, 3);
  };

  const animate = (time: number) => {
    if (startTimeRef.current === null) {
      startTimeRef.current = time;
    }
    const elapsed = time - startTimeRef.current;
    const progress = Math.min(elapsed / duration, 1);
    
    const easedProgress = easeOutCubic(progress);
    const nextCount = easedProgress * target;
    
    setCount(nextCount);

    if (progress < 1) {
      requestRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    // Trigger the animation when the component enters the viewport
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (elementRef.current) {
            observer.unobserve(elementRef.current);
          }
        }
      },
      { threshold: 0.1 }
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    // Respect prefers-reduced-motion: show final value immediately
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setCount(target);
      return;
    }

    requestRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isVisible, target, duration]);

  return (
    <span 
      ref={elementRef} 
      className={`inline-block font-mono ${className}`}
      role="status"
      aria-live="polite"
    >
      {formatNumber(count)}
      {suffix}
    </span>
  );
};

export default CountUp;
