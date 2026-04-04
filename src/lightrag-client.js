// lightrag-client.js — REST API Client für LightRAG Server

export class LightRAGClient {
  constructor(baseUrl = 'http://localhost:9621') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.connected = false;
    this.timeout = 10000;
  }

  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  async _fetch(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

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
    });
    return response.json();
  }

  /**
   * Graph-Daten abrufen (Nodes + Edges).
   * @returns {Promise<object>}
   */
  async getGraphData() {
    const response = await this._fetch('/graphs');
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
   * Graph-Statistiken abrufen.
   * @returns {Promise<object>}
   */
  async getGraphStats() {
    try {
      const data = await this.getGraphData();
      return {
        nodeCount: data.nodes?.length ?? 0,
        edgeCount: data.edges?.length ?? 0,
      };
    } catch {
      return { nodeCount: 0, edgeCount: 0 };
    }
  }
}
