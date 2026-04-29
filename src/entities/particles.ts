import { floaters, particles, simulationPerfConfig } from "../state";
import { acquireFloater, acquireParticle, releaseFloater, releaseParticle } from "../simulation/pools";
import { random } from "../simulation/random";

export function burst(x: number, y: number, color: string, count: number, speed: number): void {
  const available = simulationPerfConfig.budgets.maxParticles - particles.length;
  const budgetedCount = Math.max(0, Math.min(count, available));
  for (let i = 0; i < budgetedCount; i += 1) {
    const angle = random() * Math.PI * 2;
    const velocity = speed * (0.2 + random() * 0.8);
    const particle = acquireParticle();
    particle.x = x;
    particle.y = y;
    particle.vx = Math.cos(angle) * velocity;
    particle.vy = Math.sin(angle) * velocity;
    particle.size = random() * 3 + 1.5;
    particle.color = color;
    particle.life = random() * 0.45 + 0.32;
    particle.maxLife = 0.78;
    particle.behind = random() > 0.35;
  }
}

export function spark(x: number, y: number, color: string): void {
  const available = simulationPerfConfig.budgets.maxParticles - particles.length;
  const budgetedCount = Math.max(0, Math.min(5, available));
  for (let i = 0; i < budgetedCount; i += 1) {
    const angle = random() * Math.PI * 2;
    const velocity = 90 + random() * 140;
    const particle = acquireParticle();
    particle.x = x;
    particle.y = y;
    particle.vx = Math.cos(angle) * velocity;
    particle.vy = Math.sin(angle) * velocity;
    particle.size = random() * 2 + 0.8;
    particle.color = color;
    particle.life = 0.2 + random() * 0.18;
    particle.maxLife = 0.38;
    particle.behind = false;
  }
}

export function pulseText(
  x: number,
  y: number,
  text: string,
  color: string,
  damageText = false,
): void {
  if (floaters.length >= simulationPerfConfig.budgets.maxFloaters) return;
  if (damageText) {
    let activeDamageTexts = 0;
    for (const floater of floaters) {
      if (floater.damageText) activeDamageTexts += 1;
    }
    if (activeDamageTexts >= simulationPerfConfig.budgets.maxDamageTexts) return;
  }
  const floater = acquireFloater();
  floater.x = x;
  floater.y = y;
  floater.text = text;
  floater.color = color;
  floater.damageText = damageText;
  floater.life = 0.9;
  floater.maxLife = 0.9;
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
      releaseParticle(i);
    }
  }

  for (let i = floaters.length - 1; i >= 0; i -= 1) {
    const floater = floaters[i]!;
    floater.life -= dt;
    floater.y -= 34 * dt;
    if (floater.life <= 0) {
      releaseFloater(i);
    }
  }
}
