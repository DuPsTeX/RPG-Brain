// lightrag-client.js — REST API Client für LightRAG Server

export class LightRAGClient {
  constructor(baseUrl = 'http://localhost:9621') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.connected = false;
    this.timeout = 10000;
    this.queryTimeout = 120000; // Queries brauchen länger (LLM-Keyword-Extraktion)
  }

  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  async _fetch(path, options = {}) {
    const timeout = options._timeout || this.timeout;
    delete options._timeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`LightRAG API ${response.status}: ${errorText.slice(0, 200)}`);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Prüft ob LightRAG Server erreichbar ist.
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      const response = await this._fetch('/health');
      const data = await response.json();
      this.connected = true;
      return { connected: true, data };
    } catch (err) {
      this.connected = false;
      console.warn('[RPG-Brain] LightRAG nicht erreichbar:', err.message);
      return { connected: false, error: err.message };
    }
  }

  /**
   * Text-Dokument in LightRAG einfügen (für Entity-Extraktion & Graph-Aufbau).
   * @param {string} text - Der einzufügende Text
   * @param {object} metadata - Optionale Metadaten
   * @returns {Promise<object>}
   */
  async insertDocument(text, metadata = {}) {
    const response = await this._fetch('/documents/text', {
      method: 'POST',
      body: JSON.stringify({ text, metadata }),
      _timeout: this.queryTimeout,
    });
    return response.json();
  }

  /**
   * LightRAG abfragen — Hybrid-Retrieval (Graph + Vector).
   * @param {string} queryText - Suchanfrage
   * @param {string} mode - Query-Modus: 'naive' | 'local' | 'global' | 'hybrid' | 'mix'
   * @returns {Promise<object>}
   */
  async query(queryText, mode = 'hybrid') {
    const response = await this._fetch('/query', {
      method: 'POST',
      body: JSON.stringify({ query: queryText, mode }),
      _timeout: this.queryTimeout,
    });
    return response.json();
  }

  /**
   * Graph-Daten für ein bestimmtes Label abrufen (Subgraph).
   * @param {string} label - Entity-Label
   * @param {number} maxDepth - Maximale Tiefe (default: 3)
   * @param {number} maxNodes - Maximale Nodes (default: 500)
   * @returns {Promise<object>}
   */
  async getGraphData(label, maxDepth = 3, maxNodes = 500) {
    const params = new URLSearchParams({
      label,
      max_depth: String(maxDepth),
      max_nodes: String(maxNodes),
    });
    const response = await this._fetch(`/graphs?${params}`);
    return response.json();
  }

  /**
   * Alle Graph-Labels abrufen.
   * @returns {Promise<Array<string>>}
   */
  async getGraphLabels() {
    const response = await this._fetch('/graph/label/list');
    return response.json();
  }

  /**
   * Beliebteste Labels (nach Vernetzung sortiert).
   * @param {number} limit - Max Anzahl (default: 50)
   * @returns {Promise<Array>}
   */
  async getPopularLabels(limit = 50) {
    const response = await this._fetch(`/graph/label/popular?limit=${limit}`);
    return response.json();
  }

  /**
   * Labels suchen (Fuzzy-Suche).
   * @param {string} query - Suchbegriff
   * @param {number} limit - Max Anzahl (default: 50)
   * @returns {Promise<Array>}
   */
  async searchLabels(query, limit = 50) {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const response = await this._fetch(`/graph/label/search?${params}`);
    return response.json();
  }

  /**
   * Dokument aus LightRAG löschen.
   * @param {string} docId - Dokument-ID
   * @returns {Promise<object>}
   */
  async deleteDocument(docId) {
    const response = await this._fetch(`/documents/${encodeURIComponent(docId)}`, {
      method: 'DELETE',
    });
    return response.json();
  }

  /**
   * Mehrere Texte auf einmal einfügen.
   * @param {string[]} texts - Array von Texten
   * @returns {Promise<object>}
   */
  async batchInsert(texts) {
    const response = await this._fetch('/documents/batch', {
      method: 'POST',
      body: JSON.stringify({ texts }),
    });
    return response.json();
  }

  /**
   * Graph-Statistiken abrufen (über Label-Liste).
   * @returns {Promise<object>}
   */
  async getGraphStats() {
    try {
      const labels = await this.getGraphLabels();
      const labelList = Array.isArray(labels) ? labels : (labels?.labels || []);
      return {
        nodeCount: labelList.length,
        edgeCount: 0, // Edges nur via Subgraph-Abfrage verfügbar
      };
    } catch {
      return { nodeCount: 0, edgeCount: 0 };
    }
  }
}
