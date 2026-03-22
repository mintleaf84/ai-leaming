'use client';

import { useEffect, useState } from 'react';
import { animate } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  className?: string;
  suffix?: string;
  duration?: number;
}

export function AnimatedNumber({ value, className, suffix = '', duration = 1 }: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const controls = animate(0, value, {
      duration: duration,
      ease: "easeOut",
      onUpdate: (latest) => setDisplayValue(Math.round(latest))
    });

    return () => controls.stop();
  }, [value, duration]);

  return (
    <span className={className}>
      {displayValue}
      {suffix}
    </span>
  );
}
