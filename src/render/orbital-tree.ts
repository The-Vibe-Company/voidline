import { findCharacter } from "../game/character-catalog";
import {
  canPurchaseShopItem,
  isShopItemRevealed,
} from "../game/shop-catalog";
import {
  ROUTES,
  ROUTE_BRIDGES,
  type RouteKey,
  type TreeNode,
  getAllTreeNodes,
} from "../game/upgrade-tree-routes";
import { accountProgress, purchaseShopItem } from "../systems/account";
import type { ShopItem, UnlockRequirement } from "../types";
import { renderCockpit } from "./cockpit";
import { setOverlayFocusScope } from "./hud";

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW_W = 800;
const VIEW_H = 500;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
const ORBIT_RADII = [70, 140, 210];
const KEYSTONE_RADIUS = ORBIT_RADII[1]!;
const OUTER_RADIUS = ORBIT_RADII[2]!;

interface NodeStateView {
  node: TreeNode;
  x: number;
  y: number;
  radius: number;
  state: "owned" | "available" | "locked";
}

let selectedNodeId: string | null = null;
let lastTriggerElement: HTMLElement | null = null;
let underlyingOverlay: HTMLElement | null = null;

const dom = {
  overlay: () => document.querySelector<HTMLElement>("#treeOverlay"),
  svg: () => document.querySelector<SVGSVGElement>("#orbitalSvg"),
  detail: () => document.querySelector<HTMLElement>("#treeDetail"),
  detailMeta: () => document.querySelector<HTMLElement>("[data-tree-detail-meta]"),
  detailTitle: () => document.querySelector<HTMLElement>("[data-tree-detail-title]"),
  detailDesc: () => document.querySelector<HTMLElement>("[data-tree-detail-desc]"),
  detailReq: () => document.querySelector<HTMLElement>("[data-tree-detail-req]"),
  detailCost: () => document.querySelector<HTMLElement>("[data-tree-detail-cost]"),
  detailBuy: () => document.querySelector<HTMLButtonElement>("[data-tree-detail-buy]"),
  closeButtons: () => document.querySelectorAll<HTMLButtonElement>("[data-close-tree]"),
};

export function bindTree(): void {
  for (const button of dom.closeButtons()) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      closeTreeOverlay();
    });
  }
  const buy = dom.detailBuy();
  if (buy) {
    buy.addEventListener("click", (event) => {
      event.preventDefault();
      if (!selectedNodeId) return;
      const result = purchaseShopItem(selectedNodeId as never);
      if (result.ok) {
        renderCockpit();
        renderOrbitalTree();
        updateDetailPanel();
      }
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const overlay = dom.overlay();
    if (overlay?.classList.contains("active")) {
      event.preventDefault();
      closeTreeOverlay();
    }
  });
}

export function openTreeOverlay(opener?: HTMLElement): void {
  const overlay = dom.overlay();
  if (!overlay) return;
  lastTriggerElement = opener ?? (document.activeElement as HTMLElement | null);
  underlyingOverlay = document.querySelector<HTMLElement>(
    ".overlay.active:not(#treeOverlay)",
  );
  underlyingOverlay?.classList.remove("active");
  overlay.classList.add("active");
  overlay.removeAttribute("aria-hidden");
  setOverlayFocusScope("treeOverlay");
  selectedNodeId = null;
  requestAnimationFrame(() => {
    renderOrbitalTree();
    updateDetailPanel();
    dom.closeButtons()[0]?.focus();
  });
}

export function closeTreeOverlay(): void {
  const overlay = dom.overlay();
  if (!overlay) return;
  overlay.classList.remove("active");
  overlay.setAttribute("aria-hidden", "true");
  if (underlyingOverlay) {
    underlyingOverlay.classList.add("active");
    setOverlayFocusScope(underlyingOverlay.id as never);
    underlyingOverlay = null;
  } else {
    setOverlayFocusScope();
  }
  lastTriggerElement?.focus?.();
  lastTriggerElement = null;
}

export function renderOrbitalTree(): void {
  const svg = dom.svg();
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  appendStarfield(svg);
  appendOrbitRings(svg);
  appendRouteAxes(svg);

  const nodeViews = computeNodeViews();
  appendBridges(svg, nodeViews);
  appendCore(svg);
  appendLinks(svg, nodeViews);
  appendNodes(svg, nodeViews);
}

function computeNodeViews(): Map<string, NodeStateView> {
  const map = new Map<string, NodeStateView>();
  for (const route of ROUTES) {
    const nodes = nodesForRouteWithBranches(route.key);
    for (const node of nodes) {
      const radius = node.orbit === 1 ? KEYSTONE_RADIUS : OUTER_RADIUS;
      const angleSpread = node.orbit === 1 ? 0 : (node.branchIndex - (node.branchCount - 1) / 2) * 0.32;
      const angle = route.angle + angleSpread;
      map.set(node.item.id, {
        node,
        x: CX + Math.cos(angle) * radius,
        y: CY + Math.sin(angle) * radius,
        radius: node.orbit === 1 ? 12 : 9,
        state: nodeState(node),
      });
    }
  }
  return map;
}

function nodesForRouteWithBranches(route: RouteKey): TreeNode[] {
  return getAllTreeNodes().filter((node) => node.route === route);
}

function nodeState(node: TreeNode): "owned" | "available" | "locked" {
  if (accountProgress.purchasedUnlockIds.includes(node.item.id)) return "owned";
  const purchase = canPurchaseShopItem(accountProgress, node.item);
  if (purchase.ok) return "available";
  if (purchase.reason === "locked") return "locked";
  return "available";
}

function appendStarfield(svg: SVGSVGElement): void {
  const group = createSvg("g", { opacity: "0.18" });
  for (const star of STARFIELD) {
    group.appendChild(
      createSvg("circle", {
        cx: star.x.toFixed(2),
        cy: star.y.toFixed(2),
        r: star.r.toFixed(2),
        fill: "var(--text)",
      }),
    );
  }
  svg.appendChild(group);
}

function appendOrbitRings(svg: SVGSVGElement): void {
  for (const radius of ORBIT_RADII) {
    svg.appendChild(
      createSvg("circle", {
        cx: String(CX),
        cy: String(CY),
        r: String(radius),
        fill: "none",
        stroke: "var(--line)",
        "stroke-width": "1",
        "stroke-dasharray": "3 5",
        opacity: "0.45",
      }),
    );
  }
}

function appendRouteAxes(svg: SVGSVGElement): void {
  for (const route of ROUTES) {
    const ax1 = CX + Math.cos(route.angle) * 26;
    const ay1 = CY + Math.sin(route.angle) * 26;
    const ax2 = CX + Math.cos(route.angle) * (OUTER_RADIUS + 30);
    const ay2 = CY + Math.sin(route.angle) * (OUTER_RADIUS + 30);
    svg.appendChild(
      createSvg("line", {
        x1: String(ax1),
        y1: String(ay1),
        x2: String(ax2),
        y2: String(ay2),
        stroke: "var(--line)",
        "stroke-width": "1",
        "stroke-dasharray": "2 6",
        opacity: "0.4",
      }),
    );
    const lx = CX + Math.cos(route.angle) * (OUTER_RADIUS + 50);
    const ly = CY + Math.sin(route.angle) * (OUTER_RADIUS + 50);
    const text = createSvg("text", {
      x: String(lx),
      y: String(ly + 4),
      "text-anchor": "middle",
      "font-family": "'Share Tech Mono', ui-monospace, monospace",
      "font-size": "13",
      "letter-spacing": "0.18em",
      fill: "var(--cyan)",
      opacity: "0.85",
    });
    text.textContent = route.label;
    svg.appendChild(text);
  }
}

function appendCore(svg: SVGSVGElement): void {
  const core = createSvg("g");
  core.appendChild(
    createSvg("circle", {
      cx: String(CX),
      cy: String(CY),
      r: "26",
      fill: "none",
      stroke: "var(--cyan)",
      "stroke-width": "1.4",
      "stroke-dasharray": "3 4",
      opacity: "0.7",
    }),
  );
  core.appendChild(
    createSvg("circle", {
      cx: String(CX),
      cy: String(CY),
      r: "18",
      fill: "var(--ink)",
      stroke: "var(--cyan)",
      "stroke-width": "1.2",
    }),
  );
  const character = findCharacter(accountProgress.selectedCharacterId);
  const label = createSvg("text", {
    x: String(CX),
    y: String(CY + 4),
    "text-anchor": "middle",
    "font-family": "'Share Tech Mono', ui-monospace, monospace",
    "font-size": "10",
    "letter-spacing": "0.18em",
    fill: "var(--cyan)",
  });
  label.textContent = character.icon;
  core.appendChild(label);
  svg.appendChild(core);
}

function appendLinks(svg: SVGSVGElement, views: Map<string, NodeStateView>): void {
  for (const route of ROUTES) {
    const nodes = nodesForRouteWithBranches(route.key);
    const keystone = nodes.find((n) => n.orbit === 1);
    if (!keystone) continue;
    const keystoneView = views.get(keystone.item.id);
    if (!keystoneView) continue;
    svg.appendChild(linkPath(CX, CY, keystoneView.x, keystoneView.y, false));
    for (const node of nodes) {
      if (node.orbit !== 2) continue;
      const view = views.get(node.item.id);
      if (!view) continue;
      const dashed = view.state === "locked";
      svg.appendChild(linkPath(keystoneView.x, keystoneView.y, view.x, view.y, dashed));
    }
  }
}

function appendBridges(svg: SVGSVGElement, views: Map<string, NodeStateView>): void {
  for (const [routeA, routeB] of ROUTE_BRIDGES) {
    const aNode = keystoneNode(routeA);
    const bNode = keystoneNode(routeB);
    if (!aNode || !bNode) continue;
    const aView = views.get(aNode.item.id);
    const bView = views.get(bNode.item.id);
    if (!aView || !bView) continue;
    svg.appendChild(
      createSvg("line", {
        x1: String(aView.x),
        y1: String(aView.y),
        x2: String(bView.x),
        y2: String(bView.y),
        stroke: "var(--cyan)",
        "stroke-width": "1.4",
        "stroke-dasharray": "6 4",
        opacity: "0.55",
      }),
    );
    const mx = (aView.x + bView.x) / 2;
    const my = (aView.y + bView.y) / 2;
    const ring = createSvg("circle", {
      cx: String(mx),
      cy: String(my),
      r: "10",
      fill: "var(--void-soft)",
      stroke: "var(--cyan)",
      "stroke-width": "1.6",
      "stroke-dasharray": "3 3",
    });
    svg.appendChild(ring);
    const glyph = createSvg("text", {
      x: String(mx),
      y: String(my + 3),
      "text-anchor": "middle",
      "font-family": "'Share Tech Mono', ui-monospace, monospace",
      "font-size": "10",
      fill: "var(--cyan)",
    });
    glyph.textContent = "↔";
    svg.appendChild(glyph);
  }
}

function keystoneNode(route: RouteKey): TreeNode | null {
  return nodesForRouteWithBranches(route).find((n) => n.orbit === 1) ?? null;
}

function appendNodes(svg: SVGSVGElement, views: Map<string, NodeStateView>): void {
  for (const view of views.values()) {
    const group = createSvg("g", {
      class: "tree-node",
      tabindex: "0",
      role: "button",
      "aria-label": view.node.item.name,
    }) as SVGGElement;
    if (view.node.item.id === selectedNodeId) {
      group.dataset.focused = "true";
    }
    if (view.state === "available") {
      group.appendChild(
        createSvg("circle", {
          cx: String(view.x),
          cy: String(view.y),
          r: String(view.radius + 6),
          fill: "none",
          stroke: "var(--amber)",
          "stroke-width": "2",
          "stroke-dasharray": "3 3",
          opacity: "0.9",
        }),
      );
    }
    const fill =
      view.state === "owned"
        ? "var(--mint)"
        : view.state === "available"
          ? "var(--void-soft)"
          : "var(--void)";
    const stroke =
      view.state === "owned"
        ? "var(--mint)"
        : view.state === "available"
          ? "var(--amber)"
          : "var(--line)";
    const main = createSvg("circle", {
      cx: String(view.x),
      cy: String(view.y),
      r: String(view.radius),
      fill,
      stroke,
      "stroke-width": view.node.orbit === 1 ? "2.4" : "1.8",
    });
    if (view.state === "locked") {
      main.setAttribute("stroke-dasharray", "3 4");
      main.setAttribute("opacity", "0.55");
    }
    group.appendChild(main);
    if (view.node.orbit === 1) {
      const label = createSvg("text", {
        x: String(view.x),
        y: String(view.y - view.radius - 8),
        "text-anchor": "middle",
        "font-family": "'Share Tech Mono', ui-monospace, monospace",
        "font-size": "9",
        "letter-spacing": "0.14em",
        fill: "var(--text)",
      });
      label.textContent = view.node.route.toUpperCase();
      group.appendChild(label);
    }
    group.addEventListener("click", () => selectNode(view.node.item.id));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectNode(view.node.item.id);
      }
    });
    svg.appendChild(group);
  }
}

function linkPath(x1: number, y1: number, x2: number, y2: number, dashed: boolean): SVGElement {
  return createSvg("line", {
    x1: String(x1),
    y1: String(y1),
    x2: String(x2),
    y2: String(y2),
    stroke: "var(--line)",
    "stroke-width": "1.4",
    "stroke-linecap": "round",
    ...(dashed ? { "stroke-dasharray": "4 5", opacity: "0.5" } : { opacity: "0.85" }),
  });
}

function selectNode(itemId: string): void {
  selectedNodeId = itemId;
  renderOrbitalTree();
  updateDetailPanel();
  const focused = document.querySelector<SVGGElement>(
    `.tree-node[data-focused="true"]`,
  );
  focused?.focus();
}

function updateDetailPanel(): void {
  const detail = dom.detail();
  if (!detail) return;
  if (!selectedNodeId) {
    detail.hidden = true;
    return;
  }
  const node = getAllTreeNodes().find((n) => n.item.id === selectedNodeId);
  if (!node) {
    detail.hidden = true;
    return;
  }
  detail.hidden = false;
  const meta = dom.detailMeta();
  const title = dom.detailTitle();
  const desc = dom.detailDesc();
  const req = dom.detailReq();
  const cost = dom.detailCost();
  const buy = dom.detailBuy();
  const item = node.item;
  if (meta) meta.textContent = `${node.route.toUpperCase()} · ORBIT ${node.orbit}`;
  if (title) title.textContent = item.name;
  if (desc) desc.textContent = item.description;
  if (req) req.innerHTML = formatRequirement(item);
  if (cost) cost.innerHTML = costLabel(item);
  if (buy) {
    const purchase = canPurchaseShopItem(accountProgress, item);
    const owned = accountProgress.purchasedUnlockIds.includes(item.id);
    if (owned) {
      buy.textContent = "Acquis";
      buy.disabled = true;
    } else if (!isShopItemRevealed(accountProgress, item)) {
      buy.textContent = "Verrouillé";
      buy.disabled = true;
    } else if (!purchase.ok) {
      buy.textContent = purchase.reason === "crystals" ? "Cristaux insuffisants" : "Indisponible";
      buy.disabled = true;
    } else {
      buy.textContent = "Acheter";
      buy.disabled = false;
    }
  }
}

function formatRequirement(item: ShopItem): string {
  const owned = accountProgress.purchasedUnlockIds.includes(item.id);
  if (owned) return "Acheté · effet permanent.";
  if (!isShopItemRevealed(accountProgress, item)) {
    return `Requiert : <b>${requirementText(item.requirement)}</b>`;
  }
  return `Tags : ${item.tags.map((tag) => `<b>${tag}</b>`).join(" · ")}`;
}

function requirementText(requirement: UnlockRequirement): string {
  switch (requirement) {
    case "available":
      return "disponible";
    case "reach-10m":
      return "atteindre 10:00";
    case "clear-stage-1":
      return "battre le boss N1";
    case "reach-stage-2":
      return "débloquer le départ N2";
    case "boss-kill":
      return "battre un boss";
  }
}

function costLabel(item: ShopItem): string {
  const owned = accountProgress.purchasedUnlockIds.includes(item.id);
  if (owned) return "✓ acquis";
  return `<span aria-hidden="true">◆</span> ${formatNumber(item.cost)}¢`;
}

function formatNumber(value: number): string {
  return Math.floor(value).toLocaleString("fr-FR");
}

function createSvg(tag: string, attrs: Record<string, string> = {}): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value);
  }
  return element;
}

const STARFIELD: ReadonlyArray<{ x: number; y: number; r: number }> = (() => {
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: 60 }, () => ({
    x: rand() * VIEW_W,
    y: rand() * VIEW_H,
    r: rand() * 0.9 + 0.3,
  }));
})();
