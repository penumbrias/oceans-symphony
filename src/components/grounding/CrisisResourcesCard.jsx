import { useState } from "react";

const RESOURCES = [
  {
    region: "🇺🇸 In the US",
    items: [
      { name: "988 Suicide & Crisis Lifeline", detail: "Call or text 988", href: "tel:988" },
      { name: "Crisis Text Line", detail: "Text HOME to 741741", href: "sms:741741?body=HOME" },
      { name: "Trans Lifeline", detail: "877-565-8860", href: "tel:8775658860" },
      { name: "The Trevor Project", detail: "Call 1-866-488-7386 or text START to 678-678 (LGBTQ+ youth)", href: "tel:18664887386" },
      { name: "RAINN", detail: "1-800-656-4673 or rainn.org (sexual assault support)", href: "tel:18006564673" },
    ]
  },
  {
    region: "🌍 International",
    items: [
      { name: "International Association for Suicide Prevention", detail: "iasp.info/resources/Crisis_Centres — crisis centers by country", href: "https://www.iasp.info/resources/Crisis_Centres/" },
      { name: "Befrienders Worldwide", detail: "befrienders.org", href: "https://www.befrienders.org" },
    ]
  },
  {
    region: "🧠 Dissociative disorders",
    items: [
      { name: "ISSTD Find a Therapist", detail: "isstd.connectedcommunity.org — therapists trained in trauma and dissociation", href: "https://isstd.connectedcommunity.org" },
    ]
  }
];

export default function CrisisResourcesCard() {
  const [showResources, setShowResources] = useState(false);

  return (
    <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 rounded-2xl p-4 space-y-3">
      <p className="text-sm font-medium text-rose-700 dark:text-rose-400">
        🤍 You don't have to go through this alone.
      </p>

      {!showResources ? (
        <button
          onClick={() => setShowResources(true)}
          className="text-sm text-rose-600 dark:text-rose-400 hover:underline transition-colors"
        >
          Would you like to see some support resources?
        </button>
      ) : (
        <div className="space-y-4">
          {RESOURCES.map((section) => (
            <div key={section.region} className="space-y-2">
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wide">
                {section.region}
              </p>
              {section.items.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  target={item.href?.startsWith("http") ? "_blank" : undefined}
                  rel={item.href?.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="block space-y-0.5 rounded-lg -mx-2 px-2 py-1.5 hover:bg-rose-100/60 dark:hover:bg-rose-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                >
                  <p className="text-sm font-medium text-rose-800 dark:text-rose-300 underline decoration-rose-300/60 underline-offset-2">{item.name}</p>
                  <p className="text-xs text-rose-600 dark:text-rose-400">{item.detail}</p>
                </a>
              ))}
            </div>
          ))}
          <p className="text-xs text-rose-600 dark:text-rose-500 italic pt-1">
            Reaching out is a sign of strength, not weakness. You deserve support.
          </p>
          <button
            onClick={() => setShowResources(false)}
            className="text-xs text-rose-500 hover:underline"
          >
            Hide resources
          </button>
        </div>
      )}
    </div>
  );
}