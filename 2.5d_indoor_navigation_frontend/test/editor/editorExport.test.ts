import { EditorExport } from '../../src/components/editor/editorExport';

describe('EditorExport', () => {
  describe('validateGeoJSON', () => {
    it('should accept valid FeatureCollection', () => {
      const valid = {
        type: 'FeatureCollection',
        features: [] as any[],
      };
      expect(EditorExport.validateGeoJSON(valid)).toBe(true);
    });

    it('should accept FeatureCollection with features', () => {
      const valid = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [0, 0] },
            properties: {},
          },
        ],
      };
      expect(EditorExport.validateGeoJSON(valid)).toBe(true);
    });

    it('should reject null', () => {
      expect(EditorExport.validateGeoJSON(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(EditorExport.validateGeoJSON(undefined)).toBe(false);
    });

    it('should reject wrong type', () => {
      expect(EditorExport.validateGeoJSON({ type: 'Feature', features: [] })).toBe(false);
    });

    it('should reject missing features array', () => {
      expect(EditorExport.validateGeoJSON({ type: 'FeatureCollection' })).toBe(false);
    });

    it('should reject non-array features', () => {
      expect(EditorExport.validateGeoJSON({ type: 'FeatureCollection', features: 'not-array' })).toBe(false);
    });

    it('should reject non-object input', () => {
      expect(EditorExport.validateGeoJSON('string')).toBe(false);
      expect(EditorExport.validateGeoJSON(42)).toBe(false);
      expect(EditorExport.validateGeoJSON(true)).toBe(false);
    });
  });

  describe('validateGraphJSON', () => {
    it('should accept valid graph', () => {
      const valid = {
        nodes: [{ id: 'n1', coordinates: [0, 0], level: 1, ref: null as string | null, type: 'corridor' }],
        edges: [{ id: 'e1', from: 'n1', to: 'n2', weight: 5, level: 1, videoClipId: null as string | null }],
      };
      expect(EditorExport.validateGraphJSON(valid)).toBe(true);
    });

    it('should accept empty graph', () => {
      expect(EditorExport.validateGraphJSON({ nodes: [], edges: [] })).toBe(true);
    });

    it('should reject null', () => {
      expect(EditorExport.validateGraphJSON(null)).toBe(false);
    });

    it('should reject missing nodes', () => {
      expect(EditorExport.validateGraphJSON({ edges: [] })).toBe(false);
    });

    it('should reject missing edges', () => {
      expect(EditorExport.validateGraphJSON({ nodes: [] })).toBe(false);
    });

    it('should reject non-array nodes', () => {
      expect(EditorExport.validateGraphJSON({ nodes: 'x', edges: [] })).toBe(false);
    });
  });

  // readJSONFile uses FileReader which is not available in Node.js/Jest
  // These tests are for browser E2E testing via /qa
});
