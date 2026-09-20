# Recording Checklist

## Before recording

- [ ] Mission Control UI open (`npm run demo`) and loaded successfully
- [ ] XO Space open in another tab/window
- [ ] Canonical demo baseline confirmed 15 pass / 1 fail (`npm run verify`)
- [ ] Verifier confirmed ready (`GET /api/status` shows `verifier.state: "ready"`)
- [ ] No secrets visible anywhere on screen (env vars, terminal history, browser tabs)
- [ ] Terminal font size readable on camera
- [ ] Browser zoom level appropriate (not so zoomed in that panels clip)
- [ ] OS/app notifications silenced
- [ ] Private/unrelated browser tabs closed
- [ ] Microphone checked (levels, no background noise)
- [ ] No production Promi or other business secrets visible anywhere on screen

## During recording

- [ ] Total runtime ≤ 3 minutes
- [ ] XO Space shown live while the real agent executes (not replay footage)
- [ ] Disposable sandbox / environment visible
- [ ] The actual worker/agent session visible
- [ ] Activity/tool-call actions visible
- [ ] File change and test result shown
- [ ] Promi Mission Control verification panel shown
- [ ] Final **PASS** verdict clearly visible on screen

## After recording

- [ ] Verify final recording length is within target
- [ ] Verify audio/video is readable (no clipped text, no inaudible narration)
- [ ] Upload as Unlisted on YouTube
- [ ] Add the video URL to the Devpost submission
