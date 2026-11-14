let sharedAudioCtx: AudioContext | null = null;
let alarmIntervalId: number | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

export async function unlockOrderAlarmAudio(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

function playSingleTone(
  ctx: AudioContext,
  frequency: number,
  startOffsetSec: number,
  durationSec: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(frequency, ctx.currentTime + startOffsetSec);

  const start = ctx.currentTime + startOffsetSec;
  const peak = start + 0.025;
  const end = start + durationSec;

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.32, peak);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(start);
  osc.stop(end + 0.02);
}

function playReadyChimeCycle() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([260, 120, 260, 120, 320]);
    } catch {
      // ignore vibration errors
    }
  }

  const ctx = getAudioContext();
  if (!ctx) return;

  const triggerNotes = () => {
    // Crisp 4-note coffee-shop order-ready bell chime
    playSingleTone(ctx, 880, 0.0, 0.24); // A5
    playSingleTone(ctx, 1108.73, 0.16, 0.24); // C#6
    playSingleTone(ctx, 1318.51, 0.32, 0.32); // E6
    playSingleTone(ctx, 1760, 0.5, 0.45); // A6
  };

  if (ctx.state === 'suspended') {
    void ctx.resume().then(triggerNotes).catch(() => {
      // browser blocked autoplay until user interacts
    });
  } else {
    triggerNotes();
  }
}

export function startOrderReadyAlarm(): void {
  if (typeof window === 'undefined') return;
  if (alarmIntervalId !== null) return;

  playReadyChimeCycle();
  alarmIntervalId = window.setInterval(() => {
    playReadyChimeCycle();
  }, 2400);
}

export function stopOrderReadyAlarm(): void {
  if (typeof window !== 'undefined' && alarmIntervalId !== null) {
    window.clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(0);
    } catch {
      // ignore vibration cleanup errors
    }
  }
}
