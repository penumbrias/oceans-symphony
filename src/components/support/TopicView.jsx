import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CheckCircle, Circle, ChevronLeft, BookOpen, Loader2 } from "lucide-react";
import InteractiveExercise from "./InteractiveExercise";
import { format } from "date-fns";

// CURRICULUM DATA — all topics defined here with stable IDs
export const CURRICULUM = [
  {
    id: "m1",
    title: "Grounding — When, How, and Why",
    emoji: "⚓",
    topics: [
      {
        id: "m1_t1",
        title: "What is grounding?",
        content: [
          { type: "p", text: "Grounding helps you connect to the present moment when you're feeling too much or too little. It has two core parts: orienting (connecting to when and where you are) and anchoring (using your senses to connect to what's around you)." },
          { type: "p", text: "Signs you might need grounding: feeling disconnected, overwhelmed, numb, confused, like the past is happening again, or losing track of time. These are all completely understandable experiences, and there's no shame in needing support." },
          { type: "p", text: "Why it helps: grounding helps you think more clearly, notice your options, and feel calmer and more solid. It doesn't make everything okay — it just helps you find your footing again." },
          { type: "note", text: "Some of this content may bring up difficult feelings. Please feel free to pause, take a break, or come back to this later. There's no rush and no pressure." },
        ],
        exercise: {
          id: "m1_t1_what_ungrounded",
          title: "What does feeling ungrounded feel like for you?",
          fields: [
            { id: "response", label: "What does it feel like in your body when you're ungrounded? What do you notice in your thoughts or feelings?", placeholder: "Take your time. There's no right answer here.", type: "textarea", rows: 4 },
          ]
        }
      },
      {
        id: "m1_t2",
        title: "Orienting and anchoring practice",
        content: [
          { type: "p", text: "Orienting means asking yourself grounding questions — what time is it, where am I, how old am I. Anchoring means using your senses to describe what's around you in detail." },
          { type: "p", text: "The more detail you can put into your answers, the more anchoring effect it tends to have. This is a live practice exercise — try filling it in right now, in this moment." },
        ],
        exercise: {
          id: "m1_t2_orienting",
          title: "Orienting practice — fill this in right now",
          fields: [
            { id: "date", label: "What year, month, and day is it today?", placeholder: "e.g. 2025, April, Tuesday", type: "text" },
            { id: "age", label: "How old am I right now?", placeholder: "Your age", type: "text" },
            { id: "location", label: "Where am I right now? What is this place?", placeholder: "Describe where you are", type: "text" },
            { id: "see", label: "Name three things I can see right now", placeholder: "e.g. a lamp, a window, my hands", type: "textarea", rows: 2 },
            { id: "hear", label: "Name two things I can hear", placeholder: "e.g. traffic outside, the hum of the fridge", type: "textarea", rows: 2 },
            { id: "feel", label: "Name one thing I can physically feel", placeholder: "e.g. the chair under me, my feet on the floor", type: "text" },
          ]
        }
      },
      {
        id: "m1_t3",
        title: "Signs you're getting ungrounded",
        content: [
          { type: "p", text: "Mental signs: anxiety, racing thoughts, confusion, feeling scattered, trouble concentrating, feeling like things aren't real, losing track of time." },
          { type: "p", text: "Physical signs: shallow breathing, tingling, feeling numb or frozen, feeling outside your body, tunnel vision, heart speeding up." },
          { type: "p", text: "The earlier you notice these signs, the easier it is to help yourself. You might not notice right away — and that's okay. Over time, with practice, many people find they can catch it a little sooner." },
        ],
        exercise: {
          id: "m1_t3_signs",
          title: "Your personal signs and responses",
          fields: [
            { id: "mental_signs", label: "Which of the mental signs do I recognize in myself?", placeholder: "List any that feel familiar", type: "textarea", rows: 2 },
            { id: "physical_signs", label: "Which of the physical signs do I recognize?", placeholder: "List any that feel familiar", type: "textarea", rows: 2 },
            { id: "what_helps", label: "What healthy responses have worked for me, even a little?", placeholder: "Even small things count", type: "textarea", rows: 3 },
          ]
        }
      },
      {
        id: "m1_t4",
        title: "Building your grounding toolkit",
        content: [
          { type: "p", text: "Different techniques work at different times, and for different parts of a system. What helps with anxiety might be different from what helps with dissociation. What one alter finds calming might be too intense for another." },
          { type: "p", text: "Practicing when you're NOT overwhelmed makes techniques much more available when you need them. It's like rehearsal — the more familiar a technique feels, the easier it is to reach for it in a hard moment." },
        ],
        exercise: {
          id: "m1_t4_toolkit",
          title: "My grounding toolkit",
          fields: [
            { id: "techniques_tried", label: "Which techniques from the Support tab have I tried?", placeholder: "e.g. box breathing, 5-4-3-2-1, body scan...", type: "textarea", rows: 2 },
            { id: "what_helps", label: "Which ones have helped, even a little?", placeholder: "List anything that felt useful", type: "textarea", rows: 2 },
            { id: "want_to_try", label: "Which ones do I want to try next?", placeholder: "Anything that sounds interesting or worth exploring", type: "textarea", rows: 2 },
          ]
        }
      },
    ]
  },
  {
    id: "m2",
    title: "Separating Past from Present",
    emoji: "🕰️",
    topics: [
      {
        id: "m2_t1",
        title: "Why past and present get confused",
        content: [
          { type: "p", text: "After difficult experiences, the brain stays on high alert for danger. This can make present situations feel like the past is happening again — even when it isn't." },
          { type: "p", text: "This is not a fault or weakness. It's the brain doing exactly what it evolved to do: pattern-matching to protect you. It makes complete sense given what happened." },
          { type: "p", text: "Sights, sounds, smells, tones of voice, body sensations — any of these can act as reminders that pull the brain back to difficult times, without any deliberate thinking involved. The reaction happens before the thinking." },
          { type: "note", text: "This topic may bring up difficult feelings or memories. Please be gentle with yourself, and take a break whenever you need to." },
        ]
      },
      {
        id: "m2_t2",
        title: "How to separate past from present",
        content: [
          { type: "p", text: "The first step is always grounding — getting connected to the present moment before trying to look at the past. This gives you more capacity." },
          { type: "p", text: "Then, actively look for ways the present is different from the past: Who else is here? What options do you have now? What resources do you have that you didn't have before? How are you different now?" },
          { type: "p", text: "This isn't about pretending the past didn't happen. It's about helping the brain update — reminding it that the situation is actually different now." },
        ],
        exercise: {
          id: "m2_t2_resources",
          title: "What I have now that I didn't have before",
          fields: [
            { id: "strengths", label: "What strengths or abilities do I have now?", placeholder: "Skills, coping tools, knowledge about yourself...", type: "textarea", rows: 2 },
            { id: "people", label: "Who do I have around me now who is safe or helpful?", placeholder: "People, communities, supports...", type: "textarea", rows: 2 },
            { id: "options", label: "What options and choices do I have now?", placeholder: "Things you can do, ways you can respond...", type: "textarea", rows: 2 },
            { id: "different", label: "How am I different now from who I was then?", placeholder: "What has changed, what have you survived, what have you learned?", type: "textarea", rows: 2 },
          ]
        }
      },
      {
        id: "m2_t3",
        title: "Common thinking patterns that make this harder",
        content: [
          { type: "p", text: "**All-or-nothing thinking:** Seeing things as completely good or completely bad, with nothing in between. \"If it's not perfect, it's a failure.\" A gentler alternative: most things are somewhere in between, and that's okay." },
          { type: "p", text: "**Filtering out the positive:** Automatically discounting or not noticing what's going okay, while focusing intensely on what's wrong. A gentler alternative: both can be true at once." },
          { type: "p", text: "**Overgeneralizing:** Turning one difficult experience into a universal rule. \"This always happens.\" A gentler alternative: this happened this time. That's all that's actually known." },
          { type: "p", text: "**Jumping to negative conclusions:** Assuming the worst without evidence. A gentler alternative: slow down. What do you actually know right now?" },
          { type: "p", text: "**Harsh self-labeling:** \"I'm stupid / broken / a failure\" — treating a thing you did as a definition of who you are. A gentler alternative: I did something I regret. That's not who I am." },
          { type: "note", text: "These patterns developed for reasons. They were often ways of making sense of difficult experiences. They deserve curiosity, not criticism." },
        ],
        exercise: {
          id: "m2_t3_patterns",
          title: "Patterns I notice in myself",
          fields: [
            { id: "patterns", label: "Which of these thinking patterns do I recognize in myself?", placeholder: "No judgment — just noticing", type: "textarea", rows: 3 },
            { id: "friend", label: "What would I say to a friend who was thinking this way?", placeholder: "How would you respond to them with kindness?", type: "textarea", rows: 3 },
          ]
        }
      },
      {
        id: "m2_t4",
        title: "90/10 reactions",
        content: [
          { type: "p", text: "Sometimes a current situation triggers a very big feeling — bigger than the situation seems to call for. This can be confusing and disorienting." },
          { type: "p", text: "Often, that's because 90% of the feeling is coming from the past and only 10% from what's happening now. A current situation reminded the nervous system of something older and more painful." },
          { type: "p", text: "This is not weakness, and it's not \"overreacting.\" It makes complete sense given trauma history. The brain is doing exactly what it was trained to do." },
          { type: "p", text: "When you notice a very big reaction: pause, breathe, get grounded, get curious (what might this be reminding me of?), be compassionate with yourself." },
        ],
        exercise: {
          id: "m2_t4_9010",
          title: "Exploring a strong reaction",
          fields: [
            { id: "situation", label: "Think of a time you had a very strong reaction. What was the situation?", placeholder: "Just a brief description", type: "textarea", rows: 2 },
            { id: "past_connection", label: "What might have been coming from the past?", placeholder: "What might this situation have reminded you of?", type: "textarea", rows: 2 },
            { id: "difference", label: "How was the situation actually different from what happened before?", placeholder: "What was different about it, even slightly?", type: "textarea", rows: 2 },
          ]
        }
      },
    ]
  },
  {
    id: "m3",
    title: "Imagery Skills",
    emoji: "🌊",
    topics: [
      {
        id: "m3_t1",
        title: "How imagery helps",
        content: [
          { type: "p", text: "What we imagine affects how we feel — the brain responds to vivid imagination in many of the same ways it responds to real experience. This is why imagery techniques can be genuinely helpful." },
          { type: "p", text: "Imagery skills give us tools to work with feelings and memories more safely. They can help reduce the intensity of overwhelming states, create a felt sense of safety, and build internal resources over time." },
          { type: "p", text: "These skills take practice — that's completely normal and expected. They may feel awkward at first. Some people find visualization easier than others. Please go at your own pace." },
          { type: "note", text: "Try the techniques in the Support tab to get a feel for each one before or alongside working through these topics." },
        ]
      },
      {
        id: "m3_t2",
        title: "Peaceful place",
        content: [
          { type: "p", text: "A peaceful place is a mental image of somewhere — real or completely imagined — where you feel calm and safe. The more detailed you make it, the more useful it tends to be." },
          { type: "p", text: "Your peaceful place is yours. There are no rules about what it has to be. Some people visualize natural settings — forests, oceans, mountains. Others prefer cozy indoor spaces. Others create entirely fictional places." },
          { type: "p", text: "You can practice building this image when you're feeling relatively okay, so it's easier to access when you need it." },
        ],
        exercise: {
          id: "m3_t2_peaceful_place",
          title: "Describe your peaceful place",
          fields: [
            { id: "description", label: "Describe your peaceful place in as much detail as you like", placeholder: "What does it look like? What do you hear, smell, feel there?", type: "textarea", rows: 5 },
            { id: "how_it_feels", label: "How does it feel to be there?", placeholder: "What's the feeling in your body when you imagine this place?", type: "textarea", rows: 2 },
          ]
        }
      },
      {
        id: "m3_t3",
        title: "Split screen",
        content: [
          { type: "p", text: "The split screen technique helps separate memories of the past from what's happening now. It's particularly helpful when something in the present is triggering feelings that belong to an earlier time." },
          { type: "p", text: "The key image: a large, clear screen showing the present moment, and a small, slightly blurry corner showing the past. The present is bigger. The present is here." },
        ],
        exercise: {
          id: "m3_t3_split_screen",
          title: "Your split screen",
          fields: [
            { id: "present_screen", label: "What does the big present screen show for you?", placeholder: "Where are you? What's around you? What do you see?", type: "textarea", rows: 3 },
            { id: "past_corner", label: "What does the small past corner look like?", placeholder: "What appears there? What does it feel like to see it as small and blurry?", type: "textarea", rows: 3 },
          ]
        }
      },
      {
        id: "m3_t4",
        title: "Containment",
        content: [
          { type: "p", text: "Containment imagery is a way of safely setting aside overwhelming material until you have the resources and support to address it. It's not about suppressing feelings permanently — it's about managing their timing." },
          { type: "p", text: "The container you create needs to feel genuinely solid and secure. It can be anything: a vault, a chest, a safety deposit box, a jar with a tight lid, a safe buried deep in the earth." },
          { type: "p", text: "This is something you can practice developing when you're feeling okay, so the image is ready when you need it." },
        ],
        exercise: {
          id: "m3_t4_container",
          title: "Your containment image",
          fields: [
            { id: "container", label: "Describe your container in detail", placeholder: "What is it made of? How big is it? Where is it? How does it close?", type: "textarea", rows: 4 },
            { id: "feeling", label: "How does it feel to know these things are contained rather than gone?", placeholder: "Any thoughts or feelings about this", type: "textarea", rows: 2 },
          ]
        }
      },
      {
        id: "m3_t5",
        title: "Gauges and regulators",
        content: [
          { type: "p", text: "The gauge and regulator image gives you a way to visualize — and gently influence — the intensity of overwhelming feelings. The goal isn't to turn feelings off. It's to bring them to a more manageable level." },
          { type: "p", text: "This image can be used in the moment when feelings are becoming very intense. It can help create just enough space to think and make choices." },
        ],
        exercise: {
          id: "m3_t5_gauge",
          title: "Your gauge and regulator",
          fields: [
            { id: "gauge", label: "What does your gauge look like?", placeholder: "A thermometer? A pressure dial? Something else?", type: "textarea", rows: 2 },
            { id: "regulator", label: "What does your regulator or dial look like? What does it feel like to use it?", placeholder: "Describe the experience of turning it down slightly", type: "textarea", rows: 2 },
          ]
        }
      },
    ]
  },
  {
    id: "m4",
    title: "Managing Overwhelming Feelings",
    emoji: "🌊",
    topics: [
      {
        id: "m4_t1",
        title: "When feelings get very intense",
        content: [
          { type: "p", text: "Intense feelings can feel like emergencies. They can feel like they'll never end, like they're dangerous, like you can't survive them. These feelings are understandable — but feelings are not facts." },
          { type: "p", text: "Feelings always pass. Even very intense ones. Even the ones that feel permanent." },
          { type: "p", text: "Using several skills together helps more than any single technique on its own. Breathing + grounding + imagery together is more effective than any one alone." },
          { type: "note", text: "If you're in crisis right now, please go to the Support tab and scroll to the crisis resources. You don't have to go through this alone." },
        ]
      },
      {
        id: "m4_t2",
        title: "A plan for crisis-level feelings",
        content: [
          { type: "p", text: "Having a plan ready — written when you're calmer — gives you something to reach for when thinking clearly is harder." },
          { type: "p", text: "A suggested sequence: pause button → breathe → orient to present → separate past from present → containment imagery → remind yourself feelings pass → peaceful place or safe activity → give yourself care." },
          { type: "p", text: "Your plan might be different. What matters is that it's yours, and that you've thought about it in advance." },
        ],
        exercise: {
          id: "m4_t2_crisis_plan",
          title: "My personal plan for very intense feelings",
          fields: [
            { id: "first_steps", label: "When feelings get very intense, my first steps will be:", placeholder: "What will you try first? Second?", type: "textarea", rows: 3 },
            { id: "techniques", label: "Grounding and imagery techniques that help me:", placeholder: "From your toolkit so far", type: "textarea", rows: 2 },
            { id: "safe_activities", label: "Safe activities I can do to care for myself:", placeholder: "Things that help you feel a little better or more stable", type: "textarea", rows: 2 },
            { id: "reach_out", label: "People I can reach out to when I need support:", placeholder: "Anyone — a friend, a therapist, a crisis line", type: "textarea", rows: 2 },
          ]
        }
      },
      {
        id: "m4_t3",
        title: "Warning signs and safety planning",
        content: [
          { type: "p", text: "Noticing early warning signs gives you more time to use healthy skills before things escalate. The earlier you notice, the easier it is to help yourself." },
          { type: "p", text: "A safety plan isn't a sign of weakness — it's preparation. It's something your calmer self creates to help when thinking clearly is harder." },
          { type: "note", text: "This is one of the most important things you can build here. Take your time with it. You can come back and update it whenever you want." },
        ],
        exercise: {
          id: "m4_t3_safety_plan",
          title: "My warning signs safety plan",
          fields: [
            { id: "earliest_signs", label: "Earliest warning signs — thoughts, feelings, or behaviours I notice first:", placeholder: "What shows up before things get really hard?", type: "textarea", rows: 3 },
            { id: "earliest_response", label: "When I notice these, I will:", placeholder: "What will you do at this early stage?", type: "textarea", rows: 2 },
            { id: "increased_signs", label: "Signs that things are escalating:", placeholder: "What does it look like when things are getting harder?", type: "textarea", rows: 3 },
            { id: "increased_response", label: "When I notice these, I will:", placeholder: "What will you do at this stage?", type: "textarea", rows: 2 },
            { id: "emergency_signs", label: "Emergency signs — when things are at a crisis level:", placeholder: "What does it look like when you're at your limit?", type: "textarea", rows: 2 },
            { id: "emergency_response", label: "When I reach this level, I will:", placeholder: "Who will you contact? What crisis resources will you use?", type: "textarea", rows: 2 },
          ]
        }
      },
    ]
  },
  {
    id: "m5",
    title: "Self-Compassion",
    emoji: "🤍",
    topics: [
      {
        id: "m5_t1",
        title: "Why self-compassion matters for healing",
        content: [
          { type: "p", text: "Harsh self-criticism is painful, and it makes healing harder. When we're constantly judging and attacking ourselves, it's more difficult to learn new skills, take risks, or stay with the process." },
          { type: "p", text: "Being gentle with yourself — the way you'd naturally be with someone you care about — creates more safety inside. It makes it easier to look at difficult things, because you're not also being attacked for having them." },
          { type: "p", text: "Self-compassion doesn't mean excusing harmful behaviour or pretending things are okay when they're not. It means holding yourself with the same care and understanding you'd offer a dear friend." },
        ]
      },
      {
        id: "m5_t2",
        title: "Practicing self-compassion",
        content: [
          { type: "p", text: "**Be gentle:** Use a tone with yourself that you'd use with someone you love. Speak to yourself as you would to a frightened child, or a dear friend having a hard time." },
          { type: "p", text: "**Be curious:** Instead of judging, get curious. Why did that happen? What was I trying to do? What need was I trying to meet? Curiosity is more useful than condemnation." },
          { type: "p", text: "**Validate what's true:** Acknowledge what's genuinely hard without minimizing or dramatizing. \"This is really difficult\" is enough. It doesn't need to be \"and I'm terrible for struggling with it.\"" },
          { type: "p", text: "**Acknowledge context:** Trauma reactions make sense given trauma history. Responses that developed to survive difficult things make sense given those difficult things." },
        ],
        exercise: {
          id: "m5_t2_compassion",
          title: "A letter to yourself",
          fields: [
            { id: "to_friend", label: "What would you say to a friend going through exactly what you're going through right now?", placeholder: "Write as if you're talking to someone you love deeply", type: "textarea", rows: 4 },
            { id: "to_self", label: "Now say some of that to yourself. What do you most need to hear?", placeholder: "Even a sentence or two. Even just trying counts.", type: "textarea", rows: 4 },
          ]
        }
      },
      {
        id: "m5_t3",
        title: "Compassion for all parts of the system",
        content: [
          { type: "p", text: "For systems, self-compassion extends to all parts and alters. Each part developed for a reason — to protect, to survive, to carry something the system couldn't hold all at once." },
          { type: "p", text: "Even the parts that seem to cause trouble, or that feel hard to be with — they're doing what they believe will help. Sometimes the method is painful, but the intention underneath it often comes from a place of trying to protect." },
          { type: "p", text: "Compassion for the system doesn't mean forcing all parts to agree or feel the same. It means being curious about what each part needs, and looking for ways to meet those needs that work for everyone." },
          { type: "note", text: "This is Oceans Symphony content — specific to plural systems. If this doesn't apply to you, that's completely okay." },
        ],
        exercise: {
          id: "m5_t3_parts",
          title: "Compassion for parts",
          fields: [
            { id: "hard_part", label: "Is there a part of your system that feels hard to be with, or that carries something difficult?", placeholder: "No pressure to name anyone — just noticing", type: "textarea", rows: 2 },
            { id: "trying_to_do", label: "What might that part be trying to do or protect?", placeholder: "Even a guess is fine", type: "textarea", rows: 2 },
            { id: "needs", label: "What might they need?", placeholder: "What would help them feel safer or more understood?", type: "textarea", rows: 2 },
          ]
        }
      },
    ]
  },
  {
    id: "m6",
    title: "Understanding Cycles and Patterns",
    emoji: "🔄",
    topics: [
      {
        id: "m6_t1",
        title: "The cycle of difficult behaviour",
        content: [
          { type: "p", text: "When we're feeling overwhelmed, we sometimes do things that give short-term relief but make things harder in the long run. This isn't weakness or failure — it's a very understandable response to pain." },
          { type: "p", text: "The cycle has four parts: warning signs (what builds before things get really hard) → the tipping point (the moment that feels like too much) → the behaviour (whatever provides temporary relief) → the aftermath (short-term relief, then consequences that often restart the cycle)." },
          { type: "p", text: "Understanding your cycle isn't about blame. It's about finding the places where you have the most opportunity to help yourself. The earlier you intervene in the cycle, the easier it is." },
        ],
        exercise: {
          id: "m6_t1_cycle",
          title: "Map your own cycle",
          fields: [
            { id: "warning_signs", label: "Warning signs — what thoughts, feelings, or situations tend to build before things get hard?", placeholder: "What do you notice in the early stages?", type: "textarea", rows: 3 },
            { id: "tipping_point", label: "The tipping point — what tends to push things over the edge?", placeholder: "What makes it feel like too much?", type: "textarea", rows: 2 },
            { id: "behaviour", label: "What I tend to do to get relief:", placeholder: "Whatever provides short-term relief — no judgment here", type: "textarea", rows: 2 },
            { id: "aftermath", label: "What tends to happen afterward:", placeholder: "Short-term and longer-term", type: "textarea", rows: 2 },
          ]
        }
      },
      {
        id: "m6_t2",
        title: "Interrupting the cycle: coping cards",
        content: [
          { type: "p", text: "A coping card is a personal note to yourself — written when you're calm — about what to do when things get hard. When you're in the middle of a difficult moment, you often can't think clearly. Having something your calmer self prepared gives you something to reach for." },
          { type: "p", text: "You can create as many coping cards as you like — one for different situations, one for different parts of the system. Start with one that feels most useful." },
        ],
        exercise: {
          id: "m6_t2_coping_cards",
          title: "Build a coping card",
          fields: [
            { id: "situation", label: "When...", placeholder: "Describe the situation or trigger", type: "textarea", rows: 2 },
            { id: "old_response", label: "I used to... (or sometimes still do...)", placeholder: "The old response — no judgment", type: "textarea", rows: 2 },
            { id: "new_response", label: "I will try instead:", placeholder: "A concrete, healthy alternative", type: "textarea", rows: 2 },
            { id: "old_result", label: "What happened with the old way (fill in later if needed):", placeholder: "You can return and add this over time", type: "textarea", rows: 1 },
            { id: "new_result", label: "What happened when I tried something different:", placeholder: "You can return and add this over time", type: "textarea", rows: 1 },
          ]
        }
      },
      {
        id: "m6_t3",
        title: "Trauma-related reactions",
        content: [
          { type: "p", text: "In overwhelming situations, people often respond automatically — without consciously choosing to. Five common patterns: moving away (escaping the situation), pushing back (trying to stop what's happening), freezing (disconnecting, going still), going along (complying to prevent things getting worse), and seeing from the other side (taking the perspective of the person with power to feel some control)." },
          { type: "p", text: "None of these are wrong or weak. They make complete sense given what people have been through. The goal isn't to judge these responses — it's to notice them, so you can gradually have more choice." },
          { type: "p", text: "For systems: parts often carry different responses. One part may freeze while another fights. Understanding this can reduce inner conflict — each part was doing what they believed would help." },
        ],
        exercise: {
          id: "m6_t3_reactions",
          title: "Reactions I recognize",
          fields: [
            { id: "recognize", label: "Which of these responses do I recognize in myself or in parts of my system?", placeholder: "No judgment — just noticing what's familiar", type: "textarea", rows: 3 },
            { id: "situations", label: "What situations tend to bring them up?", placeholder: "What are the triggers or contexts?", type: "textarea", rows: 2 },
            { id: "notice_sooner", label: "What might help me notice sooner when this is happening?", placeholder: "Any early signs that this pattern is activating?", type: "textarea", rows: 2 },
          ]
        }
      },
    ]
  },
  {
    id: "m7",
    title: "Window of Tolerance",
    emoji: "🪟",
    topics: [
      {
        id: "m7_t1",
        title: "What is the window of tolerance?",
        content: [
          { type: "p", text: "Everyone has a range of emotional and physical sensation that feels manageable — not too much, not too little. This is sometimes called the window of tolerance." },
          { type: "p", text: "When something pushes us outside that window, we might feel flooded (too much — overwhelmed, panicking, flooded with feeling) or shut down (too little — numb, disconnected, dissociated, spaced out)." },
          { type: "p", text: "For people with trauma histories, this window is often narrower than it would otherwise be. Small things can push us outside it. This is not a character flaw — it's a result of the nervous system staying on high alert after difficult experiences." },
          { type: "p", text: "The good news: the window can widen over time, with practice and with support." },
        ],
        exercise: {
          id: "m7_t1_window_slider",
          title: "Where is your window right now?",
          fields: [
            { id: "too_much", label: "What does 'too much' feel like for you? (flooding, overwhelm, panic)", placeholder: "Describe what this state is like for you", type: "textarea", rows: 2 },
            { id: "too_little", label: "What does 'too little' feel like for you? (numb, shut down, dissociated)", placeholder: "Describe what this state is like for you", type: "textarea", rows: 2 },
            { id: "window_size", label: "How wide does your window feel right now? (0 = very narrow, 10 = quite wide)", type: "slider", min: 0, max: 10, minLabel: "Very narrow", maxLabel: "Quite wide" },
          ]
        }
      },
      {
        id: "m7_t2",
        title: "Recognizing your edges",
        content: [
          { type: "p", text: "The earlier you notice you're approaching the edge of your window, the easier it is to help yourself. Warning signs look different for everyone." },
          { type: "p", text: "Physical signs might be: heart speeding up, breathing becoming shallow, tension building in the body, feeling shaky or frozen. Emotional signs might be: sudden irritability, feeling detached, everything feeling urgent. Cognitive signs: thoughts racing, mind going blank, difficulty concentrating." },
          { type: "p", text: "There's no failure in noticing these late. Noticing at all is a skill, and it gets easier with practice." },
        ],
        exercise: {
          id: "m7_t2_edges",
          title: "Recognizing your edges",
          fields: [
            { id: "too_much_signs", label: "What are the earliest signs I'm heading toward 'too much'?", placeholder: "Physical, emotional, or cognitive signs", type: "textarea", rows: 3 },
            { id: "too_little_signs", label: "What are the earliest signs I'm heading toward 'too little'?", placeholder: "Physical, emotional, or cognitive signs", type: "textarea", rows: 3 },
            { id: "earliest", label: "What is the very first sign I notice — the smallest, earliest warning?", placeholder: "Even very subtle things count", type: "textarea", rows: 2 },
          ]
        }
      },
      {
        id: "m7_t3",
        title: "A personal plan for staying in your window",
        content: [
          { type: "p", text: "This exercise pulls everything together into a personal plan — five levels, from calm to crisis, with what you notice at each level and what helps at each level." },
          { type: "p", text: "This becomes one of your most important personal documents. You can return to it, update it, and share it with therapists or supporters if you choose." },
          { type: "note", text: "This is also accessible from the main Support tab as 'My window of tolerance plan' once you've saved it." },
        ],
        exercise: {
          id: "m7_t3_window_plan",
          title: "My window of tolerance plan",
          fields: [
            { id: "level1_notice", label: "Level 1 — Calm and okay: What I notice", placeholder: "Thoughts, feelings, body sensations when you're doing well", type: "textarea", rows: 2 },
            { id: "level1_helps", label: "Level 1 — What helps me stay here", placeholder: "What maintains or supports this state?", type: "textarea", rows: 1 },
            { id: "level2_notice", label: "Level 2 — Starting to feel stressed: What I notice", placeholder: "First signs of stress or difficulty", type: "textarea", rows: 2 },
            { id: "level2_helps", label: "Level 2 — What helps at this stage", placeholder: "What can you do at this early stage?", type: "textarea", rows: 1 },
            { id: "level3_notice", label: "Level 3 — Stress increasing: What I notice", placeholder: "What does this level feel like?", type: "textarea", rows: 2 },
            { id: "level3_helps", label: "Level 3 — What helps at this stage", placeholder: "What skills or actions help here?", type: "textarea", rows: 1 },
            { id: "level4_notice", label: "Level 4 — Approaching my edge: What I notice", placeholder: "What does it feel like when you're getting close to overwhelm?", type: "textarea", rows: 2 },
            { id: "level4_helps", label: "Level 4 — What helps at this stage", placeholder: "What do you need here?", type: "textarea", rows: 1 },
            { id: "level5_notice", label: "Level 5 — At or over my edge: What I notice", placeholder: "What does crisis or shutdown feel like for you?", type: "textarea", rows: 2 },
            { id: "level5_helps", label: "Level 5 — What helps at this stage", placeholder: "Who to contact, what resources to use", type: "textarea", rows: 2 },
          ]
        }
      },
    ]
  },
  {
    id: "m8",
    title: "Working with Feelings",
    emoji: "💙",
    topics: [
      {
        id: "m8_t1",
        title: "Why feelings can feel frightening",
        content: [
          { type: "p", text: "For people who experienced trauma, especially early in life, emotions may have felt dangerous. Perhaps showing feelings wasn't safe. Perhaps they were punished or shamed. Perhaps the adults around them couldn't handle their own feelings, let alone anyone else's." },
          { type: "p", text: "This means many people with trauma histories learned — for very good reasons — to suppress, avoid, or disconnect from feelings. The problem is that when we block out the feelings we don't want, we tend to block out many of the ones we do want as well." },
          { type: "p", text: "Feelings are not dangerous. They're information. They're signals trying to get your attention. Learning to hear those signals, at a manageable pace, is part of healing. There is no rush here." },
          { type: "note", text: "This is slow, gentle work. Please take it at whatever pace feels okay." },
        ],
        exercise: {
          id: "m8_t1_feelings_hard",
          title: "Feelings that feel difficult",
          fields: [
            { id: "hard_feelings", label: "Which feelings feel hard to have, or 'not allowed'?", placeholder: "No judgment — just noticing", type: "textarea", rows: 3 },
            { id: "body_response", label: "What happens in your body when you try to feel them?", placeholder: "Anything you notice", type: "textarea", rows: 2 },
          ]
        }
      },
      {
        id: "m8_t2",
        title: "Naming what you feel",
        content: [
          { type: "p", text: "**Sadness** — heaviness, aching around the chest or throat, heaviness in the limbs. Sadness often signals a sense of loss — something or someone that mattered." },
          { type: "p", text: "**Happiness / joy** — lightness, energy, a sense of expansion. Signals something good is happening or has happened." },
          { type: "p", text: "**Anger** — tightness in the chest, shoulders, or jaw; heat; faster breathing. Signals something feels unfair, wrong, or not okay." },
          { type: "p", text: "**Fear / anxiety** — racing heart, shallow breathing, stomach tension, wanting to escape. Signals something feels threatening." },
          { type: "p", text: "**Shame** — heat in the face, wanting to hide or disappear. Often triggered by thoughts of being fundamentally bad or wrong." },
          { type: "p", text: "**Guilt** — stomach tension, a pull to repair or make amends. Related to something done, not something you are. Guilt says 'I did something I regret.' Shame says 'I am bad.' They're very different." },
          { type: "p", text: "**Numbness / disconnection** — flatness, distance, feeling far away from yourself. Often the nervous system's way of protecting from overwhelm." },
        ],
        exercise: {
          id: "m8_t2_naming",
          title: "Practice noticing right now",
          fields: [
            { id: "feeling_now", label: "Right now, what do you feel?", placeholder: "Even if it's hard to name — a guess is fine", type: "text" },
            { id: "where_in_body", label: "Where do you feel it in your body?", placeholder: "Any physical sensations you notice", type: "textarea", rows: 2 },
            { id: "name_it", label: "If you had to give it a name, what would you call it?", placeholder: "Any word or phrase that fits", type: "text" },
          ]
        }
      },
      {
        id: "m8_t3",
        title: "Compassion for all parts of the system",
        content: [
          { type: "p", text: "For systems, working with feelings means working with all the parts who carry them. Different alters often hold different emotional experiences — one part may carry joy while another carries grief. One part may feel nothing while another feels everything at once." },
          { type: "p", text: "This isn't dysfunction. It's a way the system found to survive. Each part carries what they carry for a reason." },
          { type: "p", text: "Self-compassion for the system means being curious about what each part is feeling rather than judging it, recognizing that parts who seem difficult are usually trying to protect, and making space for different parts to have different experiences." },
          { type: "p", text: "Working toward cooperation doesn't mean forcing agreement. It means getting curious about what each part needs, and looking for ways to meet those needs that work for everyone." },
          { type: "note", text: "This topic is specific to plural systems. If this doesn't apply to you, feel free to skip it." },
        ],
        exercise: {
          id: "m8_t3_parts_feelings",
          title: "Parts and feelings",
          fields: [
            { id: "part_carrying", label: "Is there a part of your system that carries a feeling you find hard?", placeholder: "You don't have to name them if you don't want to", type: "textarea", rows: 2 },
            { id: "trying_to_do", label: "What might that part be trying to do?", placeholder: "What might they be protecting? Even a guess is fine.", type: "textarea", rows: 2 },
            { id: "what_needs", label: "What might they need?", placeholder: "What might help them feel safer or more heard?", type: "textarea", rows: 2 },
          ]
        }
      },
    ]
  },
  {
    id: "m9",
    title: "Shame and Healing-Focused Thinking",
    emoji: "🌱",
    topics: [
      {
        id: "m9_t1",
        title: "Understanding shame",
        content: [
          { type: "p", text: "Shame is one of the most painful human experiences — and one of the most common for people who have been through trauma. Shame often came from things that were done to people, not from them. And yet it lodges in the self, feeling like a fundamental truth about who we are." },
          { type: "p", text: "It's important to distinguish shame from guilt: guilt is 'I did something I wish I hadn't' — it can motivate repair and change. Shame is 'I am bad, broken, undeserving' — it tends to shut us down and keep us stuck." },
          { type: "p", text: "Shame often isn't based in truth — it's a residue of trauma. It feels absolutely real and completely true. But feelings, even very intense ones, are not always accurate information about who we are." },
          { type: "p", text: "A useful thing to notice: people who are genuinely 'bad' generally don't feel bad about it. Feeling shame and guilt about your actions is actually a sign of a conscience — of caring about how you affect others and yourself." },
          { type: "note", text: "This topic can bring up a lot. Please be very gentle with yourself as you work through it. Take breaks whenever you need to." },
        ],
        exercise: {
          id: "m9_t1_shame",
          title: "Working with shame",
          fields: [
            { id: "shaming_thoughts", label: "What shaming thoughts do you notice about yourself?", placeholder: "The ones that feel true but are very harsh", type: "textarea", rows: 3 },
            { id: "to_friend", label: "What would you say to a friend who believed those things about themselves?", placeholder: "How would you respond to them?", type: "textarea", rows: 3 },
            { id: "to_self", label: "Can you say any of that to yourself?", placeholder: "Even a small part of it, even tentatively", type: "textarea", rows: 2 },
          ]
        }
      },
      {
        id: "m9_t2",
        title: "Trauma-based thoughts and healing-focused alternatives",
        content: [
          { type: "p", text: "Trauma-based thoughts feel completely true but are based on experiences of being hurt — not on what's actually true about who you are or what you deserve." },
          { type: "p", text: "Examples: 'I am fundamentally bad or broken.' 'I don't deserve good things.' 'People will always hurt me.' 'My needs don't matter.' 'It's not safe to feel good.' 'I caused what happened to me.'" },
          { type: "p", text: "None of these are true, even when they feel absolutely certain." },
          { type: "p", text: "Healing-focused alternatives aren't toxic positivity — they're more honest and fair: 'I've been hurt. Being hurt doesn't make me bad.' 'I deserve the same care I would give someone I love.' 'Not everyone is unsafe. I can learn to notice the difference.' 'What happened to me was not my fault.' 'I'm allowed to have needs. Everyone is.'" },
        ],
        exercise: {
          id: "m9_t2_alternatives",
          title: "Building healing-focused alternatives",
          fields: [
            { id: "trauma_thoughts", label: "Thoughts that feel true but might be trauma-based:", placeholder: "List any that come to mind", type: "textarea", rows: 4 },
            { id: "alternatives", label: "A more fair, healing-focused way of thinking about this:", placeholder: "Even partial alternatives, even 'maybe...' — anything more fair", type: "textarea", rows: 4 },
          ]
        }
      },
      {
        id: "m9_t3",
        title: "Allowing good feelings",
        content: [
          { type: "p", text: "For many people with trauma histories, feeling good can itself feel dangerous. Perhaps good things were always followed by bad things. Perhaps feeling happy made you a target. Perhaps you learned that you didn't deserve good feelings." },
          { type: "p", text: "These are understandable adaptations. But they can become barriers to healing — and to having a life that feels worth living." },
          { type: "p", text: "Allowing good feelings doesn't mean pretending bad things didn't happen. It means making small amounts of space, gradually, for things that feel okay. A moment of warmth. A small pleasure." },
          { type: "p", text: "You don't have to believe you deserve this yet. You can act as if, just a little, and see what happens." },
        ],
        exercise: {
          id: "m9_t3_good_feelings",
          title: "Making space for good feelings",
          fields: [
            { id: "feels_okay", label: "What's one small thing that sometimes feels okay or even good?", placeholder: "Anything at all — even very small things count", type: "textarea", rows: 2 },
            { id: "what_blocks", label: "What gets in the way of letting yourself have it?", placeholder: "Any thoughts, feelings, or fears that arise", type: "textarea", rows: 2 },
            { id: "a_little_more", label: "What might it look like to let yourself have just a little more of it?", placeholder: "Even a small step", type: "textarea", rows: 2 },
          ]
        }
      },
    ]
  },
  {
    id: "m11",
    title: "Understanding Triggers",
    emoji: "🧩",
    topics: [
      {
        id: "m11_t1",
        title: "What triggers are and how they work",
        content: [
          { type: "p", text: "A trigger is anything that activates a strong emotional, physical, or behavioural response — often one that feels bigger than the current situation seems to call for. Triggers can be sounds, smells, tones of voice, body positions, words, images, times of year, or almost anything else." },
          { type: "p", text: "Triggers work by association. Something in the present resembles something from the past — often at a sensory or emotional level rather than a conscious one. The brain recognizes the pattern and responds as if the past situation is happening again." },
          { type: "p", text: "This is not a choice or a weakness. It's the result of how the brain stores and retrieves information about threatening situations. The response makes complete sense given what happened — the brain is doing exactly what it evolved to do." },
          { type: "p", text: "For systems, different parts may be triggered by different things — what activates one part may have no effect on another. Understanding this can reduce inner conflict when it seems like parts are reacting 'for no reason.'" },
          { type: "note", text: "Take this topic slowly. If you feel yourself getting activated while reading, pause and use a grounding technique before continuing." },
        ],
        exercise: {
          id: "m11_t1_triggers_intro",
          title: "What I know about my triggers",
          fields: [
            { id: "known_triggers", label: "Triggers I'm already aware of — situations, things, or experiences that tend to set off a strong reaction:", placeholder: "No need to list all of them — just any you already know about", type: "textarea", rows: 4 },
            { id: "body_first", label: "Often the body notices a trigger before the mind does. What does being triggered feel like in your body?", placeholder: "Anything you notice physically", type: "textarea", rows: 3 },
          ]
        }
      },
      {
        id: "m11_t2",
        title: "Internal and external triggers",
        content: [
          { type: "p", text: "External triggers come from the environment: a smell, a specific tone of voice, a location, a date or anniversary, physical contact, a news story, certain words." },
          { type: "p", text: "Internal triggers come from within: a particular emotion (for example, feeling happy might trigger fear that something bad will follow), a body sensation, a memory that arises, a thought, even a dream." },
          { type: "p", text: "Internal triggers can be harder to identify because they don't have an obvious external cause. If you're suddenly flooded with feelings and can't see a reason, it may be an internal trigger — the nervous system responding to something inside." },
          { type: "p", text: "Neither type is more 'valid' or more understandable than the other. Both are real, and both make sense." },
        ],
        exercise: {
          id: "m11_t2_trigger_types",
          title: "External and internal triggers",
          fields: [
            { id: "external", label: "External triggers I'm aware of:", placeholder: "Things in the environment that tend to affect me", type: "textarea", rows: 3 },
            { id: "internal", label: "Internal triggers I'm aware of:", placeholder: "Feelings, body sensations, or thoughts that can set things off", type: "textarea", rows: 3 },
            { id: "hard_to_identify", label: "Are there times when you're triggered but can't find a reason? What does that feel like?", placeholder: "Just noticing — no need to explain it", type: "textarea", rows: 2 },
          ]
        }
      },
      {
        id: "m11_t3",
        title: "Working with triggered states",
        content: [
          { type: "p", text: "When you're triggered, the most helpful thing is to return to the present — not to fight the reaction, analyze it, or push through. The reaction makes sense. It just needs to know that this moment is different from then." },
          { type: "p", text: "A four-step approach: notice (something is happening — I may be triggered), pause (press the internal pause button), ground (return to the present using senses or breath), then gently orient (where am I? when is it? what is different now?)." },
          { type: "p", text: "After the triggered state eases, you may find it helpful to reflect: what was the trigger? What did it remind me of? What does that part of me need?" },
          { type: "p", text: "Over time, as you build this skill, triggered states may become slightly less intense or slightly shorter. But this is slow work — be patient with yourself and your system." },
        ],
        exercise: {
          id: "m11_t3_working_with_triggers",
          title: "My plan for triggered moments",
          fields: [
            { id: "notice_signs", label: "The earliest signs I notice that I may be triggered (before it gets very intense):", placeholder: "Physical, emotional, or cognitive signs", type: "textarea", rows: 3 },
            { id: "first_steps", label: "When I notice I'm triggered, my first steps will be:", placeholder: "e.g. pause, breathe, ground...", type: "textarea", rows: 2 },
            { id: "after", label: "After a triggered state eases, what might help me care for myself?", placeholder: "Self-care, grounding, gentle activity...", type: "textarea", rows: 2 },
          ]
        }
      },
    ]
  },
  {
    id: "m12",
    title: "Inner Communication and Cooperation",
    emoji: "🤝",
    topics: [
      {
        id: "m12_t1",
        title: "Understanding inner communication",
        content: [
          { type: "p", text: "For people with plural systems, internal communication — how different parts relate to and connect with each other — is a central part of functioning and healing." },
          { type: "p", text: "Inner communication can happen in many ways: thoughts that seem to come from somewhere else, emotional states that shift without an obvious external cause, images, inner voices, sensations. Every system is different." },
          { type: "p", text: "Many people find that inner communication improves gradually over time — not by forcing it, but by creating internal conditions of safety and curiosity." },
          { type: "p", text: "A helpful starting place: treating all parts with the same patience and respect you'd want for yourself. This doesn't mean agreeing with everything every part does. It means recognizing that each part developed for a reason, and that understanding their perspective is valuable." },
          { type: "note", text: "This module is written specifically for plural systems. If this doesn't apply to you, feel free to skip it." },
        ]
      },
      {
        id: "m12_t2",
        title: "Listening to different parts",
        content: [
          { type: "p", text: "Listening to a part of your system doesn't require knowing who they are, having a name for them, or being able to 'see' them clearly. It can be as simple as noticing what feelings, impulses, or thoughts seem to be coming up, and being curious about what they might be communicating." },
          { type: "p", text: "Questions to ask with curiosity rather than judgment: What is this part trying to do? What do they seem to need? What might they be afraid of? What do they want me to know?" },
          { type: "p", text: "Not all parts will answer immediately. Some may be reluctant, frightened, or mistrustful. That's understandable — trust develops over time, not all at once." },
          { type: "p", text: "There's no single 'right' way to do this. Journaling, drawing, internal dialogue, or simply sitting quietly with an open, curious attitude can all be forms of listening." },
        ],
        exercise: {
          id: "m12_t2_listening",
          title: "Practice listening",
          fields: [
            { id: "part_present", label: "Is there a part of your system who seems present or active lately?", placeholder: "You don't need to know their name or role — just what you notice", type: "textarea", rows: 2 },
            { id: "what_doing", label: "What might they be trying to do or communicate?", placeholder: "Even a guess or a feeling", type: "textarea", rows: 2 },
            { id: "what_need", label: "What might they need?", placeholder: "What would help them feel safer or more heard?", type: "textarea", rows: 2 },
            { id: "your_response", label: "What would you want to say to them, if you could?", placeholder: "A message from the rest of your system", type: "textarea", rows: 3 },
          ]
        }
      },
      {
        id: "m12_t3",
        title: "Working toward cooperation",
        content: [
          { type: "p", text: "Cooperation in a system doesn't mean that all parts agree all the time, or that everyone is always happy. It means that parts can increasingly work together — or at least not actively work against each other — in ways that are less distressing for everyone." },
          { type: "p", text: "Cooperation often grows through: understanding each part's role and function, negotiating agreements about things that affect everyone (such as safety behaviours), finding ways for parts who want different things to each get something they need, and building a sense of shared experience and shared safety." },
          { type: "p", text: "Progress is often slow and non-linear. Some weeks things may feel more connected; other weeks more fragmented. Both are normal." },
          { type: "p", text: "Working with a trauma-specialist therapist can be particularly helpful for this aspect of the work. This module is meant to support and complement that, not replace it." },
        ],
        exercise: {
          id: "m12_t3_cooperation",
          title: "Building cooperation",
          fields: [
            { id: "conflicts", label: "Are there ongoing inner conflicts — parts who seem to want opposite things, or whose actions affect others negatively?", placeholder: "No need to go into detail — just what you're aware of", type: "textarea", rows: 3 },
            { id: "each_needs", label: "What might each side of the conflict need?", placeholder: "Even a guess — what might each part be trying to protect or get?", type: "textarea", rows: 3 },
            { id: "small_step", label: "What might a very small step toward cooperation look like?", placeholder: "Something small and safe — not a complete resolution, just a beginning", type: "textarea", rows: 2 },
          ]
        }
      },
      {
        id: "m12_t4",
        title: "Building internal safety",
        content: [
          { type: "p", text: "Internal safety means that different parts of the system feel safe enough inside — not threatened by each other, not in constant crisis, not fighting for resources or control." },
          { type: "p", text: "Internal safety often develops when: all parts know that their existence is acknowledged, all parts have some sense that their needs matter, there are agreements in place about safety (especially around crisis situations), and there is a shared understanding that all parts are trying to help, even when their methods are painful." },
          { type: "p", text: "The inner safe place visualization can be used as a shared resource — a place inside where all parts can rest. Building this takes time, and different parts may respond to it differently." },
          { type: "p", text: "Notice any parts who respond well to safety imagery, and any who don't. The ones who don't often have good reasons — they may have learned that 'safe' wasn't real. Patience and curiosity are more helpful than pushing." },
        ],
        exercise: {
          id: "m12_t4_inner_safety",
          title: "Building toward inner safety",
          fields: [
            { id: "what_helps_safety", label: "What has helped create a sense of safety inside — even just a little?", placeholder: "Grounding, agreements, imagery, something else?", type: "textarea", rows: 3 },
            { id: "what_threatens", label: "What tends to make things feel less safe internally?", placeholder: "Situations, feelings, inner dynamics...", type: "textarea", rows: 2 },
            { id: "one_thing", label: "Is there one small thing that might help build more internal safety?", placeholder: "An agreement, a change, something you could try", type: "textarea", rows: 2 },
          ]
        }
      },
    ]
  },
  {
    id: "m13",
    title: "Daily Structure and Rest",
    emoji: "🌙",
    topics: [
      {
        id: "m13_t1",
        title: "Why daily structure matters",
        content: [
          { type: "p", text: "For people with trauma histories, the nervous system is often stuck in a state of high alert. One of the ways we can signal safety to the nervous system is through predictable, gentle structure — a rhythm to the day that it can learn to trust." },
          { type: "p", text: "Structure doesn't mean rigidity. It means creating enough predictability that you're not constantly making decisions from scratch or dealing with the extra stress of an unpredictable environment." },
          { type: "p", text: "Even very simple anchors can help: waking at a similar time, eating at regular intervals, having a small ritual that marks the beginning and end of the day. These things communicate to the nervous system: there is order here. Things are manageable." },
          { type: "p", text: "For plural systems, structure can also reduce switching and confusion — knowing what the plan is gives all parts something to orient to." },
        ],
        exercise: {
          id: "m13_t1_structure",
          title: "My daily anchors",
          fields: [
            { id: "current_anchors", label: "What regular anchors do I already have in my day?", placeholder: "e.g. morning coffee, regular bedtime, mealtimes — even small ones count", type: "textarea", rows: 2 },
            { id: "what_helps", label: "What helps my day feel more manageable when I have it?", placeholder: "Routine, predictability, particular activities...", type: "textarea", rows: 2 },
            { id: "one_anchor", label: "One small anchor I could add or strengthen:", placeholder: "Something small and realistic", type: "text" },
          ]
        }
      },
      {
        id: "m13_t2",
        title: "Sleep, rest, and nighttime",
        content: [
          { type: "p", text: "Sleep difficulties are very common after trauma — nightmares, hypervigilance at night, difficulty falling asleep, waking frequently. These are direct effects of how trauma affects the nervous system and how it processes experience during sleep." },
          { type: "p", text: "Some things that may help: keeping a fairly consistent sleep and wake time even on days when sleep was poor; avoiding screens in the hour before sleep; having a brief, calming routine before bed to signal the nervous system that the day is ending; leaving a light on if complete darkness feels unsafe; keeping a notebook by the bed if thoughts or memories often arise at night." },
          { type: "p", text: "If nightmares or night-time distress are severe, this is something to discuss with a therapist — there are specific approaches for working with trauma-related sleep disturbance." },
          { type: "p", text: "Rest is not the same as sleep. Rest means time when you're not producing, achieving, or managing something difficult. Moments of genuine ease — reading, a walk, music, quiet — count as rest and matter for recovery." },
          { type: "note", text: "If you wake distressed from a nightmare: switch on a light, name the room you're in, use a grounding technique from the Support tab. Remind yourself: that was then. I am here, now, in this moment." },
        ],
        exercise: {
          id: "m13_t2_sleep",
          title: "Sleep and rest",
          fields: [
            { id: "sleep_challenges", label: "What makes sleep or nighttime difficult for me?", placeholder: "Nightmares, difficulty sleeping, fear, other...", type: "textarea", rows: 2 },
            { id: "what_helps_sleep", label: "What has helped even a little with sleep?", placeholder: "Anything — even very small things", type: "textarea", rows: 2 },
            { id: "bedtime_routine", label: "What might a calming pre-sleep routine look like for me?", placeholder: "Small, realistic steps", type: "textarea", rows: 2 },
            { id: "rest", label: "What counts as rest for me — genuine ease, not just stopping work?", placeholder: "Activities or moments that feel genuinely restorative", type: "textarea", rows: 2 },
          ]
        }
      },
      {
        id: "m13_t3",
        title: "Sustainable self-care",
        content: [
          { type: "p", text: "Self-care in the context of trauma recovery means meeting basic needs consistently — sleep, food, movement, human connection — not performing wellness." },
          { type: "p", text: "For many people, self-care can feel uncomfortable, undeserved, or even dangerous. These feelings make sense given trauma history. If caring for yourself was associated with shame or punishment, or if you learned that your needs didn't matter, self-care can feel foreign or threatening." },
          { type: "p", text: "Starting small helps. Not a full self-care regime, but one small act of care — drinking a glass of water, stepping outside briefly, eating something nourishing — done consistently, without requiring that it 'feel right.'" },
          { type: "p", text: "Notice what you do when you're having a hard time. Do you tend to eat less, isolate, stop sleeping? Knowing your patterns means you can sometimes catch them earlier and offer yourself something different." },
          { type: "p", text: "For plural systems: self-care works best when it's something all parts can engage with, or at least not actively resist. It can help to ask: is there a way to meet the system's needs here, not just one part's?" },
        ],
        exercise: {
          id: "m13_t3_selfcare",
          title: "Sustainable self-care",
          fields: [
            { id: "basic_needs", label: "How do I tend to do with basic needs — sleep, food, movement, connection?", placeholder: "Which are easier? Which are harder?", type: "textarea", rows: 3 },
            { id: "hard_times", label: "What happens to my self-care when I'm struggling?", placeholder: "What do I tend to stop doing, or do more of?", type: "textarea", rows: 2 },
            { id: "one_act", label: "One small, consistent act of care I could offer myself:", placeholder: "Small enough that it's realistic even on a hard day", type: "text" },
            { id: "feels_like", label: "What does it feel like to think about caring for yourself?", placeholder: "Any feelings or thoughts that come up — comfortable, uncomfortable, anything", type: "textarea", rows: 2 },
          ]
        }
      },
    ]
  },
  {
    id: "m10",
    title: "Building on Progress",
    emoji: "🌟",
    topics: [
      {
        id: "m10_t1",
        title: "Recognizing how far you've come",
        content: [
          { type: "p", text: "Change from trauma work is often slow and non-linear. Progress shows up in small ways — a moment of pausing before reacting, a time when grounding helped, a moment of gentleness toward yourself." },
          { type: "p", text: "It's easy to focus on what's still hard and miss how much has shifted. This topic invites looking back." },
          { type: "note", text: "This reflection can be returned to and updated as many times as you like." },
        ],
        exercise: {
          id: "m10_t1_progress",
          title: "Looking back",
          fields: [
            { id: "before_after", label: "What was hardest before? What's a little different now?", placeholder: "Even very small changes count", type: "textarea", rows: 3 },
            { id: "skills_used", label: "Which skills have I used? Which ones helped?", placeholder: "Anything from your toolkit", type: "textarea", rows: 2 },
            { id: "understand_now", label: "What do I understand about myself now that I didn't before?", placeholder: "Any insights, however small", type: "textarea", rows: 2 },
          ]
        }
      },
      {
        id: "m10_t2",
        title: "Your ongoing toolkit",
        content: [
          { type: "p", text: "Everything you've built across the Learn section lives in your saved responses — your window of tolerance plan, your coping cards, your safety plan, your peaceful place description, your containment image, your list of techniques that help." },
          { type: "p", text: "The 'My Reflections' tab in the Learn section gives you access to all of your saved responses, organized by module. You can return to any of them any time." },
          { type: "p", text: "The most important ones — your safety plan and window of tolerance plan — are also accessible from the main Support tab." },
        ],
        exercise: {
          id: "m10_t2_toolkit_note",
          title: "A note to myself about my toolkit",
          fields: [
            { id: "most_helpful", label: "The skills and tools that have been most helpful for me:", placeholder: "Your personal favourites", type: "textarea", rows: 3 },
            { id: "want_to_practice", label: "What I want to keep practicing:", placeholder: "Anything you want to return to", type: "textarea", rows: 2 },
          ]
        }
      },
      {
        id: "m10_t3",
        title: "Keeping going",
        content: [
          { type: "p", text: "This curriculum is a beginning, not an ending. The skills here take years to integrate fully, and that's completely normal. Some days will be harder than others. Progress isn't a straight line." },
          { type: "p", text: "What matters is returning — returning to the skills, returning to self-compassion, returning to curiosity about what's happening inside. There's no completion requirement here. You can stay with any topic as long as you need to, revisit anything that was useful, and come back after a break." },
          { type: "p", text: "If you're working with a therapist, these materials can be a helpful complement to that work. If you're not, and things feel too heavy to hold alone, please reach out — the crisis resources in the Support tab are always there." },
          { type: "p", text: "You are worth the effort of healing. Step by step." },
          { type: "note", text: "Thank you for being here." },
        ],
        exercise: {
          id: "m10_t3_ongoing",
          title: "What I want to remember",
          fields: [
            { id: "keep_going", label: "What do I want to keep practicing? What do I want to come back to? What do I want to remember?", placeholder: "A personal note to your future self", type: "textarea", rows: 5 },
          ]
        }
      },
    ]
  },
];

export default function TopicView({ topic, moduleId, onBack, onTryTechnique }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const { data: progressRecords = [] } = useQuery({
    queryKey: ["learningProgress"],
    queryFn: () => base44.entities.LearningProgress.list(),
  });

  const myProgress = progressRecords.find(p => p.topic_id === topic.id);

  useEffect(() => {
    if (myProgress?.notes) setNotes(myProgress.notes);
  }, [myProgress?.id]);

  const handleToggleComplete = async () => {
    const now = new Date().toISOString();
    if (myProgress) {
      await base44.entities.LearningProgress.update(myProgress.id, {
        completed: !myProgress.completed,
        completed_date: !myProgress.completed ? now : null,
      });
    } else {
      await base44.entities.LearningProgress.create({
        module_id: moduleId,
        topic_id: topic.id,
        completed: true,
        completed_date: now,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["learningProgress"] });
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    if (myProgress) {
      await base44.entities.LearningProgress.update(myProgress.id, { notes });
    } else {
      await base44.entities.LearningProgress.create({
        module_id: moduleId,
        topic_id: topic.id,
        completed: false,
        notes,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["learningProgress"] });
    setSavingNotes(false);
  };

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6 pb-12">
      <div>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3 transition-colors">
          <ChevronLeft className="w-3 h-3" /> Back to module
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-4 h-4 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">{topic.title}</h2>
            </div>
          </div>
          <button
            onClick={handleToggleComplete}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex-shrink-0 ${
              myProgress?.completed
                ? "bg-green-500/10 text-green-600 border-green-500/30"
                : "bg-card text-muted-foreground border-border hover:border-primary/40"
            }`}
          >
            {myProgress?.completed ? <CheckCircle className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
            {myProgress?.completed ? "Completed" : "Mark complete"}
          </button>
        </div>
      </div>

      {/* Content blocks */}
      <div className="space-y-4">
        {topic.content?.map((block, i) => {
          if (block.type === "note") {
            return (
              <div key={i} className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                <p className="text-sm text-primary/80 italic">{block.text}</p>
              </div>
            );
          }
          // Handle bold markdown inline
          const parts = block.text.split(/\*\*(.*?)\*\*/g);
          return (
            <p key={i} className="text-sm text-foreground leading-relaxed">
              {parts.map((part, j) =>
                j % 2 === 1 ? <strong key={j}>{part}</strong> : part
              )}
            </p>
          );
        })}
      </div>

      {/* Technique link */}
      {topic.techniqueLink && onTryTechnique && (
        <div className="bg-card border border-border/60 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Try the guided exercise</p>
            <p className="text-xs text-muted-foreground">{topic.techniqueLink}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => onTryTechnique(topic.techniqueLink)}>
            Try now →
          </Button>
        </div>
      )}

      {/* Interactive exercise */}
      {topic.exercise && (
        <InteractiveExercise
          exerciseId={topic.exercise.id}
          exerciseTitle={topic.exercise.title}
          fields={topic.exercise.fields}
        />
      )}

      {/* Personal notes */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">My notes on this topic</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="What I learned, what I want to remember, anything I want to come back to..."
          rows={3}
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground">Only visible to you</p>
          <Button size="sm" variant="outline" onClick={handleSaveNotes} disabled={savingNotes}>
            {savingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save notes"}
          </Button>
        </div>
      </div>

      {/* Bottom complete button */}
      <div className="pt-2 border-t border-border/40">
        <p className="text-xs text-muted-foreground mb-3 text-center">Take as much time as you need. There's no rush and no pressure.</p>
        <Button
          onClick={handleToggleComplete}
          variant={myProgress?.completed ? "outline" : "default"}
          className="w-full"
        >
          {myProgress?.completed ? "✓ Marked as complete — click to undo" : "Mark this topic as complete"}
        </Button>
      </div>
    </div>
  );
}