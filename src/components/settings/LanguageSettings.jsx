// Settings → General → Language (v0.353.0).
//
// The app's translation layer (src/lib/i18n.js) is in place, but only the
// newer screens speak through it so far and English is the only finished
// language. This page says that honestly, lets the person pick from the
// languages that exist, and offers the translation check — a made-up
// language that shows which text is ready to be translated.
import React from "react";
import { FlaskConical } from "lucide-react";
import { Group, Row, SwitchRow } from "@/components/shared/SettingRows";
import {
  useLocale, LOCALES, CHECK_LOCALE, pickableLocales, setLocale, setTranslationCheck, localeCoverage,
} from "@/lib/i18n";
import { useTerms } from "@/lib/useTerms";

export default function LanguageSettings() {
  const terms = useTerms();
  const locale = useLocale();
  const checking = locale === CHECK_LOCALE;
  const codes = pickableLocales();

  return (
    <div className="space-y-2" data-tour="settings-language">
      <div className="flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
        <FlaskConical className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">In progress</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The app is being made ready for other languages. Only some screens can change language so far, and English is the only finished language. Anything not translated yet stays in English.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your own words from Terminology (like “{terms.alter}” and “{terms.fronting}”) stay yours in every language.
          </p>
        </div>
      </div>

      <Group title="App language" first>
        {codes.map((code) => {
          const cov = localeCoverage(code);
          const on = !checking && locale === code;
          return (
            <Row key={code} label={LOCALES[code].name}
              hint={cov.pct < 100 ? `${cov.pct}% translated` : code === "en" ? "The app's own language" : "Fully translated"}>
              <button type="button" role="radio" aria-checked={on} aria-label={LOCALES[code].name}
                onClick={() => setLocale(code)}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${on ? "border-primary" : "border-border"}`}>
                {on && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
              </button>
            </Row>
          );
        })}
        {codes.length < 2 && (
          <p className="text-xs text-muted-foreground py-2 leading-relaxed">
            More languages will appear here as they're added.
          </p>
        )}
      </Group>

      <Group title="Translation check">
        <SwitchRow label="Show what's ready to translate" checked={checking}
          hint="Translatable text shows as ⟦Ţéxţ⟧ across the app. Plain English is text that can't change language yet. This page stays readable."
          onChange={(v) => setTranslationCheck(v)} />
      </Group>
    </div>
  );
}
