/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface AuraParticle {
  id: number;
  size: number;
  left: number;
  top: number;
  targetX: number;
  targetY: number;
  duration: number;
}

interface Star {
  id: number;
  left: number;
  top: number;
  duration: number;
  delay: number;
}

export function CultivationBackground() {
  const [auraParticles, setAuraParticles] = useState<AuraParticle[]>([]);
  const [stars, setStars] = useState<Star[]>([]);

  // 在客户端挂载后生成随机数据，避免 SSR 不一致和纯洁性警告
  useEffect(() => {
    const aura = [...Array(6)].map((_, i) => ({
      id: i,
      size: Math.random() * 400 + 200,
      left: Math.random() * 100,
      top: Math.random() * 100,
      targetX: Math.random() * 100 - 50,
      targetY: Math.random() * 100 - 50,
      duration: Math.random() * 10 + 10,
    }));

    const s = [...Array(20)].map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      duration: Math.random() * 4 + 2,
      delay: Math.random() * 5,
    }));

    setAuraParticles(aura);
    setStars(s);
  }, []);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      {/* 渐变背景 */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.05)_0%,rgba(0,0,0,1)_80%)]" />

      {/* 飘动的灵气 */}
      {auraParticles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-emerald-500/10 blur-[100px]"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.left}%`,
            top: `${p.top}%`,
          }}
          animate={{
            x: [0, p.targetX, 0],
            y: [0, p.targetY, 0],
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}

      {/* 细微的星光点点 */}
      <div className="absolute inset-0 opacity-20">
        {stars.map((s) => (
          <motion.div
            key={`star-${s.id}`}
            className="absolute w-1 h-1 bg-white rounded-full"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
            }}
            animate={{
              opacity: [0.2, 0.8, 0.2],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: s.duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: s.delay,
            }}
          />
        ))}
      </div>

      {/* 底部雾气 */}
      <div className="absolute bottom-0 left-0 right-0 h-96 bg-gradient-to-t from-black to-transparent opacity-60" />
    </div>
  );
}
