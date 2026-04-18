import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

let schedulerInterval = null;

export function startReminderScheduler(reminders, alters, frontingAlterIds) {
  if (schedulerInterval) clearInterval(schedulerInterval);
  
  schedulerInterval = setInterval(() => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const currentDate = now.toISOString().split('T')[0];
    
    reminders.forEach(reminder => {
      if (!reminder.is_active) return;
      
      // Check if this reminder should fire now
      const timeMatch = reminder.time === currentTime;
      const dayMatch = reminder.days?.length === 0 || reminder.days?.includes(currentDay);
      const dateMatch = !reminder.date || reminder.date === currentDate;
      
      if (!timeMatch || !dayMatch || !dateMatch) return;
      
      // Check if already triggered in the last minute (prevent double-firing)
      if (reminder.last_triggered) {
        const lastTrig = new Date(reminder.last_triggered);
        if (now - lastTrig < 60000) return;
      }
      
      // Check if addressed to specific alters — only fire if one of them is fronting
      if (reminder.target_alter_ids?.length > 0) {
        const targetIsFronting = reminder.target_alter_ids.some(id => frontingAlterIds.includes(id));
        if (!targetIsFronting) return;
      }
      
      // Fire the reminder
      fireReminder(reminder, alters, frontingAlterIds);
    });
  }, 30000); // check every 30 seconds
}

export function stopReminderScheduler() {
  if (schedulerInterval) clearInterval(schedulerInterval);
}

function fireReminder(reminder, alters, frontingAlterIds) {
  const targetNames = reminder.target_alter_ids?.length > 0
    ? reminder.target_alter_ids
        .map(id => alters.find(a => a.id === id)?.name)
        .filter(Boolean)
        .join(', ')
    : null;
    
  const title = targetNames ? `${reminder.title} — for ${targetNames}` : reminder.title;
  const body = reminder.body || '';
  
  // Web Notification (if permission granted)
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `reminder-${reminder.id}`,
    });
  }
  
  // In-app toast (always shown if app is open)
  if (reminder.target_alter_ids?.length > 0) {
    const targetAlter = alters.find(a => a.id === reminder.target_alter_ids[0]);
    if (targetAlter) {
      toast.custom(() => (
        <div className='flex items-center gap-3 bg-card border border-border rounded-xl p-3 shadow-lg'>
          <div
            className='w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0'
            style={{ backgroundColor: targetAlter?.color || '#8b5cf6' }}
          >
            {targetAlter?.name?.charAt(0).toUpperCase()}
          </div>
          <div className='flex-1 min-w-0'>
            <p className='text-sm font-semibold text-foreground'>{reminder.title}</p>
            {body && <p className='text-xs text-muted-foreground mt-0.5'>{body}</p>}
          </div>
        </div>
      ), { duration: 8000 });
    }
  } else {
    toast(title, {
      description: body || undefined,
      duration: 8000,
    });
  }
  
  // Update last_triggered
  base44.entities.Reminder.update(reminder.id, { 
    last_triggered: new Date().toISOString() 
  }).catch(err => console.error('Failed to update reminder:', err));
}

export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) return false;
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
};