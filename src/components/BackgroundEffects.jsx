import { useEffect, useState } from 'react';

const matrixCharacters = '010101SPACEORBITNOVA';

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomText(length) {
  return Array.from({ length }, () => {
    const index = Math.floor(Math.random() * matrixCharacters.length);
    return `${matrixCharacters[index]} `;
  }).join('');
}

function createMatrixColumns() {
  const width = typeof window === 'undefined' ? 390 : window.innerWidth;
  const columns = Math.min(12, Math.max(6, Math.floor(width / 42)));

  return Array.from({ length: columns }, (_, index) => ({
    id: `matrix-${index}`,
    left: (index / columns) * 100,
    duration: randomBetween(16, 26),
    delay: randomBetween(0, 7),
    text: randomText(Math.floor(randomBetween(8, 16))),
  }));
}

function createParticles() {
  return Array.from({ length: 34 }, (_, index) => ({
    id: `particle-${index}`,
    left: randomBetween(0, 100),
    top: randomBetween(0, 100),
    delay: randomBetween(0, 20),
    duration: randomBetween(18, 34),
    scale: randomBetween(0.45, 1.2),
  }));
}

function createStreams() {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `stream-${index}`,
    top: randomBetween(2, 95),
    delay: randomBetween(0, 6),
    rotation: randomBetween(-18, 18),
  }));
}

function BackgroundEffects() {
  const [matrixColumns, setMatrixColumns] = useState(createMatrixColumns);
  const [particles] = useState(createParticles);
  const [streams] = useState(createStreams);

  useEffect(() => {
    let resizeTimer;

    const handleResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        setMatrixColumns(createMatrixColumns());
      }, 250);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="space-bg" aria-hidden="true">
      <div className="space-bg__planet" />
      <div className="space-bg__ring" />
      <div className="space-bg__matrix">
        {matrixColumns.map(column => (
          <div
            key={column.id}
            style={{
              left: `${column.left}%`,
              animationDuration: `${column.duration}s`,
              animationDelay: `${column.delay}s`,
            }}
          >
            {column.text}
          </div>
        ))}
      </div>
      <div className="space-bg__particles">
        {particles.map(particle => (
          <span
            key={particle.id}
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
              transform: `scale(${particle.scale})`,
            }}
          />
        ))}
      </div>
      <div className="space-bg__streams">
        {streams.map(stream => (
          <span
            key={stream.id}
            style={{
              top: `${stream.top}%`,
              rotate: `${stream.rotation}deg`,
              animationDelay: `${stream.delay}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default BackgroundEffects;
