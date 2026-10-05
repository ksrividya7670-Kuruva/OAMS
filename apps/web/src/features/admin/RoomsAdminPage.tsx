import { useState, type FC, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import { type RoomItem } from '@oams/shared';
import {
  DoorClosed,
  Plus,
  Users,
  CheckCircle,
  XCircle,
  AlertCircle,
  Edit2,
  Trash2,
  MapPin,
} from 'lucide-react';

export const RoomsAdminPage: FC = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomItem | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [capacity, setCapacity] = useState<number>(10);
  const [equipmentText, setEquipmentText] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Query rooms
  const { data: rooms = [], isLoading } = useQuery<RoomItem[]>({
    queryKey: ['admin-rooms-list'],
    queryFn: () =>
      api.get<RoomItem[]>('/api/v1/rooms', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    enabled: !!token,
  });

  const openCreateModal = () => {
    setEditingRoom(null);
    setName('');
    setCode('');
    setBuilding('');
    setFloor('');
    setCapacity(10);
    setEquipmentText('VC, Projector, Whiteboard');
    setNotes('');
    setIsActive(true);
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (room: RoomItem) => {
    setEditingRoom(room);
    setName(room.name);
    setCode(room.code || '');
    setBuilding(room.building || '');
    setFloor(room.floor || '');
    setCapacity(room.capacity);
    setEquipmentText(room.equipment?.join(', ') || '');
    setNotes(room.notes || '');
    setIsActive(room.isActive);
    setFormError(null);
    setShowModal(true);
  };

  // Create or Update mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const equipment = equipmentText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        name,
        code: code || null,
        building: building || null,
        floor: floor || null,
        capacity: Number(capacity),
        equipment,
        notes: notes || null,
        isActive,
      };

      if (editingRoom) {
        return api.patch(`/api/v1/rooms/${editingRoom.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        return api.post('/api/v1/rooms', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rooms-list'] });
      setShowModal(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to save conference room';
      setFormError(msg);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (roomId: string) => {
      return api.del(`/api/v1/rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rooms-list'] });
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Room name is required.');
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-surface)] p-6 rounded-2xl border border-[var(--border-default)] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 font-bold">
              <DoorClosed className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-[var(--text-main)]">Meeting Rooms & Venues</h1>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Configure conference rooms, capacities, AV equipment, and availability policies (§7.4).
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="px-3.5 py-1.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add Room
        </button>
      </div>

      {/* Rooms Table */}
      <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[var(--border-default)] flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Configured Venues ({rooms.length})
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading rooms...</div>
        ) : rooms.length === 0 ? (
          <div className="p-12 text-center">
            <DoorClosed className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
            <h3 className="text-sm font-semibold text-[var(--text-main)]">No Rooms Found</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Add your first conference room or board room.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                <th className="py-3 px-4">Room & Code</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4 text-center">Capacity</th>
                <th className="py-3 px-4">Equipment</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-default)] text-xs">
              {rooms.map((room: RoomItem) => (
                <tr key={room.id} className="hover:bg-[var(--bg-subtle)]/40 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-[var(--text-main)]">{room.name}</div>
                    {room.code && (
                      <span className="text-[10px] font-mono text-[var(--text-muted)]">
                        {room.code}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-[var(--text-muted)]">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 shrink-0 opacity-60" />
                      <span>
                        {room.building || 'Main Block'}
                        {room.floor ? `, ${room.floor}` : ''}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center gap-1 font-semibold text-[var(--text-main)]">
                      <Users className="w-3.5 h-3.5 opacity-60" /> {room.capacity}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {room.equipment && room.equipment.length > 0 ? (
                        room.equipment.map((eq: string, i: number) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[10px] text-[var(--text-muted)] border border-[var(--border-default)]"
                          >
                            {eq}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)] italic">None</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {room.isActive ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold text-[10px]">
                        <CheckCircle className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 font-semibold text-[10px]">
                        <XCircle className="w-3 h-3" /> Inactive
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditModal(room)}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                        title="Edit Room"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(room.id)}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Delete Room"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-[var(--border-default)] flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--text-main)]">
                {editingRoom ? 'Edit Room' : 'Add New Conference Room'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-main)] text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Room Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Sardar Patel Boardroom"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)]"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Room Code
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. CR-101"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Building
                  </label>
                  <input
                    type="text"
                    value={building}
                    onChange={(e) => setBuilding(e.target.value)}
                    placeholder="Main Block"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Floor
                  </label>
                  <input
                    type="text"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    placeholder="1st Floor"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Capacity *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    required
                    value={capacity}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Equipment (comma-separated)
                </label>
                <input
                  type="text"
                  value={equipmentText}
                  onChange={(e) => setEquipmentText(e.target.value)}
                  placeholder="Video Conference, Projector, Whiteboard, Polycom"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Notes / Access Guidance
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Key kept at reception, priority for board meetings"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-main)] resize-none"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                  />
                  <span className="text-xs font-semibold text-[var(--text-main)]">
                    Room is Active & Bookable
                  </span>
                </label>
              </div>

              <div className="pt-4 border-t border-[var(--border-default)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--border-default)] text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="px-4 py-1.5 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-semibold hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 cursor-pointer"
                >
                  {saveMutation.isPending ? 'Saving...' : editingRoom ? 'Update Room' : 'Add Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
