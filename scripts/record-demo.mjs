import { spawn } from 'node:child_process'
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const root = process.cwd()
const output = path.join(root, 'demo')
const screenshotDirectory = path.join(output, 'screenshots')
const chromeProfile = path.join(root, '.tmp', 'demo-chrome-profile')
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const port = 9228
const width = 1440
const height = 900
const recordingName = 'optiflow-demo.webm'

await mkdir(output, { recursive: true })
await mkdir(screenshotDirectory, { recursive: true })
await mkdir(chromeProfile, { recursive: true })
const voiceover = await stat(path.join(output, 'optiflow-voiceover.wav')).catch(() => null)
if (!voiceover) console.warn('No voiceover WAV found; recording will be silent.')

// If existing recording file exists, safely unlink to allow fresh recording
await unlink(path.join(output, recordingName)).catch(() => {})

const site = await fetch('http://127.0.0.1:3002/').catch(() => null)
if (!site?.ok) throw new Error('Start the OptiFlow frontend on port 3002 before recording.')

let chrome
try {
  chrome = spawn(chromePath, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${chromeProfile}`,
    `--window-size=${width},${height}`, '--force-device-scale-factor=1',
    '--no-first-run', '--disable-default-apps', '--autoplay-policy=no-user-gesture-required',
    'http://127.0.0.1:3002/',
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
} catch (error) {
  throw new Error('Windows blocked Chrome from starting.', { cause: error })
}
let chromeError = ''
chrome.on('error', error => { chromeError = error.message })
chrome.stderr.on('data', data => { chromeError = (chromeError + data.toString()).slice(-3000) })

let socket
let nextId = 0
const pending = new Map()
let capturing = false

async function waitForDebugEndpoint() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (chromeError.includes('EPERM')) throw new Error('Windows blocked Chrome from starting.')
    if (chrome.exitCode !== null) throw new Error(`Chrome exited before recording. ${chromeError}`)
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = pages.find(item => item.type === 'page' && item.url.startsWith('http://127.0.0.1:3002'))
      if (page) return page.webSocketDebuggerUrl
    } catch { /* Chrome is starting */ }
    await sleep(200)
  }
  throw new Error(`Chrome debugging endpoint did not start. ${chromeError}`)
}

function command(method, params = {}) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 30000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
  return response.result?.value
}

async function waitFor(expression, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${expression}`)
}

async function click(expression) {
  const found = await evaluate(`(() => { const element = ${expression}; if (!element) return false; element.click(); return true })()`)
  if (!found) throw new Error(`Element not found: ${expression}`)
}

async function phase(label, holdMs, screenshotName) {
  await evaluate(`if (window.__demo) window.__demo.label = ${JSON.stringify(label)}`)
  console.log(label)
  if (screenshotName) {
    const leadMs = Math.min(1600, Math.floor(holdMs / 2))
    await sleep(leadMs)
    const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(path.join(screenshotDirectory, screenshotName), Buffer.from(screenshot.data, 'base64'))
    await sleep(holdMs - leadMs)
  } else await sleep(holdMs)
}

async function captureLoop() {
  while (capturing) {
    try {
      const screenshot = await command('Page.captureScreenshot', { format: 'jpeg', quality: 80, captureBeyondViewport: false })
      const imageUrl = `data:image/jpeg;base64,${screenshot.data}`
      await evaluate(`new Promise(resolve => {
        const image = new Image();
        image.onload = () => {
          const demo = window.__demo;
          if (!demo) return resolve(false);
          demo.context.drawImage(image, 0, 0, ${width}, ${height});
          demo.context.fillStyle = 'rgba(16,40,35,.94)';
          demo.context.fillRect(0, ${height - 46}, ${width}, 46);
          demo.context.fillStyle = '#fff';
          demo.context.font = '600 19px Segoe UI, Arial, sans-serif';
          demo.context.fillText(demo.label, 24, ${height - 17});
          demo.track.requestFrame();
          resolve(true);
        };
        image.onerror = () => resolve(false);
        image.src = ${JSON.stringify(imageUrl)};
      })`)
    } catch (error) {
      // frame skipped
    }
    await sleep(150)
  }
}

try {
  socket = new WebSocket(await waitForDebugEndpoint())
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (!message.id) return
    const request = pending.get(message.id)
    if (!request) return
    clearTimeout(request.timer)
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })

  await command('Page.enable')
  await command('Runtime.enable')
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: output, eventsEnabled: true })
  await waitFor(`Boolean(document.querySelector('nav a[href*="benchmarks"]'))`)
  await waitFor(`!document.body.textContent.includes('Awaiting results') && !document.body.textContent.includes('…')`, 60000)

  await evaluate(`(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = ${width}; canvas.height = ${height};
    const context = canvas.getContext('2d');
    const track = canvas.captureStream(0).getVideoTracks()[0];
    const stream = new MediaStream([track]);
    let audioSource = null;
    let audioDurationMs = 0;
    if (${Boolean(voiceover)}) {
      try {
        const audioContext = new AudioContext();
        const audioResponse = await fetch('/demo/optiflow-voiceover.wav');
        if (audioResponse.ok) {
          const buffer = await audioContext.decodeAudioData(await audioResponse.arrayBuffer());
          const destination = audioContext.createMediaStreamDestination();
          audioSource = audioContext.createBufferSource();
          audioSource.buffer = buffer;
          audioSource.connect(destination);
          destination.stream.getAudioTracks().forEach(audioTrack => stream.addTrack(audioTrack));
          audioDurationMs = buffer.duration * 1000;
          await audioContext.resume();
        }
      } catch (err) {
        console.warn('Audio decoding skipped:', err);
      }
    }
    const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8'].find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2800000 });
    const chunks = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = ${JSON.stringify(recordingName)};
      document.body.append(link); link.click(); link.remove();
      window.__demo.fileSize = blob.size;
    };
    window.__demo = { canvas, context, track, recorder, label: 'OptiFlow | Operations overview', audioEndsAt: performance.now() + audioDurationMs };
    recorder.start(1000);
    audioSource?.start();
    return true;
  })()`)
  capturing = true
  const frames = captureLoop()

  // SCENE 1: Overview and live WASM solver metrics
  await phase('01 / Operations Overview | Edge WebAssembly MILP solver & 50 task workload', 6500, 'overview.png')

  // SCENE 2: Allocation Board Tooltips and Strategy Slider
  const location = await evaluate(`(() => { const task = document.querySelector('button[aria-label*="assigned to"]'); if (!task) return null; const box = task.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 } })()`)
  if (location && location.x > 0 && location.x < width && location.y > 0 && location.y < height) {
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: location.x, y: location.y })
    await phase('02 / Allocation Board | Priority legend & interactive operational tooltips', 4500, 'task-tooltip.png')
  }

  await evaluate(`document.querySelector('[role="slider"]')?.focus()`)
  await command('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35 })
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End', windowsVirtualKeyCode: 35 })
  await phase('03 / Multi-Objective Strategy | Max staff fairness triggers instant WASM re-solve', 5000, 'fairness.png')

  await command('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 })
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 })
  await phase('04 / Multi-Objective Strategy | Min delay & Pareto trade-off frontier', 4500, 'min-delay.png')

  // SCENE 3: Scheduling Studio & Constraint Violation Alerts
  await click(`document.querySelector('nav a[href*="scheduling"]')`)
  await sleep(1500)
  await phase('05 / Scheduling Studio | Operator registry, task queues & constraint auditing', 4000, 'scheduling.png')

  // Trigger manual override check on scheduling page
  await evaluate(`(() => {
    const selects = document.querySelectorAll('select');
    if (selects.length >= 2) {
      selects[1].selectedIndex = 1;
      selects[1].dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`)
  await sleep(1000)
  await phase('06 / Real-Time Audit Engine | Instant visual constraint violation alerts', 4500)

  // SCENE 4: Empirical Benchmarks & Burst Tests
  await click(`document.querySelector('nav a[href*="benchmarks"]')`)
  await sleep(1500)
  await phase('07 / Empirical Benchmarks | MILP (0.0% violations) vs Heuristic Baselines', 6000, 'benchmarks.png')

  // Run live benchmark
  await click(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Run Live Benchmark'))`)
  await sleep(3500)

  // Back to overview for surge and stress test
  await click(`document.querySelector('nav a[href*="overview"]')`)
  await sleep(1000)

  await click(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('200 Tasks'))`)
  await waitFor(`!Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('500 Tasks'))?.disabled`, 60000)
  await phase('08 / Operational Surge | 200 conflicting requests optimized at the edge', 4500, 'surge.png')

  await click(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('500 Tasks'))`)
  await waitFor(`!Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('200 Tasks'))?.disabled`, 90000)
  await phase('09 / Stress Test | 500 requests solved with certified bounds', 5000, 'stress-test.png')

  await click(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Export Results') || button.textContent.includes('Export results'))`)
  await phase('10 / Data Export | Schedules and Pareto telemetry exported to JSON', 3500)

  await click(`document.querySelector('nav a[href*="overview"]')`)
  await phase('OptiFlow | Mathematically proven schedules with zero server latency', 4000)

  if (voiceover) {
    const remainingMs = await evaluate(`Math.max(0, window.__demo ? window.__demo.audioEndsAt - performance.now() + 1000 : 0)`)
    if (remainingMs > 0 && remainingMs < 60000) await sleep(remainingMs)
  }

  capturing = false
  await frames
  await evaluate(`window.__demo?.recorder.stop()`)

  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const file = await stat(path.join(output, recordingName))
      if (file.size > 100000) { console.log(`Saved ${recordingName}: ${file.size} bytes`); break }
    } catch { /* waiting for write */ }
    await sleep(250)
  }
  const file = await stat(path.join(output, recordingName))
  if (file.size < 100000) throw new Error('Recorded video is unexpectedly small')
} finally {
  capturing = false
  try { await command('Browser.close') } catch { chrome?.kill() }
  socket?.close()
}
