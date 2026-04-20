import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTerms } from '@/lib/useTerms';
import { 
  Users, Heart, BookOpen, BarChart2, Map, Shield, 
  FileText, Sparkles, Clock, CheckSquare, Activity,
  MessageSquare, Zap, ChevronRight, ChevronLeft, X
} from 'lucide-react';

const STEPS = (t) => [
  {
    title: `Welcome to Oceans Symphony 💜`,
    subtitle: 'A companion app built for dissociative systems',
    body: `Symphony is built intentionally for DID, OSDD, and other dissociative systems, and is free for anyone to use for any purpose. It is designed specifically to help track and manage dissociative and PTSD symptoms, help your system stay connected, track experiences, and bridge the gaps that amnesia creates.`,
    icon: '🌊',
    color: 'from-violet-500/20 to-purple-500/20',
    tip: null,
  },
  {
    title: `Your ${t.Alters}`,
    subtitle: `Every part of the ${t.system}, all in one place`,
    body: `Create profiles for each ${t.alter} with their own name, pronouns, color, avatar, role, and bio. ${t.Alters} can have custom fields, notes from other parts, and their own journal entries.`,
    icon: <Users className='w-8 h-8' />,
    color: 'from-purple-500/20 to-pink-500/20',
    tip: `Press the thunder/active icon next to an ${t.alter} card to set their ${t.front} status; long press to set/remove as primary`,
    features: ['Custom profiles with avatars', 'Pronouns and roles', `Private ${t.alter} notes`, 'Custom fields', 'SP integration'],
  },
  {
    title: `${t.Fronting} Tracker`,
    subtitle: 'Know who is present, and for how long',
    body: `Log who is ${t.fronting} with a single tap. Track primary ${t.Fronters} and ${t.cofronters}. All ${t.fronting} history feeds into your timeline and analytics automatically.`,
    icon: <Heart className='w-8 h-8' />,
    color: 'from-rose-500/20 to-orange-500/20',
    tip: `Tap to add as ${t.cofronter}, long press to set as primary`,
    features: [`Primary and ${t.cofronter} tracking`, 'Session history on timeline', 'Analytics and patterns', `${t.Switch} logging`],
  },
  {
    title: `${t.System} Map`,
    subtitle: 'Visualize your inner world',
    body: `Map out relationships between ${t.alters}, build your inner world with locations, and explore how your ${t.system} connects. The analytics map shows ${t.fronting} patterns and overlap.`,
    icon: <Map className='w-8 h-8' />,
    color: 'from-blue-500/20 to-cyan-500/20',
    tip: `Double-tap an ${t.alter} on the inner world map to enter relationship mode`,
    features: ['Inner world canvas', 'Relationship lines with directions', 'Location nodes', 'Analytics map', 'Clickable relationship details'],
  },
  {
    title: 'Check-In & Daily Log',
    subtitle: `Track how the ${t.system} is doing day to day`,
    body: `Quick check-ins let any part log emotions, symptoms, activities, diary entries, and notes in one place. Everything is timestamped and tied to who was ${t.fronting}.`,
    icon: <Sparkles className='w-8 h-8' />,
    color: 'from-amber-500/20 to-yellow-500/20',
    tip: 'The Quick Check-In button on the home screen is the fastest way to log anything',
    features: ['Emotion check-ins', 'Symptom and habit tracking', 'Activity logging', 'Diary cards', 'Sleep tracking'],
  },
  {
    title: 'Symptom Tracking',
    subtitle: 'Log and monitor symptoms over time',
    body: `Track dissociation, anxiety, flashbacks, and any custom symptoms. Active symptoms show on the dashboard. The timeline shows severity changes as a visual bar.`,
    icon: <Activity className='w-8 h-8' />,
    color: 'from-red-500/20 to-rose-500/20',
    tip: 'Long press an active symptom chip to adjust severity or end the session',
    features: ['Custom symptoms and habits', 'Severity tracking over time', 'Timeline visualization', 'Active symptom display', 'Analytics charts'],
  },
  {
    title: 'Journals',
    subtitle: `Write, remember, and share across the ${t.system}`,
    body: `Journal entries can be written by specific ${t.alters} and shared with the ${t.system}. Mention other ${t.alters} with @ to send them notifications. The bulletin board is for ${t.system}-wide messages.`,
    icon: <BookOpen className='w-8 h-8' />,
    color: 'from-green-500/20 to-teal-500/20',
    tip: `Use @ mentions in journals and bulletins to notify specific ${t.alters}`,
    features: ['Private and shared entries', '@ mentions with notifications', 'Bulletin board', 'Threaded comments', 'Rich text blocks'],
  },
  {
    title: 'Timeline',
    subtitle: `Your ${t.system}'s history, all in one view`,
    body: `The infinite timeline shows everything — ${t.fronting} sessions, emotions, activities, symptoms, journal entries, and tasks — laid out chronologically by day. Zoom in and out to explore.`,
    icon: <Clock className='w-8 h-8' />,
    color: 'from-indigo-500/20 to-blue-500/20',
    tip: `Double-tap a ${t.fronting} bar on the timeline to edit that session's start and end time`,
    features: [`${t.Fronting} session bars`, 'Emotion and symptom events', 'Activity tracking', 'Zoom and scroll', 'Daily tally view'],
  },
  {
    title: 'Analytics',
    subtitle: `Understand your ${t.system}'s patterns`,
    body: `See which ${t.alters} ${t.front} most, when ${t.switching} happens, emotion patterns, symptom trends, and more. Analytics draw from all your logged data automatically.`,
    icon: <BarChart2 className='w-8 h-8' />,
    color: 'from-violet-500/20 to-indigo-500/20',
    tip: 'The more you log, the more meaningful your analytics become',
    features: [`${t.Fronting} distribution`, `${t.Cofronting} patterns`, 'Emotion trends', 'Symptom analytics', 'Activity summaries'],
  },
  {
    title: 'Support & Learn',
    subtitle: 'Grounding tools and trauma-informed skills',
    body: `Access breathing exercises, imagery techniques, and grounding tools instantly. The Learn section is a full 10-module curriculum of trauma-informed coping skills you can work through at your own pace.`,
    icon: <Shield className='w-8 h-8' />,
    color: 'from-pink-500/20 to-rose-500/20',
    tip: 'The floating bubble button gives instant access to support from anywhere in the app',
    features: ['9 breathing techniques', 'Imagery grounding', '10-module curriculum', 'Interactive exercises', 'Personal coping cards'],
  },
  {
    title: 'Therapy Report',
    subtitle: 'Bridge the amnesia gap in therapy',
    body: `Generate a structured PDF report of your system\'s activity over any time period. Bring it to therapy so your therapist can see what happened between sessions — even across amnesia barriers.`,
    icon: <FileText className='w-8 h-8' />,
    color: 'from-teal-500/20 to-green-500/20',
    tip: 'Reports are generated entirely on your device — nothing is ever sent to a server',
    features: ['PDF and plain text export', 'Smart highlights mode', 'Alter anonymization option', 'Customizable sections', 'Personal note to therapist'],
  },
  {
    title: 'Privacy & Data',
    subtitle: 'Your data, your control',
    body: `Oceans Symphony supports local-only mode with AES-256 encryption — your data never leaves your device. Regular backups are recommended. The app is free and open source, built by a dissociative ${t.system}.`,
    icon: '🔒',
    color: 'from-slate-500/20 to-gray-500/20',
    tip: 'Find local mode and backup options in Settings → Data Management',
    features: ['Local mode with encryption', 'JSON backup and restore', 'No ads, no tracking', 'Open source on GitHub', 'Free forever'],
  },
  {
    title: "You're all set 🎉",
    subtitle: `Welcome to the ${t.system}`,
    body: `Explore at your own pace. Every feature is designed with dissociative ${t.system}s in mind. You can reopen this guide anytime from the Guide button on the home screen.`,
    icon: '💜',
    color: 'from-violet-500/20 to-purple-500/20',
    tip: null,
    features: null,
  },
];

export default function TourModal({ open, onClose }) {
  const t = useTerms();
  const steps = STEPS(t);
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;
  const progress = ((step + 1) / steps.length) * 100;

  const go = (dir) => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setStep(s => s + dir);
      setAnimating(false);
    }, 150);
  };

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='max-w-md p-0 overflow-hidden gap-0 border-border/50'>
        
        {/* Progress bar */}
        <div className='h-1 bg-muted'>
          <div 
            className='h-full bg-primary transition-all duration-500 ease-out'
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Header gradient */}
        <div className={`bg-gradient-to-br ${current.color} px-6 pt-6 pb-4`}>
          <div className='flex items-start justify-between'>
            <div className='text-4xl mb-3'>
              {typeof current.icon === 'string' ? current.icon : current.icon}
            </div>
            <button onClick={onClose} className='text-muted-foreground hover:text-foreground transition-colors p-1'>
              <X className='w-4 h-4' />
            </button>
          </div>
          <h2 className='text-xl font-bold text-foreground leading-tight'>{current.title}</h2>
          <p className='text-sm text-primary font-medium mt-0.5'>{current.subtitle}</p>
        </div>

        {/* Content */}
        <div className='px-6 py-4 space-y-4'>
          <p className='text-sm text-muted-foreground leading-relaxed'>{current.body}</p>

          {/* Feature list */}
          {current.features && (
            <div className='space-y-1.5'>
              {current.features.map((f, i) => (
                <div key={i} className='flex items-center gap-2 text-sm'>
                  <div className='w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0' />
                  <span className='text-foreground'>{f}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tip */}
          {current.tip && (
            <div className='bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5'>
              <p className='text-xs text-primary font-medium'>💡 Tip</p>
              <p className='text-xs text-muted-foreground mt-0.5'>{current.tip}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className='px-6 pb-6 space-y-3'>
          {/* Step dots */}
          <div className='flex items-center justify-center gap-1'>
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`rounded-full transition-all ${
                  i === step ? 'w-4 h-2 bg-primary' : 'w-2 h-2 bg-muted hover:bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className='flex items-center gap-2'>
            <Button 
              variant='outline' 
              size='sm' 
              onClick={() => go(-1)} 
              disabled={isFirst}
              className='flex-shrink-0'
            >
              <ChevronLeft className='w-4 h-4' />
            </Button>
            <Button 
              size='sm' 
              onClick={() => isLast ? onClose() : go(1)}
              className='flex-1'
            >
              {isLast ? 'Start exploring 💜' : (
                <span className='flex items-center gap-1'>Next <ChevronRight className='w-4 h-4' /></span>
              )}
            </Button>
          </div>

          {/* Skip */}
          {!isLast && (
            <button onClick={onClose} className='w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center'>
              Skip tour
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}