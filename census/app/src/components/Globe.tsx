'use client';

import { useEffect, useRef } from 'react';
import createGlobe from 'cobe';

interface Marker {
  location: [number, number]; // [lat, lng]
  size: number;
}

interface GlobeProps {
  markers?: Marker[];
  className?: string;
}

export function Globe({ markers = [], className = '' }: GlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(0);

  useEffect(() => {
    let phi = 0;
    let width = 0;
    const onResize = () => {
      if (canvasRef.current) {
        width = canvasRef.current.offsetWidth;
      }
    };
    window.addEventListener('resize', onResize);
    onResize();

    if (!canvasRef.current) return;

    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.3,
      dark: 0, // Light mode (white ocean)
      diffuse: 1.2,
      mapSamples: 20000, // Higher density = sharper dots
      mapBrightness: 12, // Lower = darker dots
      baseColor: [1, 1, 1], // Pure white ocean
      markerColor: [0.1, 0.1, 0.1], // Almost black markers (high contrast)
      glowColor: [1, 1, 1], // White glow
      opacity: 0.8,
      scale: 1,
      markers: markers.map(m => ({
        location: m.location,
        size: m.size || 0.03,
      })),
      onRender: (state) => {
        // Auto-rotate
        state.phi = phi;
        phi += 0.003;
        phiRef.current = phi;

        state.width = width * 2;
        state.height = width * 2;
      },
    });

    setTimeout(() => {
      if (canvasRef.current) {
        canvasRef.current.style.opacity = '1';
      }
    }, 100);

    return () => {
      globe.destroy();
      window.removeEventListener('resize', onResize);
    };
  }, [markers]);

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full opacity-0 transition-opacity duration-500"
        style={{
          width: '100%',
          height: '100%',
          aspectRatio: '1',
          contain: 'layout paint size',
        }}
      />
    </div>
  );
}
