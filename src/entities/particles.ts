import { floaters, particles } from "../state";

export function burst(x: number, y: number, color: string, count: number, speed: number): void {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (0.2 + Math.random() * 0.8);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      size: Math.random() * 3 + 1.5,
      color,
      life: Math.random() * 0.45 + 0.32,
      maxLife: 0.78,
      behind: Math.random() > 0.35,
    });
  }
}

export function spark(x: number, y: number, color: string): void {
  for (let i = 0; i < 5; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = 90 + Math.random() * 140;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      size: Math.random() * 2 + 0.8,
      color,
      life: 0.2 + Math.random() * 0.18,
      maxLife: 0.38,
      behind: false,
    });
  }
}

export function pulseText(x: number, y: number, text: string, color: string): void {
  floaters.push({
    x,
    y,
    text,
    color,
    life: 0.9,
    maxLife: 0.9,
  });
}

export function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i]!;
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 1 - dt * 1.8;
    particle.vy *= 1 - dt * 1.8;
    if (particle.life <= 0) {
      particles.splice(i, 1);
    }
  }

  for (let i = floaters.length - 1; i >= 0; i -= 1) {
    const floater = floaters[i]!;
    floater.life -= dt;
    floater.y -= 34 * dt;
    if (floater.life <= 0) {
      floaters.splice(i, 1);
    }
  }
}
