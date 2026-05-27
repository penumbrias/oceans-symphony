// Web Worker entry — runs the analytics SystemMap's heavy layout
// computation off the main thread so very large systems can render
// without freezing the page.
//
// Lifecycle is managed by useSystemMapLayout: the hook terminates the
// worker on each new compute request, so this file deliberately does
// NOT do its own request bookkeeping. Receives one message, computes,
// posts the result, and is then torn down or sent another input.

import { computeFullLayout } from "../lib/systemMapCompute.js";

self.onmessage = (event) => {
  const data = event.data || {};
  if (data.type !== "compute") return;
  const { input, config } = data;
  try {
    // Phase ping so the UI can show a "computing layout…" state. We only
    // ping once at the start; the compute itself is a single tight loop
    // with no natural yield points, so a streaming progress bar would be
    // dishonest. Use the spinner; let it run.
    self.postMessage({ type: "progress", phase: "computing" });
    const result = computeFullLayout(input, config);
    self.postMessage({ type: "result", result });
  } catch (err) {
    self.postMessage({
      type: "error",
      error: err && err.message ? err.message : String(err),
    });
  }
};
