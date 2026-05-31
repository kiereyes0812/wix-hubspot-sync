import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save, RefreshCw, Info, ChevronDown } from 'lucide-react';
import api from '../utils/api';

type SyncDirection = 'wix_to_hubspot' | 'hubspot_to_wix' | 'bidirectional';
type Transform = 'none' | 'trim' | 'lowercase' | 'uppercase';

interface MappingRow {
  id: string;
  wix_field: string;
  hubspot_property: string;
  sync_direction: SyncDirection;
  transform: Transform;
}

const DIRECTION_LABELS: Record<SyncDirection, string> = {
  wix_to_hubspot: 'Wix → HubSpot',
  hubspot_to_wix: 'HubSpot → Wix',
  bidirectional: '↔ Bidirectional',
};

const TRANSFORM_LABELS: Record<Transform, string> = {
  none: 'No transform',
  trim: 'Trim whitespace',
  lowercase: 'Lowercase',
  uppercase: 'Uppercase',
};

export default function FieldMapping() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: wixFields } = useQuery({
    queryKey: ['wix-fields'],
    queryFn: () => api.get('/mapping/wix-fields').then(r => r.data.fields),
  });

  const { data: hubspotProps } = useQuery({
    queryKey: ['hubspot-properties'],
    queryFn: () => api.get('/mapping/hubspot-properties').then(r => r.data.properties),
  });

  const { data: savedMappings, isLoading } = useQuery({
    queryKey: ['field-mappings'],
    queryFn: () => api.get('/mapping').then(r => r.data.mappings),
  });

  useEffect(() => {
    if (savedMappings) {
      setRows(savedMappings.map((m: any) => ({
        id: m.id,
        wix_field: m.wix_field,
        hubspot_property: m.hubspot_property,
        sync_direction: m.sync_direction,
        transform: m.transform || 'none',
      })));
      setIsDirty(false);
    }
  }, [savedMappings]);

  const saveMutation = useMutation({
    mutationFn: (mappings: MappingRow[]) =>
      api.put('/mapping', { mappings }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-mappings'] });
      setIsDirty(false);
      setError(null);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Save failed');
    },
  });

  function addRow() {
    setRows(prev => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        wix_field: wixFields?.[0]?.name || '',
        hubspot_property: hubspotProps?.[0]?.name || '',
        sync_direction: 'bidirectional',
        transform: 'none',
      },
    ]);
    setIsDirty(true);
  }

  function removeRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
    setIsDirty(true);
  }

  function updateRow(id: string, field: keyof MappingRow, value: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    setIsDirty(true);
  }

  function handleSave() {
    // Validate
    const hubspotSeen = new Map<string, SyncDirection>();
    for (const row of rows) {
      const key = row.hubspot_property;
      if (hubspotSeen.has(key)) {
        const prev = hubspotSeen.get(key)!;
        if (row.sync_direction === prev || row.sync_direction === 'bidirectional' || prev === 'bidirectional') {
          setError(`Duplicate HubSpot property: ${row.hubspot_property}`);
          return;
        }
      }
      hubspotSeen.set(key, row.sync_direction);
    }
    saveMutation.mutate(rows);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw size={20} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Field Mapping</h1>
          <p className="text-zinc-500 mt-1">
            Map Wix contact fields to HubSpot properties. Changes take effect immediately after saving.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md">Unsaved changes</span>}
          <button className="btn-primary" onClick={handleSave} disabled={saveMutation.isPending || !isDirty}>
            {saveMutation.isPending
              ? <RefreshCw size={13} className="animate-spin" />
              : <Save size={13} />}
            Save Mapping
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <Info size={14} />
          {error}
        </div>
      )}

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800">
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <p>
          Each row maps one Wix field to one HubSpot property. The same HubSpot property cannot be mapped twice in the same direction.
          Transforms apply when writing the value to the target.
        </p>
      </div>

      {/* Mapping Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Wix Field</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">HubSpot Property</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Sync Direction</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Transform</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-zinc-400">
                    No field mappings yet. Add your first mapping below.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-4 py-3">
                    <SelectField
                      value={row.wix_field}
                      onChange={(v) => updateRow(row.id, 'wix_field', v)}
                      options={(wixFields || []).map((f: any) => ({ value: f.name, label: f.label }))}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <SelectField
                      value={row.hubspot_property}
                      onChange={(v) => updateRow(row.id, 'hubspot_property', v)}
                      options={(hubspotProps || []).map((p: any) => ({ value: p.name, label: `${p.label} (${p.name})` }))}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <SelectField
                      value={row.sync_direction}
                      onChange={(v) => updateRow(row.id, 'sync_direction', v)}
                      options={Object.entries(DIRECTION_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <SelectField
                      value={row.transform}
                      onChange={(v) => updateRow(row.id, 'transform', v)}
                      options={Object.entries(TRANSFORM_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => removeRow(row.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-zinc-100">
          <button className="btn-secondary text-sm" onClick={addRow}>
            <Plus size={14} />
            Add Field Mapping
          </button>
        </div>
      </div>

      {/* Default Mappings Hint */}
      {rows.length === 0 && (
        <div className="card p-6 bg-zinc-50">
          <p className="text-sm font-medium text-zinc-700 mb-3">Suggested default mappings:</p>
          <div className="space-y-2 text-sm text-zinc-600">
            {[
              ['First Name', 'info.name.first', 'firstname'],
              ['Last Name', 'info.name.last', 'lastname'],
              ['Email', 'info.emails.0.email', 'email'],
              ['Phone', 'info.phones.0.phone', 'phone'],
              ['Company', 'info.company', 'company'],
            ].map(([label, wix, hs]) => (
              <div key={wix} className="flex items-center gap-2 font-mono text-xs bg-white border border-zinc-200 rounded-lg px-3 py-2">
                <span className="text-blue-700">{wix}</span>
                <span className="text-zinc-400">↔</span>
                <span className="text-orange-600">{hs}</span>
                <span className="text-zinc-400 ml-auto">{label}</span>
              </div>
            ))}
          </div>
          <button
            className="btn-secondary text-sm mt-4"
            onClick={() => {
              const defaults: MappingRow[] = [
                { id: '1', wix_field: 'info.name.first', hubspot_property: 'firstname', sync_direction: 'bidirectional', transform: 'none' },
                { id: '2', wix_field: 'info.name.last', hubspot_property: 'lastname', sync_direction: 'bidirectional', transform: 'none' },
                { id: '3', wix_field: 'info.emails.0.email', hubspot_property: 'email', sync_direction: 'bidirectional', transform: 'lowercase' },
                { id: '4', wix_field: 'info.phones.0.phone', hubspot_property: 'phone', sync_direction: 'bidirectional', transform: 'none' },
                { id: '5', wix_field: 'info.company', hubspot_property: 'company', sync_direction: 'bidirectional', transform: 'none' },
              ];
              setRows(defaults);
              setIsDirty(true);
            }}
          >
            Load Defaults
          </button>
        </div>
      )}
    </div>
  );
}

function SelectField({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-white border border-zinc-200 rounded-lg px-3 py-1.5 pr-7 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent cursor-pointer"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
    </div>
  );
}
