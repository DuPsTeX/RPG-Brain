// graph-view.js — Interaktive Graph-Visualisierung mit vis.js
// Zeigt Entity-Nodes nach Typ gefärbt, Beziehungen als Edges

const VIS_CDN = 'https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js';

export class GraphView {
  constructor(lightrag, registry, entityManager) {
    this.lightrag = lightrag;
    this.registry = registry;
    this.entityManager = entityManager;
    this.network = null;
    this.nodes = null;
    this.edges = null;
    this._visLoaded = false;
  }

  async _loadVisJs() {
    if (this._visLoaded) return true;
    if (window.vis?.Network) {
      this._visLoaded = true;
      return true;
    }

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = VIS_CDN;
      script.onload = () => {
        this._visLoaded = true;
        resolve(true);
      };
      script.onerror = () => {
        console.error('[GraphView] vis.js konnte nicht geladen werden');
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  async refresh() {
    const container = document.getElementById('graph-container');
    if (!container) return;

    const loaded = await this._loadVisJs();
    if (!loaded) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div>vis.js konnte nicht geladen werden</div></div>';
      return;
    }

    // Daten sammeln: lokale Entities + optional LightRAG Graph
    const { nodes, edges } = this._buildGraphData();

    if (nodes.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🕸️</div><div>Noch keine Entities im Graph</div></div>';
      this._renderLegend();
      return;
    }

    // vis.js DataSets
    this.nodes = new vis.DataSet(nodes);
    this.edges = new vis.DataSet(edges);

    const options = {
      nodes: {
        shape: 'dot',
        size: 20,
        font: {
          color: '#e5e7eb',
          size: 13,
          face: 'sans-serif',
        },
        borderWidth: 2,
        shadow: { enabled: true, size: 4, x: 0, y: 2 },
      },
      edges: {
        color: { color: '#4a4e69', highlight: '#4ecca3', hover: '#4ecca3' },
        width: 1.5,
        font: { color: '#8b8fa3', size: 10, strokeWidth: 0 },
        arrows: { to: { enabled: true, scaleFactor: 0.6 } },
        smooth: { type: 'continuous' },
      },
      physics: {
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -30,
          centralGravity: 0.005,
          springLength: 120,
          springConstant: 0.05,
          damping: 0.4,
        },
        stabilization: { iterations: 150 },
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        zoomView: true,
        dragView: true,
      },
      layout: { improvedLayout: true },
    };

    if (this.network) {
      this.network.setData({ nodes: this.nodes, edges: this.edges });
    } else {
      this.network = new vis.Network(container, { nodes: this.nodes, edges: this.edges }, options);

      // Click handler: Entity Details öffnen
      this.network.on('doubleClick', (params) => {
        if (params.nodes.length > 0) {
          const entityId = params.nodes[0];
          const entity = this.entityManager.getEntity(entityId);
          if (entity) {
            // Dispatch Custom Event für Dashboard
            document.dispatchEvent(new CustomEvent('graph-entity-click', { detail: { entityId } }));
          }
        }
      });
    }

    this._renderLegend();
  }

  _buildGraphData() {
    const filterType = document.getElementById('graph-filter-type')?.value || '';
    const allEntities = this.entityManager.getAllEntities();
    const nodes = [];
    const edges = [];
    const entityIds = new Set();

    for (const entity of allEntities) {
      if (filterType && entity.typeId !== filterType) continue;

      const type = this.registry.getType(entity.typeId);
      if (!type) continue;

      entityIds.add(entity.id);

      nodes.push({
        id: entity.id,
        label: entity.data?.name || '?',
        color: {
          background: type.color || '#4ecca3',
          border: type.color || '#4ecca3',
          highlight: { background: lighten(type.color || '#4ecca3'), border: '#fff' },
          hover: { background: lighten(type.color || '#4ecca3'), border: type.color || '#4ecca3' },
        },
        title: `${type.icon} ${type.name}: ${entity.data?.name || '?'}`,
        group: entity.typeId,
        font: { color: '#e5e7eb' },
      });
    }

    // Beziehungs-Edges aus beziehung-Entities
    const beziehungen = allEntities.filter(e => e.typeId === 'beziehung');
    for (const bz of beziehungen) {
      const von = bz.data?.person_a;
      const zu = bz.data?.person_b;
      if (!von || !zu) continue;

      // Finde Entity-IDs per Name
      const vonEntity = allEntities.find(e => e.data?.name === von);
      const zuEntity = allEntities.find(e => e.data?.name === zu);

      if (vonEntity && zuEntity && entityIds.has(vonEntity.id) && entityIds.has(zuEntity.id)) {
        edges.push({
          from: vonEntity.id,
          to: zuEntity.id,
          label: bz.data?.art || '',
          title: bz.data?.details || '',
        });
      }
    }

    // Relation-Felder als Edges
    for (const entity of allEntities) {
      if (!entityIds.has(entity.id)) continue;
      const type = this.registry.getType(entity.typeId);
      if (!type) continue;

      for (const field of type.fields) {
        if (field.type !== 'relation') continue;
        const relName = entity.data?.[field.key];
        if (!relName) continue;

        const target = allEntities.find(e => e.data?.name === relName);
        if (target && entityIds.has(target.id) && target.id !== entity.id) {
          edges.push({
            from: entity.id,
            to: target.id,
            label: field.label || field.key,
            dashes: true,
          });
        }
      }
    }

    return { nodes, edges };
  }

  _renderLegend() {
    const legend = document.getElementById('graph-legend');
    if (!legend) return;

    const types = this.registry.getAllTypes(true);
    legend.innerHTML = types.map(t => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${t.color}"></span>
        <span>${t.icon} ${esc(t.name)}</span>
      </div>
    `).join('');
  }

  fit() {
    this.network?.fit({ animation: true });
  }

  search(query) {
    if (!this.network || !this.nodes) return;
    if (!query) {
      // Alle Nodes zurücksetzen
      this.nodes.forEach(node => {
        this.nodes.update({ id: node.id, opacity: 1 });
      });
      return;
    }

    const q = query.toLowerCase();
    this.nodes.forEach(node => {
      const match = (node.label || '').toLowerCase().includes(q);
      this.nodes.update({ id: node.id, opacity: match ? 1 : 0.15 });
    });
  }
}

// --- Helpers ---

function lighten(hex) {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)})`;
  } catch {
    return hex;
  }
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
