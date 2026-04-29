export interface SimulationEvents {
  hud: boolean;
  loadout: boolean;
  upgrade: boolean;
  gameOver: boolean;
}

const pending: SimulationEvents = {
  hud: false,
  loadout: false,
  upgrade: false,
  gameOver: false,
};

export function markHudDirty(): void {
  pending.hud = true;
}

export function markLoadoutDirty(): void {
  pending.loadout = true;
  pending.hud = true;
}

export function markUpgradeReady(): void {
  pending.upgrade = true;
  pending.hud = true;
}

export function markGameOver(): void {
  pending.gameOver = true;
  pending.hud = true;
}

export function consumeSimulationEvents(): SimulationEvents {
  const events = { ...pending };
  pending.hud = false;
  pending.loadout = false;
  pending.upgrade = false;
  pending.gameOver = false;
  return events;
}

export function clearSimulationEvents(): void {
  consumeSimulationEvents();
}
