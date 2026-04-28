const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");

const hud = {
  wave: document.querySelector("#waveValue"),
  kills: document.querySelector("#killsValue"),
  target: document.querySelector("#targetValue"),
  score: document.querySelector("#scoreValue"),
  health: document.querySelector("#healthBar"),
  stats: {
    hull: document.querySelector("#statHull"),
    damage: document.querySelector("#statDamage"),
    fireRate: document.querySelector("#statFireRate"),
    volley: document.querySelector("#statVolley"),
    speed: document.querySelector("#statSpeed"),
    pierce: document.querySelector("#statPierce"),
    drones: document.querySelector("#statDrones"),
    shield: document.querySelector("#statShield"),
  },
  loadout: document.querySelector("#loadout"),
  startOverlay: document.querySelector("#startOverlay"),
  upgradeOverlay: document.querySelector("#upgradeOverlay"),
  pauseOverlay: document.querySelector("#pauseOverlay"),
  gameOverOverlay: document.querySelector("#gameOverOverlay"),
  upgradeTitle: document.querySelector("#upgradeTitle"),
  upgradeGrid: document.querySelector("#upgradeGrid"),
  controlButtons: [...document.querySelectorAll("[data-control-mode]")],
  finalScore: document.querySelector("#finalScore"),
  finalWave: document.querySelector("#finalWave"),
};

const keys = new Set();
const pointer = {
  x: 0,
  y: 0,
  inside: false,
};
const world = {
  width: 0,
  height: 0,
  dpr: 1,
  time: 0,
  shake: 0,
};

const state = {
  mode: "menu",
  wave: 1,
  score: 0,
  waveKills: 0,
  waveTarget: 0,
  spawnRemaining: 0,
  spawnTimer: 0,
  spawnGap: 0.7,
  waveDelay: 0,
  bestCombo: 0,
  controlMode: "keyboard",
};

const player = {
  x: 0,
  y: 0,
  radius: 18,
  hp: 100,
  maxHp: 100,
  speed: 265,
  damage: 24,
  fireRate: 3,
  bulletSpeed: 610,
  projectileCount: 1,
  pierce: 0,
  drones: 0,
  shield: 0,
  shieldMax: 0,
  shieldRegen: 0,
  invuln: 0,
  fireTimer: 0,
  droneTimer: 0,
  aimAngle: -Math.PI / 2,
  vx: 0,
  vy: 0,
};

const enemies = [];
const bullets = [];
const particles = [];
const floaters = [];
const stars = [];
const ownedUpgrades = new Map();
let nextEnemyId = 1;

const enemyTypes = [
  {
    id: "scout",
    score: 35,
    radius: 14,
    hp: 32,
    speed: 86,
    damage: 12,
    color: "#ff5a69",
    accent: "#ffd0d5",
    sides: 3,
  },
  {
    id: "hunter",
    score: 55,
    radius: 18,
    hp: 48,
    speed: 70,
    damage: 16,
    color: "#ffbf47",
    accent: "#fff0b8",
    sides: 4,
  },
  {
    id: "brute",
    score: 90,
    radius: 25,
    hp: 115,
    speed: 46,
    damage: 24,
    color: "#b973ff",
    accent: "#ead4ff",
    sides: 6,
  },
];

const upgradeTiers = [
  {
    id: "standard",
    short: "T1",
    name: "Standard",
    power: 1,
    color: "#39d9ff",
    glow: "rgba(57, 217, 255, 0.22)",
  },
  {
    id: "rare",
    short: "T2",
    name: "Rare",
    power: 1.45,
    color: "#72ffb1",
    glow: "rgba(114, 255, 177, 0.25)",
  },
  {
    id: "prototype",
    short: "T3",
    name: "Prototype",
    power: 2.05,
    color: "#ffbf47",
    glow: "rgba(255, 191, 71, 0.28)",
  },
  {
    id: "singularity",
    short: "T4",
    name: "Singularity",
    power: 2.8,
    color: "#ff5a69",
    glow: "rgba(255, 90, 105, 0.3)",
  },
];

const upgradePool = [
  {
    id: "twin-cannon",
    icon: "II",
    name: "Canon jumele",
    description: "Elargit les salves principales.",
    effect(tier) {
      return `+${projectileGain(tier)} projectile${projectileGain(tier) > 1 ? "s" : ""} par salve`;
    },
    apply(tier) {
      player.projectileCount += projectileGain(tier);
    },
  },
  {
    id: "plasma-core",
    icon: "Hz",
    name: "Coeur plasma",
    description: "Accorde le reacteur au rythme des canons.",
    effect(tier) {
      return `+${percent(0.22 * tier.power)} cadence`;
    },
    apply(tier) {
      player.fireRate *= 1 + 0.22 * tier.power;
    },
  },
  {
    id: "rail-slug",
    icon: "DMG",
    name: "Ogive railgun",
    description: "Charge les impacts avec une masse cinetique.",
    effect(tier) {
      return `+${percent(0.26 * tier.power)} degats, +${percent(0.055 * tier.power)} vitesse`;
    },
    apply(tier) {
      player.damage *= 1 + 0.26 * tier.power;
      player.bulletSpeed *= 1 + 0.055 * tier.power;
    },
  },
  {
    id: "ion-engine",
    icon: "SPD",
    name: "Moteurs ioniques",
    description: "Rend les corrections de trajectoire plus nerveuses.",
    effect(tier) {
      return `+${percent(0.13 * tier.power)} vitesse`;
    },
    apply(tier) {
      player.speed *= 1 + 0.13 * tier.power;
    },
  },
  {
    id: "kinetic-shield",
    icon: "SHD",
    name: "Ecran cinetique",
    description: "Ajoute une couche regenerante autour de la coque.",
    effect(tier) {
      return `+${Math.round(24 * tier.power)} bouclier, +${(2.4 * tier.power).toFixed(1)}/s regen`;
    },
    apply(tier) {
      const shieldGain = Math.round(24 * tier.power);
      player.shieldMax += shieldGain;
      player.shield = Math.min(player.shieldMax, player.shield + shieldGain);
      player.shieldRegen += 2.4 * tier.power;
    },
  },
  {
    id: "repair-bay",
    icon: "HP",
    name: "Baie de reparation",
    description: "Renforce la coque et injecte des nanoreparations.",
    effect(tier) {
      return `+${Math.round(20 * tier.power)} integrite max, +${Math.round(42 * tier.power)} soin`;
    },
    apply(tier) {
      player.maxHp += Math.round(20 * tier.power);
      player.hp = Math.min(player.maxHp, player.hp + Math.round(42 * tier.power));
    },
  },
  {
    id: "orbital-drone",
    icon: "O",
    name: "Drone orbital",
    description: "Deploie une tourelle autonome en orbite proche.",
    effect(tier) {
      return `+${droneGain(tier)} drone${droneGain(tier) > 1 ? "s" : ""} orbital${droneGain(tier) > 1 ? "s" : ""}`;
    },
    apply(tier) {
      player.drones += droneGain(tier);
    },
  },
  {
    id: "piercer",
    icon: ">>",
    name: "Munition perce-coque",
    description: "Permet aux tirs de traverser les blindages.",
    effect(tier) {
      return `+${pierceGain(tier)} penetration, +${percent(0.07 * tier.power)} degats`;
    },
    apply(tier) {
      player.pierce += pierceGain(tier);
      player.damage *= 1 + 0.07 * tier.power;
    },
  },
];

function resize() {
  world.dpr = Math.min(window.devicePixelRatio || 1, 2);
  world.width = window.innerWidth;
  world.height = window.innerHeight;
  canvas.width = Math.floor(world.width * world.dpr);
  canvas.height = Math.floor(world.height * world.dpr);
  canvas.style.width = `${world.width}px`;
  canvas.style.height = `${world.height}px`;
  ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);

  if (!player.x || !player.y) {
    player.x = world.width / 2;
    player.y = world.height / 2;
  }

  rebuildStars();
}

function rebuildStars() {
  stars.length = 0;
  const count = Math.floor((world.width * world.height) / 5200);
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: Math.random() * world.width,
      y: Math.random() * world.height,
      size: Math.random() * 1.8 + 0.35,
      depth: Math.random() * 0.75 + 0.25,
      twinkle: Math.random() * Math.PI * 2,
    });
  }
}

function resetGame() {
  state.mode = "playing";
  state.wave = 1;
  state.score = 0;
  state.waveKills = 0;
  state.bestCombo = 0;

  player.x = world.width / 2;
  player.y = world.height / 2;
  player.hp = 100;
  player.maxHp = 100;
  player.speed = 265;
  player.damage = 24;
  player.fireRate = 3;
  player.bulletSpeed = 610;
  player.projectileCount = 1;
  player.pierce = 0;
  player.drones = 0;
  player.shield = 0;
  player.shieldMax = 0;
  player.shieldRegen = 0;
  player.invuln = 1.2;
  player.fireTimer = 0;
  player.droneTimer = 0;
  player.vx = 0;
  player.vy = 0;
  ownedUpgrades.clear();
  nextEnemyId = 1;
  enemies.length = 0;
  bullets.length = 0;
  particles.length = 0;
  floaters.length = 0;

  hideOverlays();
  startWave(1);
  updateLoadout();
  updateHud();
}

function startWave(wave) {
  state.mode = "playing";
  state.wave = wave;
  state.waveKills = 0;
  state.waveTarget = Math.round(10 + wave * 4 + Math.pow(wave, 1.25));
  state.spawnRemaining = state.waveTarget;
  state.spawnGap = Math.max(0.18, 0.74 - wave * 0.04);
  state.spawnTimer = 0.7;
  state.waveDelay = 0;
  hideOverlays();
  updateHud();
}

function hideOverlays() {
  hud.startOverlay.classList.remove("active");
  hud.upgradeOverlay.classList.remove("active");
  hud.pauseOverlay.classList.remove("active");
  hud.gameOverOverlay.classList.remove("active");
}

function showUpgrade() {
  state.mode = "upgrade";
  hud.upgradeTitle.textContent = `Vague ${state.wave} neutralisee`;
  hud.upgradeGrid.innerHTML = "";

  const choices = pickUpgrades(3);
  for (const [index, choice] of choices.entries()) {
    const { upgrade, tier } = choice;
    const card = document.createElement("button");
    card.className = "upgrade-card";
    card.type = "button";
    card.dataset.choiceIndex = String(index + 1);
    card.dataset.tier = tier.id;
    card.style.setProperty("--tier-color", tier.color);
    card.style.setProperty("--tier-glow", tier.glow);
    card.innerHTML = `
      <span class="choice-key">${index + 1}</span>
      <span class="tier-badge">${tier.short} - ${tier.name}</span>
      <span class="upgrade-icon">${upgrade.icon}</span>
      <h3>${upgrade.name}</h3>
      <p>${upgrade.description}</p>
      <strong class="upgrade-effect">${upgrade.effect(tier)}</strong>
    `;
    card.addEventListener("click", () => applyUpgrade(choice));
    hud.upgradeGrid.appendChild(card);
  }

  hud.upgradeOverlay.classList.add("active");
  updateLoadout();
  requestAnimationFrame(() => hud.upgradeGrid.querySelector("button")?.focus());
}

function applyUpgrade(choice) {
  const { upgrade, tier } = choice;
  upgrade.apply(tier);

  const key = `${upgrade.id}:${tier.id}`;
  const owned = ownedUpgrades.get(key) || { upgrade, tier, count: 0 };
  owned.count += 1;
  ownedUpgrades.set(key, owned);

  pulseText(player.x, player.y - 42, `${upgrade.name} ${tier.short}`, tier.color);
  updateLoadout();
  startWave(state.wave + 1);
}

function showGameOver() {
  state.mode = "gameover";
  hud.finalScore.textContent = Math.floor(state.score).toLocaleString("fr-FR");
  hud.finalWave.textContent = state.wave;
  hud.gameOverOverlay.classList.add("active");
  requestAnimationFrame(() => document.querySelector("#restartButton")?.focus());
}

function pauseGame() {
  if (state.mode !== "playing") return;
  state.mode = "paused";
  player.vx = 0;
  player.vy = 0;
  hud.pauseOverlay.classList.add("active");
  requestAnimationFrame(() => document.querySelector("#resumeButton")?.focus());
}

function resumeGame() {
  if (state.mode !== "paused") return;
  state.mode = "playing";
  hud.pauseOverlay.classList.remove("active");
}

function setControlMode(mode) {
  if (!["keyboard", "trackpad"].includes(mode)) return;
  state.controlMode = mode;
  document.body.dataset.controlMode = mode;
  for (const button of hud.controlButtons) {
    const active = button.dataset.controlMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function pickUpgrades(count) {
  const weighted = [...upgradePool];
  if (player.drones >= 5) {
    removeById(weighted, "orbital-drone");
  }
  if (player.projectileCount >= 8) {
    removeById(weighted, "twin-cannon");
  }
  if (player.pierce >= 5) {
    removeById(weighted, "piercer");
  }

  shuffle(weighted);
  return weighted.slice(0, count).map((upgrade) => ({
    upgrade,
    tier: rollUpgradeTier(state.wave),
  }));
}

function removeById(list, id) {
  const index = list.findIndex((item) => item.id === id);
  if (index >= 0) {
    list.splice(index, 1);
  }
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}

function rollUpgradeTier(wave) {
  const weights = [
    { tier: upgradeTiers[0], weight: Math.max(42, 100 - wave * 5.5) },
    { tier: upgradeTiers[1], weight: 18 + wave * 2.8 },
    { tier: upgradeTiers[2], weight: wave >= 2 ? 3 + wave * 1.45 : 1 },
    { tier: upgradeTiers[3], weight: wave >= 5 ? wave * 0.75 : 0 },
  ];
  const total = weights.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;

  for (const item of weights) {
    roll -= item.weight;
    if (roll <= 0) return item.tier;
  }

  return upgradeTiers[0];
}

function projectileGain(tier) {
  return steppedGain(tier);
}

function droneGain(tier) {
  return tier.power >= 2 ? 2 : 1;
}

function pierceGain(tier) {
  return steppedGain(tier);
}

function steppedGain(tier) {
  if (tier.power >= 2.75) return 3;
  if (tier.power >= 1.4) return 2;
  return 1;
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function update(dt) {
  world.time += dt;
  world.shake = Math.max(0, world.shake - dt * 18);

  if (state.mode !== "playing") {
    updateParticles(dt);
    updateStars(dt);
    return;
  }

  updateStars(dt);
  updatePlayer(dt);
  updateWave(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateParticles(dt);
  updateHud();

  if (player.hp <= 0) {
    player.hp = 0;
    burst(player.x, player.y, "#39d9ff", 46, 280);
    world.shake = 22;
    showGameOver();
  }

  if (
    state.spawnRemaining <= 0 &&
    enemies.length === 0 &&
    state.mode === "playing"
  ) {
    state.waveDelay += dt;
    if (state.waveDelay > 1.1) {
      showUpgrade();
    }
  }
}

function updateStars(dt) {
  const driftX = -player.vx * 0.012;
  const driftY = -player.vy * 0.012 + 8;
  for (const star of stars) {
    star.twinkle += dt * (1.2 + star.depth);
    star.x += driftX * star.depth * dt * 60;
    star.y += driftY * star.depth * dt * 60;
    if (star.x < -4) star.x = world.width + 4;
    if (star.x > world.width + 4) star.x = -4;
    if (star.y < -4) star.y = world.height + 4;
    if (star.y > world.height + 4) star.y = -4;
  }
}

function updatePlayer(dt) {
  const keyX =
    Number(keys.has("ArrowRight") || keys.has("KeyD")) -
    Number(keys.has("ArrowLeft") || keys.has("KeyA"));
  const keyY =
    Number(keys.has("ArrowDown") || keys.has("KeyS")) -
    Number(keys.has("ArrowUp") || keys.has("KeyW"));
  const keyActive = keyX !== 0 || keyY !== 0;
  let inputX = keyX;
  let inputY = keyY;
  let speedScale = 1;

  if (!keyActive && state.controlMode === "trackpad" && pointer.inside) {
    const dx = pointer.x - player.x;
    const dy = pointer.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 14) {
      inputX = dx / dist;
      inputY = dy / dist;
      speedScale = clamp(dist / 210, 0.32, 1);
    }
  }

  const len = Math.hypot(inputX, inputY) || 1;
  const targetVx = (inputX / len) * player.speed * speedScale;
  const targetVy = (inputY / len) * player.speed * speedScale;
  const smoothing = 1 - Math.pow(0.0009, dt);
  player.vx += (targetVx - player.vx) * smoothing;
  player.vy += (targetVy - player.vy) * smoothing;
  player.x = clamp(
    player.x + player.vx * dt,
    player.radius + 8,
    world.width - player.radius - 8,
  );
  player.y = clamp(
    player.y + player.vy * dt,
    player.radius + 8,
    world.height - player.radius - 8,
  );

  player.invuln = Math.max(0, player.invuln - dt);
  if (player.shieldMax > 0) {
    player.shield = Math.min(player.shieldMax, player.shield + player.shieldRegen * dt);
  }

  const target = nearestEnemy(player.x, player.y);
  if (target) {
    player.aimAngle = Math.atan2(target.y - player.y, target.x - player.x);
  } else if (Math.hypot(player.vx, player.vy) > 20) {
    player.aimAngle = Math.atan2(player.vy, player.vx);
  }

  player.fireTimer -= dt;
  if (target && player.fireTimer <= 0) {
    fireVolley(player.x, player.y, player.aimAngle, false);
    player.fireTimer = 1 / player.fireRate;
  }

  if (player.drones > 0) {
    player.droneTimer -= dt;
    if (player.droneTimer <= 0) {
      fireDrones();
      player.droneTimer = Math.max(0.18, 0.72 - player.drones * 0.05);
    }
  }
}

function updateWave(dt) {
  state.spawnTimer -= dt;
  if (state.spawnRemaining > 0 && state.spawnTimer <= 0) {
    const pack = Math.min(
      state.spawnRemaining,
      Math.random() < Math.min(0.52, state.wave * 0.035) ? 2 : 1,
    );
    for (let i = 0; i < pack; i += 1) {
      spawnEnemy();
    }
    state.spawnRemaining -= pack;
    state.spawnTimer = state.spawnGap * (0.72 + Math.random() * 0.7);
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
    bullet.life -= dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.trail += dt;

    if (
      bullet.life <= 0 ||
      bullet.x < -80 ||
      bullet.x > world.width + 80 ||
      bullet.y < -80 ||
      bullet.y > world.height + 80
    ) {
      bullets.splice(i, 1);
      continue;
    }

    for (let e = enemies.length - 1; e >= 0; e -= 1) {
      const enemy = enemies[e];
      if (bullet.hitIds.has(enemy.id)) {
        continue;
      }
      if (circleHit(bullet, enemy)) {
        bullet.hitIds.add(enemy.id);
        enemy.hp -= bullet.damage;
        enemy.hit = 0.12;
        enemy.x += bullet.vx * 0.012;
        enemy.y += bullet.vy * 0.012;
        spark(bullet.x, bullet.y, bullet.color);
        if (enemy.hp <= 0) {
          killEnemy(e);
        }
        bullet.pierce -= 1;
        if (bullet.pierce < 0) {
          bullets.splice(i, 1);
        }
        break;
      }
    }
  }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    enemy.age += dt;
    enemy.hit = Math.max(0, enemy.hit - dt);

    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const wobble = Math.sin(enemy.age * enemy.wobbleRate + enemy.seed) * enemy.wobble;
    enemy.x += Math.cos(angle + wobble) * enemy.speed * dt;
    enemy.y += Math.sin(angle + wobble) * enemy.speed * dt;

    if (circleHit(enemy, player)) {
      damagePlayer(enemy.damage);
      burst(enemy.x, enemy.y, enemy.color, 16, 160);
      enemies.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
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
    const floater = floaters[i];
    floater.life -= dt;
    floater.y -= 34 * dt;
    if (floater.life <= 0) {
      floaters.splice(i, 1);
    }
  }
}

function fireVolley(x, y, angle, drone) {
  const count = drone ? 1 : player.projectileCount;
  const spread = drone ? 0 : Math.min(0.82, 0.13 * (count - 1));
  const start = angle - spread / 2;
  const step = count > 1 ? spread / (count - 1) : 0;

  for (let i = 0; i < count; i += 1) {
    const bulletAngle = start + step * i;
    const speed = drone ? player.bulletSpeed * 0.9 : player.bulletSpeed;
    bullets.push({
      x: x + Math.cos(bulletAngle) * 20,
      y: y + Math.sin(bulletAngle) * 20,
      vx: Math.cos(bulletAngle) * speed,
      vy: Math.sin(bulletAngle) * speed,
      radius: drone ? 4 : 5,
      damage: drone ? player.damage * 0.58 : player.damage,
      pierce: player.pierce,
      life: drone ? 0.9 : 1.15,
      color: drone ? "#ffbf47" : "#39d9ff",
      trail: 0,
      hitIds: new Set(),
    });
  }
}

function fireDrones() {
  if (!enemies.length) return;
  for (let i = 0; i < player.drones; i += 1) {
    const angle = world.time * 1.9 + (Math.PI * 2 * i) / player.drones;
    const x = player.x + Math.cos(angle) * 48;
    const y = player.y + Math.sin(angle) * 48;
    const target = nearestEnemy(x, y);
    if (target) {
      fireVolley(x, y, Math.atan2(target.y - y, target.x - x), true);
    }
  }
}

function spawnEnemy() {
  const type = chooseEnemyType();
  const side = Math.floor(Math.random() * 4);
  const pad = 70;
  let x = Math.random() * world.width;
  let y = Math.random() * world.height;

  if (side === 0) {
    x = -pad;
  } else if (side === 1) {
    x = world.width + pad;
  } else if (side === 2) {
    y = -pad;
  } else {
    y = world.height + pad;
  }

  const scale = 1 + state.wave * 0.055;
  enemies.push({
    ...type,
    id: nextEnemyId,
    kind: type.id,
    x,
    y,
    hp: type.hp * scale,
    maxHp: type.hp * scale,
    speed: type.speed * (1 + Math.min(0.32, state.wave * 0.018)),
    radius: type.radius,
    damage: type.damage,
    age: 0,
    seed: Math.random() * 100,
    wobble: type.id === "brute" ? 0.08 : 0.18,
    wobbleRate: 2 + Math.random() * 2,
    hit: 0,
  });
  nextEnemyId += 1;
}

function chooseEnemyType() {
  const roll = Math.random();
  const bruteChance = Math.min(0.25, Math.max(0, (state.wave - 3) * 0.035));
  const hunterChance = Math.min(0.38, state.wave * 0.045);
  if (roll < bruteChance) return enemyTypes[2];
  if (roll < bruteChance + hunterChance) return enemyTypes[1];
  return enemyTypes[0];
}

function killEnemy(index) {
  const enemy = enemies[index];
  enemies.splice(index, 1);
  state.waveKills += 1;
  state.score += Math.round(enemy.score * (1 + state.wave * 0.07));
  state.bestCombo += 1;
  burst(enemy.x, enemy.y, enemy.color, enemy.kind === "brute" ? 28 : 18, 220);
  pulseText(enemy.x, enemy.y - enemy.radius, `+${enemy.score}`, enemy.accent);
  world.shake = Math.min(10, world.shake + 2.4);
}

function damagePlayer(amount) {
  if (player.invuln > 0) return;

  let incoming = amount;
  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, incoming);
    player.shield -= absorbed;
    incoming -= absorbed;
  }

  if (incoming > 0) {
    player.hp -= incoming;
  }

  player.invuln = 0.34;
  world.shake = 14;
  pulseText(player.x, player.y - 38, `-${Math.round(amount)}`, "#ff5a69");
}

function render() {
  ctx.save();
  ctx.clearRect(0, 0, world.width, world.height);
  drawBackground();

  const shakeX = (Math.random() - 0.5) * world.shake;
  const shakeY = (Math.random() - 0.5) * world.shake;
  ctx.translate(shakeX, shakeY);

  drawParticles(true);
  drawTrackpadGuide();
  for (const bullet of bullets) drawBullet(bullet);
  for (const enemy of enemies) drawEnemy(enemy);
  drawDrones();
  drawPlayer();
  drawParticles(false);
  drawFloaters();
  ctx.restore();
}

function drawTrackpadGuide() {
  if (state.mode !== "playing" || state.controlMode !== "trackpad" || !pointer.inside) {
    return;
  }

  const distance = Math.hypot(pointer.x - player.x, pointer.y - player.y);
  if (distance < 18) return;

  ctx.save();
  ctx.globalAlpha = clamp(distance / 240, 0.16, 0.48);
  ctx.strokeStyle = "#72ffb1";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 12]);
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(pointer.x, pointer.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.72;
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, 12 + Math.sin(world.time * 8) * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, world.width, world.height);
  gradient.addColorStop(0, "#05060b");
  gradient.addColorStop(0.48, "#081017");
  gradient.addColorStop(1, "#110b12");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  drawNebula(world.width * 0.16, world.height * 0.22, Math.min(world.width, world.height) * 0.62, "rgba(57, 217, 255, 0.08)");
  drawNebula(world.width * 0.84, world.height * 0.72, Math.min(world.width, world.height) * 0.5, "rgba(255, 191, 71, 0.06)");
  ctx.restore();

  for (const star of stars) {
    const alpha = 0.38 + Math.sin(star.twinkle) * 0.18 + star.depth * 0.28;
    ctx.fillStyle = `rgba(226, 247, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size * star.depth, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#39d9ff";
  ctx.lineWidth = 1;
  const grid = 64;
  const offsetX = ((world.time * 8) % grid) - grid;
  const offsetY = ((world.time * 5) % grid) - grid;
  for (let x = offsetX; x < world.width + grid; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.height);
    ctx.stroke();
  }
  for (let y = offsetY; y < world.height + grid; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawNebula(x, y, radius, color) {
  const nebula = ctx.createRadialGradient(x, y, 0, x, y, radius);
  nebula.addColorStop(0, color);
  nebula.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = nebula;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.aimAngle + Math.PI / 2);

  if (player.shield > 1) {
    ctx.save();
    ctx.globalAlpha = 0.2 + (player.shield / Math.max(1, player.shieldMax)) * 0.24;
    ctx.strokeStyle = "#72ffb1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius + 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const engine = Math.min(1, Math.hypot(player.vx, player.vy) / player.speed);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const flame = ctx.createLinearGradient(0, 12, 0, 36 + engine * 16);
  flame.addColorStop(0, "rgba(57, 217, 255, 0.9)");
  flame.addColorStop(1, "rgba(255, 191, 71, 0)");
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(-6, 11);
  ctx.lineTo(0, 34 + engine * 18 + Math.sin(world.time * 34) * 3);
  ctx.lineTo(6, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = player.invuln > 0 && Math.sin(world.time * 42) > 0 ? "#ffffff" : "#d9f6ff";
  ctx.strokeStyle = "#39d9ff";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#39d9ff";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(15, 17);
  ctx.lineTo(5, 12);
  ctx.lineTo(0, 23);
  ctx.lineTo(-5, 12);
  ctx.lineTo(-15, 17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#05060b";
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(6, 7);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawDrones() {
  if (player.drones <= 0) return;
  for (let i = 0; i < player.drones; i += 1) {
    const angle = world.time * 1.9 + (Math.PI * 2 * i) / player.drones;
    const x = player.x + Math.cos(angle) * 48;
    const y = player.y + Math.sin(angle) * 48;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-angle);
    ctx.shadowColor = "#ffbf47";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ffbf47";
    ctx.strokeStyle = "#fff0b8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(-6, -6, 12, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawEnemy(enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(enemy.age * (enemy.kind === "brute" ? 0.7 : 1.6));
  ctx.shadowColor = enemy.color;
  ctx.shadowBlur = enemy.hit > 0 ? 25 : 10;
  ctx.fillStyle = enemy.hit > 0 ? enemy.accent : enemy.color;
  ctx.strokeStyle = enemy.accent;
  ctx.lineWidth = enemy.kind === "brute" ? 2.5 : 1.5;

  polygon(0, 0, enemy.radius, enemy.sides);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  const hpPct = clamp(enemy.hp / enemy.maxHp, 0, 1);
  if (hpPct < 0.98) {
    ctx.rotate(-enemy.age * (enemy.kind === "brute" ? 0.7 : 1.6));
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(-enemy.radius, enemy.radius + 9, enemy.radius * 2, 4);
    ctx.fillStyle = enemy.accent;
    ctx.fillRect(-enemy.radius, enemy.radius + 9, enemy.radius * 2 * hpPct, 4);
  }

  ctx.restore();
}

function drawBullet(bullet) {
  ctx.save();
  ctx.strokeStyle = bullet.color;
  ctx.fillStyle = bullet.color;
  ctx.shadowColor = bullet.color;
  ctx.shadowBlur = 14;
  ctx.lineWidth = bullet.radius;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bullet.x - bullet.vx * 0.022, bullet.y - bullet.vy * 0.022);
  ctx.lineTo(bullet.x, bullet.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, bullet.radius * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticles(behind) {
  for (const particle of particles) {
    if (particle.behind !== behind) continue;
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawFloaters() {
  ctx.save();
  ctx.font = "700 13px Share Tech Mono, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const floater of floaters) {
    const alpha = clamp(floater.life / floater.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = floater.color;
    ctx.shadowColor = floater.color;
    ctx.shadowBlur = 8;
    ctx.fillText(floater.text, floater.x, floater.y);
  }
  ctx.restore();
}

function polygon(x, y, radius, sides) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / sides;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function burst(x, y, color, count, speed) {
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

function spark(x, y, color) {
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

function pulseText(x, y, text, color) {
  floaters.push({
    x,
    y,
    text,
    color,
    life: 0.9,
    maxLife: 0.9,
  });
}

function nearestEnemy(x, y) {
  let nearest = null;
  let best = Infinity;
  for (const enemy of enemies) {
    const dist = distanceSq(x, y, enemy.x, enemy.y);
    if (dist < best) {
      best = dist;
      nearest = enemy;
    }
  }
  return nearest;
}

function updateHud() {
  hud.wave.textContent = state.wave;
  hud.kills.textContent = state.waveKills;
  hud.target.textContent = state.waveTarget;
  hud.score.textContent = Math.floor(state.score).toLocaleString("fr-FR");
  const hpPct = clamp(player.hp / player.maxHp, 0, 1);
  hud.health.style.width = `${hpPct * 100}%`;
  hud.health.style.background =
    hpPct > 0.38
      ? "linear-gradient(90deg, #72ffb1, #39d9ff)"
      : "linear-gradient(90deg, #ff5a69, #ffbf47)";
  updateStats();
}

function updateStats() {
  hud.stats.hull.textContent = `${Math.max(0, Math.ceil(player.hp))}/${Math.round(player.maxHp)}`;
  hud.stats.damage.textContent = Math.round(player.damage);
  hud.stats.fireRate.textContent = `${player.fireRate.toFixed(1)}/s`;
  hud.stats.volley.textContent = player.projectileCount;
  hud.stats.speed.textContent = Math.round(player.speed);
  hud.stats.pierce.textContent = player.pierce;
  hud.stats.drones.textContent = player.drones;
  hud.stats.shield.textContent =
    player.shieldMax > 0
      ? `${Math.max(0, Math.ceil(player.shield))}/${Math.round(player.shieldMax)}`
      : "0";
}

function updateLoadout() {
  hud.loadout.innerHTML = "";
  for (const owned of ownedUpgrades.values()) {
    const { upgrade, tier, count } = owned;
    const chip = document.createElement("span");
    chip.className = "loadout-chip";
    chip.dataset.tier = tier.id;
    chip.style.setProperty("--tier-color", tier.color);
    chip.textContent = `${upgrade.icon} ${tier.short} x${count}`;
    hud.loadout.appendChild(chip);
  }
}

function circleHit(a, b) {
  const radius = a.radius + b.radius;
  return distanceSq(a.x, a.y, b.x, b.y) <= radius * radius;
}

function distanceSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function choiceIndexFromKey(code) {
  if (code.startsWith("Digit")) return Number(code.slice(5));
  if (code.startsWith("Numpad")) return Number(code.slice(6));
  return 0;
}

function selectUpgradeByIndex(index) {
  if (state.mode !== "upgrade") return false;
  const card = hud.upgradeGrid.querySelector(`[data-choice-index="${index}"]`);
  if (!card) return false;
  card.click();
  return true;
}

function moveUpgradeFocus(direction) {
  const cards = [...hud.upgradeGrid.querySelectorAll(".upgrade-card")];
  if (!cards.length) return;

  const currentIndex = Math.max(0, cards.indexOf(document.activeElement));
  const nextIndex = (currentIndex + direction + cards.length) % cards.length;
  cards[nextIndex].focus();
}

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  const movementCodes = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "KeyW", "KeyA", "KeyS", "KeyD"];
  const movement = movementCodes.includes(event.code);
  const action = event.code === "Enter" || event.code === "Space";
  const pause = event.code === "Escape" || event.code === "KeyP";

  if (movement || action || pause) {
    event.preventDefault();
  }

  if (event.code === "KeyT") {
    setControlMode(state.controlMode === "keyboard" ? "trackpad" : "keyboard");
    return;
  }

  if (action && document.activeElement?.matches("[data-control-mode]")) {
    document.activeElement.click();
    return;
  }

  if (state.mode === "menu" && action) {
    resetGame();
    return;
  }

  if (state.mode === "gameover" && action) {
    resetGame();
    return;
  }

  if (state.mode === "paused" && (action || pause)) {
    resumeGame();
    return;
  }

  if (state.mode === "playing" && pause) {
    pauseGame();
    return;
  }

  if (state.mode === "upgrade") {
    const choiceIndex = choiceIndexFromKey(event.code);
    if (choiceIndex && selectUpgradeByIndex(choiceIndex)) {
      return;
    }

    if (event.code === "ArrowRight" || event.code === "ArrowDown") {
      moveUpgradeFocus(1);
      return;
    }

    if (event.code === "ArrowLeft" || event.code === "ArrowUp") {
      moveUpgradeFocus(-1);
      return;
    }

    if (action && document.activeElement?.classList.contains("upgrade-card")) {
      document.activeElement.click();
    }
    return;
  }

  if (state.mode === "playing" && movement) {
    setControlMode("keyboard");
    keys.add(event.code);
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

canvas.addEventListener("pointermove", (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.inside = true;
});

canvas.addEventListener("pointerenter", () => {
  pointer.inside = true;
});

canvas.addEventListener("pointerleave", () => {
  pointer.inside = false;
});

canvas.addEventListener("pointerdown", (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.inside = true;
  if (state.mode === "playing") {
    setControlMode("trackpad");
  }
});

document.querySelector("#startButton").addEventListener("click", resetGame);
document.querySelector("#restartButton").addEventListener("click", resetGame);
document.querySelector("#resumeButton").addEventListener("click", resumeGame);
for (const button of hud.controlButtons) {
  button.addEventListener("click", () => setControlMode(button.dataset.controlMode));
}

resize();
setControlMode("keyboard");
updateHud();
document.querySelector("#startButton")?.focus();
requestAnimationFrame(loop);
