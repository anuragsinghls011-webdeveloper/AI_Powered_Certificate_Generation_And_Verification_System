import { compactDesign, designDiff, designFingerprint, previewDesign } from './aiDesignUtils';
import { emptyTemplate, makeField } from '../constants';

const base = () => ({ ...emptyTemplate(), fields: [makeField('recipient_name',
  { id: 'recipient-1', x: 96, y: 170, width: 600, height: 48, fontSize: 32 })] });

test('compact context excludes images and organization data', () => {
  const tpl = base();
  tpl.organization_id = 'another-tenant';
  tpl.background_image = 'data:image/png;base64,private';
  expect(compactDesign(tpl).organization_id).toBeUndefined();
  expect(compactDesign(tpl).background_image).toBeUndefined();
});

test('validated operations create an editable draft without mutating the live design', () => {
  const tpl = base();
  const original = designFingerprint(tpl);
  const next = previewDesign(tpl, { intent: 'modify', template_changes: { primary_color: '#0f172a' },
    field_operations: [{ type: 'update_field', field_type: 'recipient_name',
      properties: { fontSize: 42, x: 96, y: 180, width: 600, height: 48 } },
    { type: 'add_field', field_type: 'certificate_qr', properties: { x: 645, y: 415, width: 80, height: 80 } }] });
  expect(tpl.fields).toHaveLength(1);
  expect(designFingerprint(tpl)).toBe(original);
  expect(next.fields).toHaveLength(2);
  expect(next.fields[0].fontSize).toBe(42);
  expect(designDiff(tpl, next).some(line => line.includes('recipient name'))).toBe(true);
});

test('invalid operation rejects atomically; stale changes alter the design fingerprint', () => {
  const tpl = base();
  expect(() => previewDesign(tpl, { intent: 'modify', template_changes: { primary_color: '#c2410c' },
    field_operations: [{ type: 'update_field', field_type: 'recipient_name', properties: { fontSize: 40 } },
      { type: 'add_field', field_type: 'hologram', properties: {} }] })).toThrow();
  expect(tpl.primary_color).toBe('#1e3a8a');
  expect(designFingerprint({ ...tpl, fields: [{ ...tpl.fields[0], x: 140 }] })).not.toBe(designFingerprint(tpl));
});