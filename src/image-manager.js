// image-manager.js — Portrait-Upload und Verwaltung für RPG-Brain Entities
// Bilder werden als Base64-Data-URLs in Entity-Daten gespeichert

const MAX_SIZE_BYTES = 512000; // 500 KB
const MAX_DIMENSION = 256;     // px (Quadrat für Portraits)
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class ImageManager {
  /**
   * Zeigt einen File-Picker und gibt das Bild als Base64-Data-URL zurück.
   * Das Bild wird auf MAX_DIMENSION herunterskaliert und komprimiert.
   * @returns {Promise<string|null>} Base64 Data-URL oder null bei Abbruch/Fehler
   */
  async pickAndResize() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = ALLOWED_TYPES.map(t => t.replace('image/', '.')).join(',');

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);

        // Typ-Check
        if (!ALLOWED_TYPES.includes(file.type)) {
          alert(`Nicht unterstütztes Format: ${file.type}\nErlaubt: JPG, PNG, WebP`);
          return resolve(null);
        }

        // Größen-Check (vor Resize)
        if (file.size > MAX_SIZE_BYTES * 4) {
          alert(`Datei zu groß (${(file.size / 1024).toFixed(0)} KB).\nMaximal ${MAX_SIZE_BYTES * 4 / 1024} KB vor Kompression.`);
          return resolve(null);
        }

        try {
          const dataUrl = await this._resizeImage(file);
          resolve(dataUrl);
        } catch (err) {
          console.error('[RPG-Brain] Bild-Verarbeitung fehlgeschlagen:', err);
          alert('Bild konnte nicht verarbeitet werden.');
          resolve(null);
        }
      };

      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  /**
   * Bild auf MAX_DIMENSION herunterskalieren und als Data-URL zurückgeben.
   * @param {File} file
   * @returns {Promise<string>}
   */
  _resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let { width, height } = img;

            // Auf MAX_DIMENSION skalieren (Seitenverhältnis beibehalten)
            if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
              if (width > height) {
                height = Math.round(height * MAX_DIMENSION / width);
                width = MAX_DIMENSION;
              } else {
                width = Math.round(width * MAX_DIMENSION / height);
                height = MAX_DIMENSION;
              }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Als WebP komprimieren (Qualität 0.8), Fallback JPEG
            let dataUrl = canvas.toDataURL('image/webp', 0.8);
            if (!dataUrl.startsWith('data:image/webp')) {
              dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            }

            // Finale Größen-Prüfung
            const base64Length = dataUrl.length * 0.75; // Grobe Schätzung
            if (base64Length > MAX_SIZE_BYTES) {
              // Nochmal mit weniger Qualität
              dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            }

            resolve(dataUrl);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Portrait-Upload UI-Element rendern (für Entity-Forms).
   * @param {string} currentImage - Aktuelle Data-URL oder leer
   * @param {string} fieldKey - Feld-Key (z.B. 'portrait')
   * @returns {string} HTML
   */
  renderUploadField(currentImage, fieldKey = 'portrait') {
    const preview = currentImage
      ? `<img src="${currentImage}" class="rpg-brain-portrait-preview" alt="Portrait" />`
      : '<div class="rpg-brain-portrait-preview rpg-brain-portrait-placeholder">📷</div>';

    return `
      <div class="rpg-brain-portrait-field" data-field-key="${fieldKey}">
        <label class="rpg-brain-form-label">Portrait</label>
        <div class="rpg-brain-portrait-row">
          ${preview}
          <div class="rpg-brain-portrait-actions">
            <button type="button" class="rpg-brain-portrait-upload menu_button">📷 Bild hochladen</button>
            ${currentImage ? '<button type="button" class="rpg-brain-portrait-remove menu_button">🗑️ Entfernen</button>' : ''}
          </div>
        </div>
        <input type="hidden" name="${fieldKey}" value="${currentImage || ''}" />
        <small class="rpg-brain-hint">Max. 500 KB, JPG/PNG/WebP</small>
      </div>
    `;
  }
}

// Singleton exportieren
export const imageManager = new ImageManager();
