const REPORT_EVERY = 8
const HANGOVER_FRAMES = 400

class EnergyGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.threshold = 0.006
    this.frames = 0
    this.peak = 0
    this.hangover = 0
    this.port.onmessage = (event) => {
      if (typeof event.data?.threshold === 'number') this.threshold = event.data.threshold
    }
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel || channel.length === 0) return true

    let sumSquares = 0
    for (let i = 0; i < channel.length; i++) sumSquares += channel[i] * channel[i]
    const rms = Math.sqrt(sumSquares / channel.length)
    if (rms > this.peak) this.peak = rms

    const isSpeech = rms >= this.threshold
    if (isSpeech) this.hangover = HANGOVER_FRAMES
    else if (this.hangover > 0) this.hangover--

    // Forward frames while speech is active AND through the hangover tail, so the
    // consumer can see the trailing silence that ends an utterance. Below threshold
    // with no hangover we send nothing at all — that is the idle-cost win.
    if (isSpeech || this.hangover > 0) {
      const copy = new Float32Array(channel)
      this.port.postMessage({ type: 'audio', pcm: copy, isSpeech }, [copy.buffer])
    }

    if (++this.frames >= REPORT_EVERY) {
      this.port.postMessage({ type: 'level', rms: this.peak, active: this.hangover > 0 })
      this.frames = 0
      this.peak = 0
    }
    return true
  }
}

registerProcessor('energy-gate', EnergyGateProcessor)
