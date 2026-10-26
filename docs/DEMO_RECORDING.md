# OptiFlow demo recording

## Narration for Utter

Paste the full text from [DEMO_VOICEOVER.txt](DEMO_VOICEOVER.txt) into Utter. Use English, the Leo voice, and WAV output. The script is under Utter's 1,000 character request limit.

If you use the Utter API, set `UTTER_API_KEY` in your PowerShell session and run:

```powershell
./scripts/generate-utter-wav.ps1
```

This saves `demo/optiflow-voiceover.wav`. Keep the key out of the repository.

## Record the working app

1. Start the backend and frontend using the normal project commands. Confirm `http://localhost:3002/` and `http://localhost:3002/api/health` respond.
2. Run `node scripts/record-demo.mjs` from the repository root on a Windows desktop with Google Chrome installed. The recorder opens an isolated Chrome session, operates the real dashboard, and saves `demo/optiflow-demo.webm` plus current page captures in `demo/screenshots/`. If `demo/optiflow-voiceover.wav` exists, it is included in the recording; otherwise the video is silent.
3. Watch the whole video before submission. Check that the sidebar links, task tooltip, strategy slider, benchmark chart, surge buttons, and export are visible and that no solver error appears.

The capture follows this sequence: overview and metrics; Scheduling and a task tooltip; fairness and delay slider positions; Benchmarks; 200 task surge; 500 task stress test; JSON export; final overview.

The browser capture script uses a dedicated Chrome profile in `.tmp/demo-chrome-profile` and a local debugging port. It never uploads the recording.

If Chrome debugging is restricted on your computer, record manually in OBS: create a Window Capture source for the OptiFlow browser window, start recording, follow the sequence above, then stop recording after the export. The existing OBS scene on this machine captures a different app, so select the OptiFlow window before recording. If the WAV was generated separately, add it to the video in an editor before sharing.
