import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Bell, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { requestNotificationPermission } from '@/lib/reminderScheduler';

const REMINDER_TYPES = [
  { id: 'checkin', label: 'Check-In', icon: '📋', defaultTitle: 'Time to check in' },
  { id: 'medication', label: 'Medication', icon: '💊', defaultTitle: 'Medication reminder' },
  { id: 'therapy', label: 'Therapy', icon: '🧠', defaultTitle: 'Therapy today' },
  { id: 'fronting', label: 'Fronting', icon: '👤', defaultTitle: 'Log who is fronting' },
  { id: 'custom', label: 'Custom', icon: '✨', defaultTitle: '' },
];

const PRESETS = [
  { title: 'Morning check-in', type: 'checkin', time: '09:00', days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
  { title: 'Evening check-in', type: 'checkin', time: '21:00', days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
  { title: 'Medication reminder', type: 'medication', time: '08:00', days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
  { title: 'Log who is fronting', type: 'fronting', time: '12:00', days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
];

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_VALUES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function ReminderModal({ open, reminder, onClose, alters }) {
  const [title, setTitle] = useState(reminder?.title || '');
  const [body, setBody] = useState(reminder?.body || '');
  const [time, setTime] = useState(reminder?.time || '09:00');
  const [type, setType] = useState(reminder?.type || 'custom');
  const [isRecurring, setIsRecurring] = useState(reminder?.days?.length > 0 || false);
  const [days, setDays] = useState(reminder?.days || []);
  const [date, setDate] = useState(reminder?.date || '');
  const [selectedAlterIds, setSelectedAlterIds] = useState(reminder?.target_alter_ids || []);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Reminder.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success('Reminder created!');
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Reminder.update(reminder.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success('Reminder updated!');
      onClose();
    },
  });

  const handleSave = async () => {
    if (!title.trim() || !time) {
      toast.error('Please fill in title and time');
      return;
    }

    if (isRecurring && days.length === 0) {
      toast.error('Select at least one day for recurring reminder');
      return;
    }

    if (!isRecurring && !date) {
      toast.error('Select a date for one-time reminder');
      return;
    }

    const data = {
      title,
      body,
      time,
      type,
      days: isRecurring ? days : [],
      date: !isRecurring ? date : null,
      target_alter_ids: selectedAlterIds,
      is_active: true,
    };

    if (reminder) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    setNotifPermission(granted ? 'granted' : 'denied');
    if (!granted) {
      toast.error('Notification permission denied');
    }
  };

  if (!open) return null;

  return (
    <div className='fixed inset-0 bg-black/50 flex items-end z-50'>
      <motion.div
        initial={{ translateY: '100%' }}
        animate={{ translateY: 0 }}
        exit={{ translateY: '100%' }}
        className='w-full bg-background rounded-t-2xl p-6 max-h-[90vh] overflow-y-auto'
      >
        <div className='flex items-center justify-between mb-6'>
          <h2 className='text-xl font-semibold'>{reminder ? 'Edit reminder' : 'New reminder'}</h2>
          <button onClick={onClose} className='text-muted-foreground hover:text-foreground text-lg'>✕</button>
        </div>

        <div className='space-y-4'>
          {/* Title */}
          <div>
            <label className='text-sm font-medium text-foreground block mb-2'>Title *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='Reminder title'
              className='rounded-lg'
            />
          </div>

          {/* Body */}
          <div>
            <label className='text-sm font-medium text-foreground block mb-2'>Description</label>
            <Input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder='Optional reminder details'
              className='rounded-lg'
            />
          </div>

          {/* Type */}
          <div>
            <label className='text-sm font-medium text-foreground block mb-2'>Type</label>
            <div className='grid grid-cols-5 gap-2'>
              {REMINDER_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setType(t.id);
                    if (!title.trim()) setTitle(t.defaultTitle);
                  }}
                  className={`text-xs font-medium px-2 py-2 rounded-lg transition-all text-center ${
                    type === t.id
                      ? 'bg-primary text-white'
                      : 'bg-card border border-border hover:border-primary/30'
                  }`}
                >
                  <div className='text-lg mb-0.5'>{t.icon}</div>
                  <div className='truncate'>{t.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Time */}
          <div>
            <label className='text-sm font-medium text-foreground block mb-2'>Time *</label>
            <input
              type='time'
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className='w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground'
            />
          </div>

          {/* Recurring toggle */}
          <div>
            <label className='text-sm font-medium text-foreground block mb-2'>Recurrence</label>
            <div className='flex gap-2'>
              <button
                onClick={() => {
                  setIsRecurring(false);
                  setDays([]);
                  if (!date) setDate(new Date().toISOString().split('T')[0]);
                }}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  !isRecurring
                    ? 'bg-primary text-white'
                    : 'bg-card border border-border hover:border-primary/30'
                }`}
              >
                One-time
              </button>
              <button
                onClick={() => {
                  setIsRecurring(true);
                  setDate('');
                }}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isRecurring
                    ? 'bg-primary text-white'
                    : 'bg-card border border-border hover:border-primary/30'
                }`}
              >
                Recurring
              </button>
            </div>
          </div>

          {/* Date or Days */}
          {!isRecurring ? (
            <div>
              <label className='text-sm font-medium text-foreground block mb-2'>Date *</label>
              <input
                type='date'
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className='w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground'
              />
            </div>
          ) : (
            <div>
              <label className='text-sm font-medium text-foreground block mb-2'>Days *</label>
              <div className='grid grid-cols-7 gap-1'>
                {DAY_LABELS.map((label, idx) => (
                  <button
                    key={DAY_VALUES[idx]}
                    onClick={() => {
                      const val = DAY_VALUES[idx];
                      setDays(days.includes(val) ? days.filter(d => d !== val) : [...days, val]);
                    }}
                    className={`px-1 py-2 rounded-lg text-xs font-medium transition-all ${
                      days.includes(DAY_VALUES[idx])
                        ? 'bg-primary text-white'
                        : 'bg-card border border-border hover:border-primary/30'
                    }`}
                  >
                    {label.substring(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Alter selector */}
          {alters.length > 0 && (
            <div>
              <label className='text-sm font-medium text-foreground block mb-2'>For whom</label>
              <div className='space-y-2'>
                <button
                  onClick={() => setSelectedAlterIds([])}
                  className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                    selectedAlterIds.length === 0
                      ? 'bg-primary text-white'
                      : 'bg-card border border-border hover:border-primary/30'
                  }`}
                >
                  Everyone
                </button>
                <div className='space-y-1'>
                  {alters.map((alter) => (
                    <button
                      key={alter.id}
                      onClick={() => {
                        setSelectedAlterIds(
                          selectedAlterIds.includes(alter.id)
                            ? selectedAlterIds.filter(id => id !== alter.id)
                            : [...selectedAlterIds, alter.id]
                        );
                      }}
                      className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                        selectedAlterIds.includes(alter.id)
                          ? 'bg-primary text-white'
                          : 'bg-card border border-border hover:border-primary/30'
                      }`}
                    >
                      {alter.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Notification permission warning */}
          {notifPermission !== 'granted' && (
            <div className='bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-3'>
              <AlertCircle className='w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5' />
              <div className='text-sm'>
                <p className='font-medium text-amber-900'>Browser notifications disabled</p>
                <p className='text-amber-800/70 text-xs mt-1'>Reminders will show as in-app toasts when the app is open.</p>
                <Button
                  onClick={handleRequestPermission}
                  size='sm'
                  variant='outline'
                  className='mt-2 h-7 text-xs'
                >
                  Enable notifications
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className='flex gap-2 mt-6'>
          <Button variant='outline' onClick={onClose} className='flex-1'>
            Cancel
          </Button>
          <Button onClick={handleSave} className='flex-1 bg-primary hover:bg-primary/90'>
            {reminder ? 'Update' : 'Create'} reminder
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

export default function RemindersManager() {
  const [showModal, setShowModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);

  const { data: reminders = [] } = useQuery({
    queryKey: ['reminders'],
    queryFn: () => base44.entities.Reminder.list('-created_date'),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ['alters'],
    queryFn: () => base44.entities.Alter.list(),
  });

  const queryClient = useQueryClient();

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.Reminder.update(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Reminder.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success('Reminder deleted');
    },
  });

  const handleAddPreset = async (preset) => {
    await base44.entities.Reminder.create(preset);
    queryClient.invalidateQueries({ queryKey: ['reminders'] });
    toast.success(`Added "${preset.title}"`);
  };

  const handleEditReminder = (reminder) => {
    setEditingReminder(reminder);
    setShowModal(true);
  };

  const handleCreateNew = () => {
    setEditingReminder(null);
    setShowModal(true);
  };

  const getTypeIcon = (type) => REMINDER_TYPES.find(t => t.id === type)?.icon || '✨';
  const getTypeLabel = (type) => REMINDER_TYPES.find(t => t.id === type)?.label || 'Custom';

  const activeRemindersCount = reminders.filter(r => r.is_active).length;

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-xl font-semibold text-foreground flex items-center gap-2'>
            <Bell className='w-5 h-5' />
            Reminders
          </h2>
          <p className='text-sm text-muted-foreground mt-1'>{activeRemindersCount} active reminder{activeRemindersCount !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={handleCreateNew} className='bg-primary hover:bg-primary/90 gap-1.5'>
          <Plus className='w-4 h-4' />
          New
        </Button>
      </div>

      {/* Reminders list */}
      <AnimatePresence>
        {reminders.length > 0 ? (
          <div className='space-y-2'>
            {reminders.map((reminder) => (
              <motion.div
                key={reminder.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className='bg-card border border-border rounded-xl p-4 flex items-center justify-between hover:border-primary/30 transition-colors'
              >
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2 mb-1'>
                    <span className='text-lg'>{getTypeIcon(reminder.type)}</span>
                    <h3 className='font-semibold text-foreground'>{reminder.title}</h3>
                    {!reminder.is_active && <span className='text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground'>Inactive</span>}
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {reminder.time} • {reminder.days?.length > 0 ? reminder.days.map(d => d.substring(0, 3)).join(', ') : `Once on ${reminder.date}`}
                    {reminder.target_alter_ids?.length > 0 && ` • For ${reminder.target_alter_ids.length} alter${reminder.target_alter_ids.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
                <div className='flex items-center gap-2 ml-3 flex-shrink-0'>
                  <button
                    onClick={() => toggleActiveMutation.mutate({ id: reminder.id, is_active: !reminder.is_active })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      reminder.is_active
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70'
                    }`}
                  >
                    {reminder.is_active ? 'On' : 'Off'}
                  </button>
                  <button
                    onClick={() => handleEditReminder(reminder)}
                    className='px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-all'
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(reminder.id)}
                    className='text-muted-foreground hover:text-destructive transition-colors p-2'
                  >
                    <Trash2 className='w-4 h-4' />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className='text-center py-12'>
            <Bell className='w-12 h-12 text-muted-foreground/30 mx-auto mb-3' />
            <p className='text-muted-foreground'>No reminders yet</p>
          </div>
        )}
      </AnimatePresence>

      {/* Quick add presets */}
      <div>
        <p className='text-sm font-semibold text-foreground mb-3'>Quick add presets</p>
        <div className='grid grid-cols-2 gap-2'>
          {PRESETS.map((preset) => (
            <button
              key={preset.title}
              onClick={() => handleAddPreset(preset)}
              className='px-4 py-3 rounded-lg bg-card border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left'
            >
              <p className='text-sm font-medium text-foreground'>{preset.title}</p>
              <p className='text-xs text-muted-foreground mt-1'>{preset.time}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Modal */}
      <ReminderModal
        open={showModal}
        reminder={editingReminder}
        onClose={() => {
          setShowModal(false);
          setEditingReminder(null);
        }}
        alters={alters.filter(a => !a.is_archived)}
      />
    </div>
  );
}