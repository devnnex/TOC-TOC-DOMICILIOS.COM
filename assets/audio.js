// One recoverable queue per page. An alert is acknowledged only after audio starts.
const played = new Set();
try {
  for (const key of JSON.parse(
    sessionStorage.getItem("toc-audio-played") || "[]",
  ))
    played.add(key);
} catch {}
const pending = new Map();
try {
  for (const [key, item] of JSON.parse(
    sessionStorage.getItem("toc-audio-pending") || "[]",
  ))
    if (!played.has(key) && Date.now() - item.at < 86400000)
      pending.set(key, item);
} catch {}
let context,
  unlocked = false,
  draining = false;
function persistPending() {
  try {
    sessionStorage.setItem("toc-audio-pending", JSON.stringify([...pending]));
  } catch {}
}
const visible = () =>
  typeof document === "undefined" || document.visibilityState !== "hidden";
function announce() {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("toc:audio-state", {
        detail: { enabled: sound.enabled, pending: pending.size },
      }),
    );
}
function remember(key) {
  played.add(key);
  while (played.size > 500) played.delete(played.values().next().value);
  try {
    sessionStorage.setItem("toc-audio-played", JSON.stringify([...played]));
  } catch {}
}
async function resume() {
  if (!context || context.state === "closed") return false;
  if (context.state === "running") return true;
  try {
    await Promise.race([
      context.resume(),
      new Promise((resolve) => setTimeout(resolve, 800)),
    ]);
  } catch {}
  announce();
  return context.state === "running";
}
function start(key, item) {
  if (!sound.enabled || !visible()) return false;
  const nodes = [];
  try {
    for (const [i, freq] of [659.25, 830.61, 987.77, 1318.5].entries()) {
      const osc = context.createOscillator(),
        gain = context.createGain(),
        at = context.currentTime + i * 0.13;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.22, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.42);
      osc.connect(gain);
      gain.connect(context.destination);
      nodes.push(osc);
      osc.start(at);
      osc.stop(at + 0.45);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    }
  } catch {
    for (const node of nodes)
      try {
        node.stop();
      } catch {}
    return false;
  }
  remember(key);
  pending.delete(key);
  persistPending();
  if (item.speak && "speechSynthesis" in globalThis) {
    setTimeout(() => {
      if (!visible()) return;
      try {
        const utterance = new SpeechSynthesisUtterance(item.message);
        utterance.lang = "es-CO";
        utterance.rate = 1;
        utterance.volume = 1;
        utterance.voice =
          speechSynthesis.getVoices().find((v) => v.lang === "es-CO") ||
          speechSynthesis.getVoices().find((v) => v.lang.startsWith("es")) ||
          null;
        // speak() queues; do not cancel another service's announcement.
        speechSynthesis.speak(utterance);
      } catch {}
    }, 520);
  }
  window.dispatchEvent(
    new CustomEvent("toc:audio-played", {
      detail: { key, message: item.message },
    }),
  );
  announce();
  return true;
}
async function drain() {
  if (draining || !pending.size || !unlocked || !visible()) return;
  draining = true;
  if (!(await resume())) {
    draining = false;
    return;
  }
  const [key, item] = pending.entries().next().value || [];
  if (!item || !start(key, item)) {
    draining = false;
    return;
  }
  setTimeout(() => {
    draining = false;
    drain();
  }, 1100);
}
export const sound = {
  get context() {
    return context;
  },
  get enabled() {
    return unlocked && context?.state === "running";
  },
  get pending() {
    return pending.size;
  },
  async enable() {
    try {
      if (!context || context.state === "closed") {
        context = new (
          globalThis.AudioContext || globalThis.webkitAudioContext
        )();
        context.onstatechange = () => {
          announce();
          if (context.state === "running") drain();
        };
      }
      unlocked = true;
      const running = await resume();
      announce();
      if (running) drain();
      return running;
    } catch {
      announce();
      return false;
    }
  },
  async alert(key, message, speak = true) {
    if (played.has(key)) return true;
    if (!pending.has(key)) pending.set(key, { message, speak, at: Date.now() });
    persistPending();
    announce();
    await drain();
    return played.has(key);
  },
  play(message, speak = true) {
    return this.alert(
      "test:" + Date.now() + ":" + Math.random(),
      message,
      speak,
    );
  },
};
if (typeof window !== "undefined") {
  const activate = (event) => {
    if (!event.isTrusted || navigator.userActivation?.isActive === false)
      return;
    if (
      event.type === "keydown" &&
      (event.repeat || !["Enter", " "].includes(event.key))
    )
      return;
    sound.enable();
  };
  document.addEventListener("click", activate, { capture: true });
  document.addEventListener("keydown", activate, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (visible() && unlocked) sound.enable();
  });
  window.addEventListener("pageshow", () => {
    if (unlocked) sound.enable();
  });
}
