"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import QRCode from 'qrcode';
import {
  Smartphone,
  Plus,
  RefreshCw,
  QrCode,
  Battery,
  BatteryCharging,
  Wifi,
  Radio,
  Clock,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  X,
  Edit2,
  CheckCircle2,
  Send,
  Sliders,
} from 'lucide-react';

interface SimCard {
  slot: number;
  subscriptionId: number;
  carrier: string;
}

interface HeartbeatData {
  battery?: number;
  charging?: boolean;
  network?: string;
  signalLevel?: number;
  outboxDepth?: number;
  pendingEvents?: number;
}

interface GatewayDevice {
  id: string;
  name: string;
  model: string | null;
  androidSdk: number | null;
  appVersion: string | null;
  sims: SimCard[] | null;
  defaultSimSlot: number | null;
  enabled: boolean;
  lastSeenAt: string | null;
  lastHeartbeat: HeartbeatData | null;
  createdAt: string;
  paired: boolean;
  pairingPending: boolean;
  online: boolean;
  queued: number;
  sentToday: number;
}

interface Project {
  id: string;
  name: string;
}

interface ChannelStatus {
  channel: string;
  enabled: boolean;
  ready: boolean;
  provider: string | null;
  detail: string;
}

interface PairingModalData {
  pairingCode: string;
  expiresAt: string;
  qr: string;
  server: string;
  qrDataUrl?: string;
}

export default function GatewaysPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [devices, setDevices] = useState<GatewayDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<ChannelStatus[]>([]);

  // Add / Pairing modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [pairingData, setPairingData] = useState<PairingModalData | null>(null);
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Rename modal state
  const [editingDevice, setEditingDevice] = useState<GatewayDevice | null>(null);
  const [editName, setEditName] = useState('');

  // Revoke confirmation state
  const [revokingDevice, setRevokingDevice] = useState<GatewayDevice | null>(null);

  // Fetch projects
  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await api.get('/projects');
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
          if (data.length > 0) {
            setSelectedProjectId(data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load projects', err);
      }
    }
    loadProjects();
  }, []);

  // Fetch devices and channel readiness for selected project
  const fetchDevices = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const [devRes, chanRes] = await Promise.all([
        api.get(`/projects/${selectedProjectId}/gateway-devices`),
        api.get(`/channels?projectId=${selectedProjectId}`),
      ]);
      if (devRes.ok) {
        setDevices(await devRes.json());
      }
      if (chanRes.ok) {
        setChannels(await chanRes.json());
      }
    } catch (err) {
      console.error('Failed to fetch devices', err);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Create device and generate QR
  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceName.trim() || !selectedProjectId) return;
    setCreating(true);
    try {
      const res = await api.post(`/projects/${selectedProjectId}/gateway-devices`, {
        name: newDeviceName.trim(),
      });
      if (res.ok) {
        const data = await res.json();
        const qrDataUrl = await QRCode.toDataURL(data.qr, {
          width: 256,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        });
        setPairingData({ ...data, qrDataUrl });
        setNewDeviceName('');
        fetchDevices();
      }
    } catch (err) {
      console.error('Failed to create device', err);
    } finally {
      setCreating(false);
    }
  };

  // Re-pair existing device
  const handleRePair = async (device: GatewayDevice) => {
    try {
      const res = await api.post(
        `/projects/${selectedProjectId}/gateway-devices/${device.id}/pairing-code`,
      );
      if (res.ok) {
        const data = await res.json();
        const qrDataUrl = await QRCode.toDataURL(data.qr, {
          width: 256,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        });
        setPairingData({ ...data, qrDataUrl });
        setIsAddModalOpen(true);
      }
    } catch (err) {
      console.error('Failed to re-pair device', err);
    }
  };

  // Toggle enabled
  const handleToggleEnabled = async (device: GatewayDevice) => {
    try {
      const res = await api.patch(
        `/projects/${selectedProjectId}/gateway-devices/${device.id}`,
        { enabled: !device.enabled },
      );
      if (res.ok) {
        fetchDevices();
      }
    } catch (err) {
      console.error('Failed to toggle device enabled', err);
    }
  };

  // Rename
  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice || !editName.trim()) return;
    try {
      const res = await api.patch(
        `/projects/${selectedProjectId}/gateway-devices/${editingDevice.id}`,
        { name: editName.trim() },
      );
      if (res.ok) {
        setEditingDevice(null);
        fetchDevices();
      }
    } catch (err) {
      console.error('Failed to rename device', err);
    }
  };

  // Set default SIM slot
  const handleSetDefaultSim = async (device: GatewayDevice, slot: number) => {
    try {
      const res = await api.patch(
        `/projects/${selectedProjectId}/gateway-devices/${device.id}`,
        { defaultSimSlot: slot },
      );
      if (res.ok) {
        fetchDevices();
      }
    } catch (err) {
      console.error('Failed to set default SIM', err);
    }
  };

  // Revoke
  const handleConfirmRevoke = async () => {
    if (!revokingDevice) return;
    try {
      const res = await api.delete(
        `/projects/${selectedProjectId}/gateway-devices/${revokingDevice.id}`,
      );
      if (res.ok) {
        setRevokingDevice(null);
        fetchDevices();
      }
    } catch (err) {
      console.error('Failed to revoke device', err);
    }
  };

  const smsChannelStatus = channels.find((c) => c.channel === 'SMS');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Smartphone className="h-6 w-6 text-emerald-400" />
            SMS Gateway Devices
          </h2>
          <p className="text-sm text-slate-400">
            Pair Android phones with the Notica Gateway app to send automated SMS directly from your SIMs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3.5 py-2 bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer min-w-[160px]"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            onClick={fetchDevices}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-all"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => {
              setPairingData(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Pair Gateway Phone
          </button>
        </div>
      </div>

      {/* Channel Readiness Alert */}
      {smsChannelStatus && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between ${
            smsChannelStatus.ready
              ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300'
              : smsChannelStatus.enabled
              ? 'bg-amber-950/20 border-amber-900/40 text-amber-300'
              : 'bg-slate-900/40 border-slate-800 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Radio className="h-4 w-4 shrink-0" />
            <span>
              <strong>SMS Channel Status:</strong>{' '}
              {smsChannelStatus.ready
                ? `Ready (${smsChannelStatus.provider}) — ${smsChannelStatus.detail}`
                : smsChannelStatus.detail}
            </span>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded bg-black/40">
            {smsChannelStatus.provider || 'disabled'}
          </span>
        </div>
      )}

      {/* Device List */}
      {devices.length === 0 ? (
        <div className="text-center py-16 px-4 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
          <Smartphone className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-200">No Gateway Phones Paired</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-6">
            Install the Notica Gateway app on your Android phone, pair it using a one-time QR code, and start dispatching SMS.
          </p>
          <button
            onClick={() => {
              setPairingData(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Pair First Gateway
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {devices.map((device) => {
            const hb = device.lastHeartbeat;
            return (
              <div
                key={device.id}
                className={`p-5 rounded-2xl border transition-all ${
                  device.enabled
                    ? 'bg-slate-900/40 border-slate-800/80'
                    : 'bg-slate-950/40 border-slate-900 opacity-60'
                }`}
              >
                {/* Device Title & Status */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        device.online
                          ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                          : 'bg-slate-600'
                      }`}
                      title={device.online ? 'Online (connected to WebSocket)' : 'Offline'}
                    />
                    <div>
                      <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        {device.name}
                        <button
                          onClick={() => {
                            setEditingDevice(device);
                            setEditName(device.name);
                          }}
                          className="text-slate-500 hover:text-slate-300"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      </h4>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {device.model || 'Unknown Model'} · Android {device.androidSdk || '?'}
                        {device.appVersion && ` · v${device.appVersion}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleToggleEnabled(device)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
                        device.enabled
                          ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                          : 'border-slate-800 bg-slate-900 text-slate-500'
                      }`}
                    >
                      {device.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      onClick={() => setRevokingDevice(device)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-850 transition-all"
                      title="Revoke Gateway Device"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Heartbeat / Device Telemetry */}
                <div className="grid grid-cols-4 gap-2 py-2.5 px-3 bg-slate-950/60 rounded-xl border border-slate-900 text-[11px] mb-4">
                  <div>
                    <span className="block text-[9px] uppercase tracking-wider text-slate-500">Status</span>
                    <span className={`font-semibold ${device.online ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {device.online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase tracking-wider text-slate-500">Battery</span>
                    <span className="font-semibold text-slate-300 flex items-center gap-1">
                      {hb?.charging ? (
                        <BatteryCharging className="h-3.5 w-3.5 text-amber-400" />
                      ) : (
                        <Battery className="h-3.5 w-3.5 text-slate-400" />
                      )}
                      {hb?.battery !== undefined ? `${hb.battery}%` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase tracking-wider text-slate-500">Queued</span>
                    <span className="font-semibold text-slate-300">{device.queued}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase tracking-wider text-slate-500">Sent Today</span>
                    <span className="font-semibold text-emerald-400">{device.sentToday}</span>
                  </div>
                </div>

                {/* SIM Cards */}
                <div className="space-y-1.5 mb-4">
                  <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    SIM Cards & Carrier
                  </span>
                  {device.sims && device.sims.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {device.sims.map((sim) => {
                        const isDefault = device.defaultSimSlot === sim.slot;
                        return (
                          <button
                            key={sim.slot}
                            onClick={() => handleSetDefaultSim(device, sim.slot)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                              isDefault
                                ? 'bg-violet-950/40 border-violet-800 text-violet-300'
                                : 'bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-700'
                            }`}
                            title="Click to set as default SIM"
                          >
                            <span className="font-mono font-bold">SIM {sim.slot + 1}:</span>
                            <span>{sim.carrier || 'Carrier'}</span>
                            {isDefault && (
                              <span className="text-[10px] bg-violet-800/60 px-1 rounded text-white ml-1">
                                Default
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500 italic">No SIM cards reported yet</span>
                  )}
                </div>

                {/* Footer / Re-pair code */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-850/60 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last seen:{' '}
                    {device.lastSeenAt
                      ? new Date(device.lastSeenAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Never'}
                  </span>

                  <button
                    onClick={() => handleRePair(device)}
                    className="text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1"
                  >
                    <QrCode className="h-3 w-3" />
                    Re-pair
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Pairing Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute right-5 top-5 text-slate-500 hover:text-slate-300"
            >
              <X className="h-5 w-5" />
            </button>

            {!pairingData ? (
              <form onSubmit={handleCreateDevice} className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Smartphone className="h-5 w-5" />
                  <h3 className="text-base font-bold text-white">Add Gateway Phone</h3>
                </div>
                <p className="text-xs text-slate-400">
                  Enter a label for this phone (e.g. "Primary Office Pixel"). You will be shown a pairing QR code.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Phone Name / Label
                  </label>
                  <input
                    type="text"
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                    placeholder="e.g. Pixel 7 - Office SIM"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    autoFocus
                    required
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !newDeviceName.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-600/20"
                  >
                    {creating ? 'Generating...' : 'Generate Pairing Code'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-center">
                <div className="flex items-center justify-center gap-2 text-emerald-400">
                  <QrCode className="h-5 w-5" />
                  <h3 className="text-base font-bold text-white">Scan to Pair Gateway</h3>
                </div>
                <p className="text-xs text-slate-400">
                  Open the Notica Gateway app on your phone and scan this QR code, or enter the code manually.
                </p>

                {pairingData.qrDataUrl && (
                  <div className="bg-white p-3 rounded-2xl w-56 h-56 mx-auto flex items-center justify-center shadow-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pairingData.qrDataUrl}
                      alt="Pairing QR Code"
                      className="w-full h-full"
                    />
                  </div>
                )}

                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center justify-between max-w-xs mx-auto">
                  <div className="text-left">
                    <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                      Pairing Code
                    </span>
                    <span className="text-lg font-mono font-bold tracking-widest text-emerald-400">
                      {pairingData.pairingCode}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(pairingData.pairingCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900"
                    title="Copy Code"
                  >
                    {copiedCode ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-slate-500">
                  Valid for 10 minutes. The server credentials will only be shown once to the app upon pairing.
                </p>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setPairingData(null);
                    }}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-xl"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {editingDevice && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveRename}
            className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4"
          >
            <h3 className="text-sm font-bold text-white">Rename Device</h3>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
              autoFocus
              required
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingDevice(null)}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {revokingDevice && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-900/40 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-sm font-bold text-white">Revoke Gateway Phone?</h3>
            </div>
            <p className="text-xs text-slate-400">
              Are you sure you want to revoke <strong>{revokingDevice.name}</strong>? Its connection will be terminated immediately and it will no longer receive SMS jobs.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRevokingDevice(null)}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRevoke}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl"
              >
                Revoke Device
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
